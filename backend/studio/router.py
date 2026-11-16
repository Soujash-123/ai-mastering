"""Mastering Table (BETA) routes — EARLY_ACCESS and ADMIN only.

The browser plays the *AI master* through a live Web Audio layer, so edits are
heard instantly; these routes only load/save the session, run the copilot and
commit/revert the rendered result. After the first commit the untouched AI
master is kept as `master_ai.wav` so edits never stack on edits.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from pathlib import Path
from typing import Annotated, Any, Optional

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from api.master_ops import finish_publish, publish_master, render_lock
from api.result_builder import _metadata_snapshot
from api.schemas import JobStatus
from auth.dependencies import require_roles
from auth.models import User
from auth.schemas import UserRole
from mastering.chain import playback_wav_path
from mastering.preview import load_render_context
from services.job_store import JobRecord, job_store
from studio.agent import CopilotUnavailable, build_song_context, run_copilot
from studio.render import render_session_file
from studio.session import apply_ops, load_session, normalize_session, public_spec, save_session

LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/api/jobs/{job_id}/studio", tags=["studio"])

StudioUser = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.EARLY_ACCESS))]

AI_MASTER = "master_ai.wav"
META_FILENAME = "studio_meta.json"
PEAK_BUCKETS = 1600


# --- request models ----------------------------------------------------------

class SessionBody(BaseModel):
    session: dict[str, Any]


class AgentMessage(BaseModel):
    role: str
    content: str = Field(max_length=4000)


class Selection(BaseModel):
    start_sec: float
    end_sec: float


class AgentRequest(BaseModel):
    messages: list[AgentMessage] = Field(min_length=1, max_length=40)
    session: dict[str, Any]
    playhead_sec: Optional[float] = None
    selection: Optional[Selection] = None


# --- helpers -----------------------------------------------------------------

def invalidate_studio_snapshot(job_dir: Path) -> None:
    """A new AI master (re-finalize) replaces the Table's base."""
    for name in (AI_MASTER, playback_wav_path(AI_MASTER).name, META_FILENAME):
        (job_dir / name).unlink(missing_ok=True)
    session = load_session(job_dir)
    if session.get("committed"):
        session["committed"] = False
        save_session(job_dir, session)


async def _studio_job(job_id: str, user: User) -> JobRecord:
    rec = await job_store.get(job_id)
    if not rec or (
        rec.user_id is not None and rec.user_id != user.id and user.role != UserRole.ADMIN.value
    ):
        raise HTTPException(status_code=404, detail="Job not found")
    if rec.status != JobStatus.completed:
        raise HTTPException(status_code=409, detail="Job not completed")
    if not rec.input_path or not rec.master_path or not Path(rec.master_path).exists():
        raise HTTPException(status_code=409, detail="The master is no longer available")
    return rec


def _job_dir(rec: JobRecord) -> Path:
    assert rec.input_path is not None
    return rec.input_path.parent


def _base_path(job_dir: Path) -> Path:
    snap = job_dir / AI_MASTER
    return snap if snap.exists() else job_dir / "master.wav"


def _measure(path: Path) -> dict[str, Any]:
    y, sr = sf.read(str(path), always_2d=True, dtype="float32")
    mono_peak = np.max(np.abs(y), axis=1)
    n = len(mono_peak)
    edges = np.linspace(0, n, PEAK_BUCKETS + 1).astype(int)
    peaks = [float(mono_peak[a:b].max()) if b > a else 0.0 for a, b in zip(edges[:-1], edges[1:])]
    try:
        lufs = float(pyln.Meter(sr).integrated_loudness(y))
        lufs = lufs if np.isfinite(lufs) else None
    except Exception:  # noqa: BLE001
        lufs = None
    return {
        "duration_sec": n / sr,
        "sample_rate": int(sr),
        "lufs": lufs,
        "peaks": [round(p, 4) for p in peaks],
    }


def _studio_meta(job_dir: Path, input_path: Path) -> dict[str, Any]:
    """Waveform + loudness for the base and original (cached per base file)."""
    base = _base_path(job_dir)
    key = f"{base.name}:{base.stat().st_mtime_ns}"
    cache = job_dir / META_FILENAME
    try:
        cached = json.loads(cache.read_text(encoding="utf-8"))
        if cached.get("key") == key:
            return cached
    except Exception:  # noqa: BLE001
        pass
    base_m = _measure(base)
    original_lufs = None
    if input_path.exists():
        try:
            y, sr = sf.read(str(input_path), always_2d=True, dtype="float32")
            original_lufs = float(pyln.Meter(sr).integrated_loudness(y))
            original_lufs = original_lufs if np.isfinite(original_lufs) else None
        except Exception:  # noqa: BLE001
            original_lufs = None
    meta = {"key": key, **base_m, "original_lufs": original_lufs}
    try:
        cache.write_text(json.dumps(meta), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass
    return meta


def _analysis(rec: JobRecord) -> dict[str, Any]:
    if isinstance(rec.analysis, dict) and rec.analysis:
        return rec.analysis
    snap = _metadata_snapshot(rec)
    return snap.get("analysis") or {}


def _sections(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for row in analysis.get("sectional_analysis") or []:
        try:
            out.append(
                {
                    "section": str(row.get("section", "")),
                    "start_sec": float(row.get("start_sec", 0.0)),
                    "end_sec": float(row.get("end_sec", 0.0)),
                }
            )
        except (TypeError, ValueError, AttributeError):
            continue
    return out


# --- routes ------------------------------------------------------------------

@router.get("")
async def get_studio(job_id: str, user: StudioUser) -> dict[str, Any]:
    rec = await _studio_job(job_id, user)
    job_dir = _job_dir(rec)
    meta = await asyncio.to_thread(_studio_meta, job_dir, rec.input_path)
    session = load_session(job_dir, meta["duration_sec"])
    analysis = _analysis(rec)
    base = _base_path(job_dir)
    base_playback = playback_wav_path(base)
    # After a commit, /files/master serves the *edited* master; the live layer
    # must always sit on the untouched AI master snapshot.
    if base.name == AI_MASTER:
        name = base_playback.name if base_playback.exists() else base.name
        base_url = f"/api/jobs/{job_id}/artifacts/{name}"
    else:
        base_url = f"/api/jobs/{job_id}/files/master"
    base_url += f"?v={base.stat().st_mtime_ns}"
    return {
        "job_id": job_id,
        "title": rec.original_filename or "Untitled",
        "session": session,
        "spec": public_spec(),
        "base_url": base_url,
        "original_url": f"/api/jobs/{job_id}/files/input",
        "duration_sec": meta["duration_sec"],
        "sample_rate": meta["sample_rate"],
        "base_lufs": meta["lufs"],
        "original_lufs": meta["original_lufs"],
        "peaks": meta["peaks"],
        "sections": _sections(analysis),
        "style": {
            "family": analysis.get("style_family", "auto"),
            "label": analysis.get("style_label", ""),
        },
        "committed": bool(session.get("committed")),
        "finalizing": rec.finalizing,
        "finalize_error": rec.finalize_error,
    }


@router.put("/session")
async def put_session(job_id: str, body: SessionBody, user: StudioUser) -> dict[str, Any]:
    rec = await _studio_job(job_id, user)
    job_dir = _job_dir(rec)
    duration = float(sf.info(str(_base_path(job_dir))).duration)
    current = load_session(job_dir, duration)
    session = normalize_session(body.session, duration)
    # Any edit after a commit means the downloadable master no longer matches.
    session["committed"] = bool(current.get("committed")) and _same_edit(current, session)
    save_session(job_dir, session)
    return {"session": session}


def _same_edit(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return a.get("modules") == b.get("modules") and a.get("regions") == b.get("regions")


@router.post("/agent")
async def studio_agent(job_id: str, body: AgentRequest, user: StudioUser) -> dict[str, Any]:
    rec = await _studio_job(job_id, user)
    job_dir = _job_dir(rec)
    duration = float(sf.info(str(_base_path(job_dir))).duration)
    session = normalize_session(body.session, duration)
    analysis = _analysis(rec)
    ctx = load_render_context(job_dir) or {}
    snap = _metadata_snapshot(rec) if not rec.safe_intent else {}
    song = build_song_context(
        analysis=analysis,
        safe_intent=rec.safe_intent or snap.get("safe_intent"),
        report=rec.report or snap.get("report"),
        dsp_params=ctx.get("params"),
        duration_sec=duration,
    )
    selection = body.selection.model_dump() if body.selection else None
    try:
        reply, ops = await asyncio.to_thread(
            run_copilot,
            history=[m.model_dump() for m in body.messages],
            song_context=song,
            session=session,
            playhead_sec=body.playhead_sec,
            selection=selection,
        )
    except CopilotUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        LOGGER.exception("Copilot failed for job %s", job_id)
        raise HTTPException(status_code=502, detail="The Mastering Copilot could not respond. Try again.") from exc

    new_session, changes, proposals = apply_ops(session, ops, duration)
    if changes:
        new_session["committed"] = False
    save_session(job_dir, new_session)
    return {"reply": reply, "session": new_session, "changes": changes, "proposals": proposals}


async def _ensure_snapshot(job_dir: Path) -> Path:
    snap = job_dir / AI_MASTER
    if not snap.exists():
        master = job_dir / "master.wav"
        await asyncio.to_thread(shutil.copy2, master, snap)
        playback = playback_wav_path(master)
        if playback.exists():
            await asyncio.to_thread(shutil.copy2, playback, playback_wav_path(snap))
    return snap


async def _run_commit(job_id: str, session: dict[str, Any]) -> None:
    try:
        rec = await job_store.get(job_id)
        if not rec or not rec.input_path:
            return
        job_dir = _job_dir(rec)
        master = job_dir / "master.wav"
        async with render_lock(job_id):
            snap = await _ensure_snapshot(job_dir)
            await asyncio.to_thread(render_session_file, snap, master, session)
            updates = await publish_master(rec, master)
        # The user may have kept editing during the render: only mark the
        # session committed if it still matches what was rendered.
        current = load_session(job_dir)
        if _same_edit(current, normalize_session(session)):
            current["committed"] = True
            save_session(job_dir, current)
        await finish_publish(job_id, updates)
    except Exception as exc:  # noqa: BLE001
        LOGGER.exception("Studio commit failed for job %s", job_id)
        await job_store.update(job_id, finalizing=False, finalize_error=str(exc))


async def _run_revert(job_id: str) -> None:
    try:
        rec = await job_store.get(job_id)
        if not rec or not rec.input_path:
            return
        job_dir = _job_dir(rec)
        snap = job_dir / AI_MASTER
        master = job_dir / "master.wav"
        async with render_lock(job_id):
            await asyncio.to_thread(shutil.copy2, snap, master)
            snap_playback = playback_wav_path(snap)
            if snap_playback.exists():
                await asyncio.to_thread(shutil.copy2, snap_playback, playback_wav_path(master))
            updates = await publish_master(rec, master)
        session = load_session(job_dir)
        session["committed"] = False
        save_session(job_dir, session)
        await finish_publish(job_id, updates)
    except Exception as exc:  # noqa: BLE001
        LOGGER.exception("Studio revert failed for job %s", job_id)
        await job_store.update(job_id, finalizing=False, finalize_error=str(exc))


async def _start_background(rec: JobRecord, message: str) -> None:
    if rec.finalizing:
        raise HTTPException(status_code=409, detail="A render is already in progress")
    await job_store.update(rec.job_id, finalizing=True, finalize_error=None, message=message)


@router.post("/commit")
async def commit_studio(
    job_id: str, body: SessionBody, background_tasks: BackgroundTasks, user: StudioUser
) -> dict[str, Any]:
    rec = await _studio_job(job_id, user)
    job_dir = _job_dir(rec)
    duration = float(sf.info(str(_base_path(job_dir))).duration)
    session = normalize_session(body.session, duration)
    save_session(job_dir, {**session, "committed": False})
    await _start_background(rec, "Rendering your Mastering Table edits…")
    background_tasks.add_task(_run_commit, job_id, session)
    return {"status": "rendering"}


@router.post("/revert")
async def revert_studio(job_id: str, background_tasks: BackgroundTasks, user: StudioUser) -> dict[str, Any]:
    rec = await _studio_job(job_id, user)
    if not (_job_dir(rec) / AI_MASTER).exists():
        raise HTTPException(status_code=409, detail="The master is already the AI master")
    await _start_background(rec, "Restoring the AI master…")
    background_tasks.add_task(_run_revert, job_id)
    return {"status": "reverting"}


@router.get("/status")
async def studio_status(job_id: str, user: StudioUser) -> dict[str, Any]:
    rec = await job_store.get(job_id)
    if not rec or (
        rec.user_id is not None and rec.user_id != user.id and user.role != UserRole.ADMIN.value
    ):
        raise HTTPException(status_code=404, detail="Job not found")
    session = load_session(_job_dir(rec)) if rec.input_path else {}
    return {
        "finalizing": rec.finalizing,
        "finalize_error": rec.finalize_error,
        "committed": bool(session.get("committed")),
    }
