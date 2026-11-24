from __future__ import annotations

import asyncio
import re
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any, Union

# Allow `uvicorn api.main:app` from backend/ without PYTHONPATH tweaks
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

import numpy as np
import soundfile as sf
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from api.master_ops import finish_publish, publish_master, render_lock
from api.result_builder import build_cloud_job_result, build_job_result, build_ws_result_payload
from api.schemas import (
    FinalizeRequest,
    JobCreateResponse,
    JobResultResponse,
    JobStatus,
    JobStatusResponse,
    PreviewRequest,
    PreviewResponse,
    RemasterRequest,
)
from auth.admin_router import router as admin_router
from auth.database import init_db
from auth.dependencies import get_current_user, require_roles
from auth.early_access_router import router as early_access_router
from auth.models import User
from auth.permissions import duration_limit_message, max_upload_duration_sec
from auth.router import router as auth_router
from auth.schemas import UserRole
from mastering.chain import playback_wav_path
from mastering.style_profiles import normalize_style_family
from mastering.creative import CreativeParseError, parse_creative
from studio.router import invalidate_studio_snapshot, router as studio_router
from mastering.preview import (
    load_render_context,
    pick_preview_window,
    render_with_context,
    sanitize_overrides,
    update_render_context_params,
)
from services.job_store import job_store, delete_job_by_id, schedule_delete, touch_job
from services.appwrite_storage import (
    AppwriteStorageError,
    jobs_root,
    load_pending_appwrite_metadata,
    find_master_metadata,
    start_appwrite_cleanup_loop,
    start_appwrite_keepalive_loop,
    stream_master,
)
from utils.audio_decode import ALLOWED_UPLOAD_SUFFIXES, decode_audio_file
from utils.audio_encode import ensure_master_flac
from utils.config import get_settings
from utils.log import configure_logging
from workers.processor import process_job

configure_logging()

LOGGER = logging.getLogger("api.main")

app = FastAPI(title="AI Mastering API", version="0.1.0")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_JOB_PATH_RE = re.compile(r"^/api/jobs/([0-9a-fA-F-]{32,36})(?:/|$)")


@app.middleware("http")
async def _keep_active_jobs_alive(request, call_next):
    """Any use of a job (result page, Mastering Table, playback, downloads)
    postpones its ephemeral cleanup, so a job is only removed after it has been
    idle for EPHEMERAL_IDLE_SECS rather than a fixed time after processing."""
    if request.method != "DELETE":
        m = _JOB_PATH_RE.match(request.url.path)
        if m:
            try:
                await touch_job(m.group(1))
            except Exception:  # noqa: BLE001 - never fail a request over cleanup bookkeeping
                LOGGER.exception("touch_job failed for %s", m.group(1))
    return await call_next(request)


app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(early_access_router)
app.include_router(studio_router)


@app.on_event("startup")
async def _startup() -> None:
    init_db()
    # Periodic 12-hour Appwrite cleanup; state is on disk so it survives restarts.
    try:
        asyncio.create_task(start_appwrite_cleanup_loop())
    except Exception:  # noqa: BLE001
        LOGGER.exception("Failed to schedule Appwrite cleanup loop")
    # Daily ping so Appwrite doesn't pause the project for inactivity.
    try:
        asyncio.create_task(start_appwrite_keepalive_loop())
    except Exception:  # noqa: BLE001
        LOGGER.exception("Failed to schedule Appwrite keepalive loop")

_ALLOWED = ALLOWED_UPLOAD_SUFFIXES

_render_lock = render_lock


def _load_ctx_or_409(rec) -> dict:
    if rec.status != JobStatus.completed:
        raise HTTPException(status_code=409, detail="Job not completed")
    if not rec.input_path or not rec.input_path.exists():
        raise HTTPException(status_code=409, detail="Source audio no longer available")
    ctx = load_render_context(rec.input_path.parent)
    if ctx is None:
        raise HTTPException(
            status_code=409,
            detail="Mastering context unavailable for this job.",
        )
    return ctx


def _audio_duration(path: Path) -> float:
    try:
        return float(sf.info(str(path)).duration)
    except Exception:
        return 0.0


def _master_expired(rec) -> bool:
    """True once the mastered audio's Appwrite retention window has elapsed."""
    if not rec.appwrite_expires_at:
        return False
    return datetime.now(timezone.utc) > rec.appwrite_expires_at


# Artifacts that are removed from disk when a master's window closes, so they
# must stop being served the moment the window closes (not merely once the
# cleanup loop next runs).
_EXPIRY_GATED_FILES = ("master.wav", "master.flac", "master_playback.wav", "master_ai.wav", "master_ai_playback.wav")
_EXPIRY_GATED_DIRS = ("exports", "streaming_sim")


def _artifact_expired(rec, rel_path: str) -> bool:
    """True when `rel_path` is retention-gated material and the window closed.

    Applies to ephemeral and persistent jobs alike: the cleanup loop purges the
    local master and exports for both, so both must stop serving them once the
    window closes.
    """
    if not _master_expired(rec):
        return False
    parts = Path(rel_path).parts
    if not parts:
        return False
    if parts[0] in _EXPIRY_GATED_DIRS:
        return True
    if len(parts) == 1 and parts[0] in _EXPIRY_GATED_FILES:
        return True
    if len(parts) == 1 and parts[0] == "input.wav" and settings.appwrite_purge_local_input:
        return True
    return False


def _normalize_upload_to_job_wav(src: bytes, dest_wav: Path, original_suffix: str) -> bool:
    """Decode the upload (WAV/FLAC/AIFF, or phone formats like M4A/MP3/Opus) and
    write the canonical 24-bit PCM WAV the pipeline reads. Returns True when the
    source was lossy."""
    import tempfile

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=original_suffix)
    tmp_path = Path(tmp.name)
    try:
        tmp.write(src)
        tmp.close()
        decoded = decode_audio_file(tmp_path, original_suffix)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)

    y, sr = decoded.samples, decoded.sample_rate
    if y.shape[1] == 1:
        y = np.column_stack([y[:, 0], y[:, 0]])
    elif y.shape[1] > 2:
        y = y[:, :2]
    y = np.clip(y, -1.0, 1.0).astype(np.float32)
    dest_wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(dest_wav), y, sr, subtype="PCM_24")
    return decoded.lossy


@app.post("/api/jobs", response_model=JobCreateResponse)
async def create_job(
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
    target_platform: str = Form("Spotify"),
    user_intent: str = Form(""),
    ephemeral: bool = Form(False),
    style_family: str = Form("auto"),
    creative: str = Form(""),
) -> JobCreateResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in _ALLOWED:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Upload WAV, FLAC, AIFF, M4A, MP3, AAC, OGG or Opus.",
        )
    # Style envelope is available to every tier (ROLLOUT, EARLY_ACCESS, ADMIN):
    # it only narrows the safety limits, it never unlocks advanced overrides.
    try:
        style_family = normalize_style_family(style_family)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Creative desk (mastering/creative.py): validated for everyone so bad input
    # fails fast, but only applied for EARLY_ACCESS and ADMIN (dropped below).
    try:
        creative_controls = parse_creative(creative)
    except CreativeParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    rec = await job_store.create_job(
        settings.data_dir,
        ephemeral=ephemeral,
        user_id=user.id,
        user_role=user.role,
    )
    rec.original_filename = file.filename
    rec.style_family = style_family
    rec.source_format = suffix.lstrip(".")
    if creative_controls is not None and user.role != UserRole.ROLLOUT.value and not creative_controls.is_neutral():
        rec.creative = creative_controls.model_dump()
    assert rec.input_path is not None

    try:
        content = await file.read()
        await file.close()
        rec.source_lossy = await asyncio.to_thread(
            _normalize_upload_to_job_wav, content, rec.input_path, suffix
        )
    except ValueError as exc:
        await delete_job_by_id(rec.job_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        info = sf.info(str(rec.input_path))
        duration_sec = float(info.duration)
    except Exception as exc:
        await delete_job_by_id(rec.job_id)
        raise HTTPException(status_code=400, detail="Could not read audio duration") from exc

    limit = max_upload_duration_sec(user.role)
    if limit is not None and duration_sec > limit + 0.05:
        await delete_job_by_id(rec.job_id)
        raise HTTPException(status_code=413, detail=duration_limit_message(user.role))

    # Rollout users always use default mastering options (no advanced API overrides).
    if user.role == UserRole.ROLLOUT.value:
        target_platform = "Spotify"
        user_intent = ""

    background_tasks.add_task(process_job, rec.job_id, target_platform, user_intent)
    return JobCreateResponse(job_id=rec.job_id)


@app.get("/api/jobs/{job_id}/status", response_model=JobStatusResponse)
async def job_status(job_id: str) -> JobStatusResponse:
    rec = await job_store.get(job_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=rec.job_id,
        status=rec.status,
        progress=rec.progress,
        message=rec.message or rec.error or "",
        updated_at=rec.updated_at,
    )


@app.get("/api/jobs/{job_id}/result", response_model=JobResultResponse)
async def job_result(job_id: str) -> Union[JSONResponse, JobResultResponse]:
    rec = await job_store.get(job_id)
    if not rec:
        pending = load_pending_appwrite_metadata(job_id) or find_master_metadata(job_id)
        if pending and pending.get("file_id"):
            return build_cloud_job_result(job_id, pending)
        raise HTTPException(status_code=404, detail="Job not found")
    if rec.status != JobStatus.completed:
        return JSONResponse({"detail": "Job not completed", "status": rec.status.value}, status_code=409)
    if not rec.master_path:
        raise HTTPException(status_code=500, detail="Missing master path")

    return build_job_result(rec)


@app.post("/api/jobs/{job_id}/preview", response_model=PreviewResponse)
async def job_preview(
    job_id: str,
    payload: PreviewRequest,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.EARLY_ACCESS))],
) -> PreviewResponse:
    """Re-render a mastered segment (or full track) with user DSP overrides.

    The master is kept as a preview here — no committed exports are produced
    until the user calls /finalize.
    """
    _ = user
    rec = await job_store.get(job_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Job not found")
    ctx = _load_ctx_or_409(rec)

    try:
        overrides = sanitize_overrides(payload.overrides)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    duration_sec = _audio_duration(rec.input_path)
    segment_sec = max(0.0, payload.segment_sec)
    is_full = segment_sec <= 1e-6 or segment_sec >= duration_sec - 1e-6

    if is_full:
        segment: tuple[float, float] | None = None
        start_sec: float | None = None
        out_name = "preview_full.wav"
        duration_hint = duration_sec
    else:
        seg_len = min(segment_sec, max(10.0, duration_sec - 0.5))
        if payload.window_start_sec is not None:
            half = seg_len / 2.0
            start = float(np.clip(payload.window_start_sec, half, max(half, duration_sec - half)))
        else:
            sectional = list(ctx.get("analysis", {}).get("sectional_analysis") or [])
            start = pick_preview_window(sectional, duration_sec, seg_len)
        segment = (start, seg_len)
        start_sec = start
        out_name = "preview.wav"
        duration_hint = seg_len

    out_path = rec.input_path.parent / out_name
    async with _render_lock(job_id):
        meta = await asyncio.to_thread(
            render_with_context,
            str(rec.input_path),
            str(out_path),
            ctx,
            overrides,
            segment,
        )

    return PreviewResponse(
        url=f"/api/jobs/{job_id}/artifacts/{playback_wav_path(out_name).name}",
        download_url=f"/api/jobs/{job_id}/artifacts/{out_name}",
        params=meta["params"],
        lufs=meta["lufs"],
        peak_db=meta["peak_db"],
        duration_sec=meta["duration_sec"] or duration_hint,
        is_full=is_full,
        segment_start_sec=start_sec,
    )


@app.post("/api/jobs/{job_id}/finalize", response_model=JobResultResponse)
async def job_finalize(
    job_id: str,
    payload: FinalizeRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.EARLY_ACCESS))],
) -> JobResultResponse:
    """Commit the user's DSP overrides: render the final full-track master + exports.

    The render runs as a background task after this response is sent, so the
    request returns immediately instead of pegging the worker mid-request. The
    payload's `finalizing` flag stays true while it runs; clients poll /result
    until it flips to false (the master + exports are updated only then).
    """
    _ = user
    rec = await job_store.get(job_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Job not found")
    _load_ctx_or_409(rec)

    try:
        overrides = sanitize_overrides(payload.overrides)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not rec.finalizing:
        await job_store.update(
            job_id,
            finalizing=True,
            finalize_error=None,
            message="Finalizing master…",
        )
        background_tasks.add_task(_run_finalize, job_id, overrides)

    return build_job_result(rec)


async def _run_finalize(job_id: str, overrides: dict[str, float]) -> None:
    """Background re-render of the full master + exports for a finalized job.

    Runs after the /finalize response is sent so a single-worker t3.micro can
    keep serving audio/polls while the render churns. On failure the previous
    master is left untouched and `finalize_error` is surfaced to the client.
    """
    try:
        rec = await job_store.get(job_id)
        if not rec:
            return
        ctx = _load_ctx_or_409(rec)
        job_dir = rec.input_path.parent
        master_path = job_dir / "master.wav"

        async with _render_lock(job_id):
            meta = await asyncio.to_thread(
                render_with_context,
                str(rec.input_path),
                str(master_path),
                ctx,
                overrides,
                None,
            )
            update_render_context_params(job_dir, meta["params"])
            # A re-finalized AI master supersedes any Mastering Table snapshot:
            # the Table's live layer now sits on top of this new master.
            invalidate_studio_snapshot(job_dir)
            updates = await publish_master(rec, master_path)

        await finish_publish(job_id, updates)
    except Exception as exc:  # noqa: BLE001 - keep the old master + report the failure
        LOGGER.exception("Job %s finalize failed", job_id)
        try:
            await job_store.update(job_id, finalizing=False, finalize_error=str(exc))
        except Exception:  # noqa: BLE001
            pass


@app.get("/api/jobs/{job_id}/artifacts/{file_path:path}")
async def job_artifact(job_id: str, file_path: str) -> FileResponse:
    rec = await job_store.get(job_id)
    # A missing record is fine here: artifacts are also read by clients that
    # only hold the job id, and the file check below is what actually gates.
    if rec and _artifact_expired(rec, file_path):
        raise HTTPException(status_code=410, detail="The mastered audio has expired")
    base = (jobs_root() / job_id).resolve()
    target = (base / file_path).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")
    media = "application/octet-stream"
    if target.suffix.lower() == ".wav":
        media = "audio/wav"
    elif target.suffix.lower() == ".flac":
        media = "audio/flac"
    return FileResponse(target, media_type=media, filename=target.name)


@app.get("/api/jobs/{job_id}/files/{kind}")
async def job_file(job_id: str, kind: str) -> FileResponse:
    rec = await job_store.get(job_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Job not found")
    if kind in ("master", "master_wav") and _master_expired(rec):
        # The Appwrite file has already been (or is about to be) physically
        # deleted; never let the mastered audio outlive its 12-hour window.
        raise HTTPException(status_code=410, detail="The mastered audio has expired")
    if kind == "input":
        path = rec.input_path
        media = "audio/wav"
    elif kind == "master":
        # Browser playback copy (PCM_16 WAV). Canonical download is master_wav.
        playback = playback_wav_path(rec.master_path) if rec.master_path else None
        if playback and playback.exists():
            path = playback
        else:
            path = rec.master_path
        media = "audio/wav"
    elif kind == "master_wav":
        # Canonical 24-bit WAV for download.
        path = rec.master_path
        media = "audio/wav"
    else:
        raise HTTPException(status_code=404, detail="Unknown file kind")
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="File not available")
    return FileResponse(path, media_type=media, filename=path.name)


def _audio_media_type(filename: str | None) -> str:
    return "audio/flac" if (filename or "").lower().endswith(".flac") else "audio/wav"


def _download_name(rec, suffix: str = ".flac") -> str:
    stem = Path(rec.original_filename or "").stem
    return f"{stem}_mastered{suffix}" if stem else f"master{suffix}"


@app.get("/api/jobs/{job_id}/master/download")
async def download_master(job_id: str):
    """Canonical master download.

    Prefers a direct Appwrite file-token URL (the browser streams straight from
    the CDN, keeping audio traffic off the backend). When token minting failed
    the file is streamed through the server key instead, so this route never
    dead-ends on a missing `download_url`.
    """
    rec = await job_store.get(job_id)
    if not rec:
        pending = load_pending_appwrite_metadata(job_id) or find_master_metadata(job_id)
        if not pending or not pending.get("file_id"):
            raise HTTPException(status_code=404, detail="Job not found")
        expires_at = pending.get("expires_at")
        if expires_at and datetime.now(timezone.utc) > datetime.fromisoformat(expires_at):
            raise HTTPException(status_code=410, detail="The mastered audio has expired")
        try:
            stream = await asyncio.to_thread(stream_master, pending["file_id"])
        except AppwriteStorageError as exc:
            LOGGER.warning("Cloud master unavailable for job %s: %s", job_id, exc)
            raise HTTPException(status_code=404, detail="Mastered audio is not available") from exc
        name = pending.get("filename") or "master.flac"
        return StreamingResponse(
            stream,
            media_type=_audio_media_type(name),
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )
    if _master_expired(rec):
        raise HTTPException(status_code=410, detail="The mastered audio has expired")
    if not rec.master_path:
        raise HTTPException(status_code=500, detail="Missing master path")

    if rec.appwrite_state == "uploaded" and rec.appwrite_file_id:
        try:
            stream = await asyncio.to_thread(stream_master, rec.appwrite_file_id)
        except AppwriteStorageError as exc:
            LOGGER.warning("Cloud master unavailable for job %s: %s", job_id, exc)
        else:
            name = rec.appwrite_filename or _download_name(rec)
            return StreamingResponse(
                stream,
                media_type=_audio_media_type(name),
                headers={"Content-Disposition": f'attachment; filename="{name}"'},
            )

    # Appwrite inactive or upload failed: deliver the same FLAC from the local
    # master (cached; re-encoded only when the master changed).
    if rec.master_path.exists():
        encoded = await asyncio.to_thread(
            ensure_master_flac, rec.master_path, settings.appwrite_max_file_bytes
        )
        return FileResponse(encoded.path, media_type="audio/flac", filename=_download_name(rec))
    raise HTTPException(status_code=404, detail="Mastered audio is not available")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str) -> dict[str, str]:
    """Explicitly delete a job and its files (called by frontend on page unload)."""
    rec = await job_store.get(job_id)
    if not rec:
        return {"status": "not_found"}
    await delete_job_by_id(job_id)
    return {"status": "deleted"}


@app.post("/api/jobs/{job_id}/remaster", response_model=JobCreateResponse)
async def remaster_job(
    job_id: str,
    payload: RemasterRequest,
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ROLLOUT))],
) -> JobCreateResponse:
    """Re-master the original audio with a new natural-language prompt.

    Available to ROLLOUT and ADMIN users. Creates a fresh job from the same
    input audio so the original result is left untouched.
    """
    import shutil as _shutil

    rec = await job_store.get(job_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Job not found")
    if rec.status != JobStatus.completed:
        raise HTTPException(status_code=409, detail="Job not completed")
    if not rec.input_path or not rec.input_path.exists():
        raise HTTPException(status_code=409, detail="Original audio is no longer available")

    new_rec = await job_store.create_job(
        settings.data_dir,
        ephemeral=True,
        user_id=user.id,
        user_role=user.role,
    )
    new_rec.original_filename = rec.original_filename
    new_rec.source_format = rec.source_format
    new_rec.source_lossy = rec.source_lossy
    if payload.style_family is not None:
        try:
            new_rec.style_family = normalize_style_family(payload.style_family)
        except ValueError as exc:
            await delete_job_by_id(new_rec.job_id)
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        new_rec.style_family = rec.style_family
    assert new_rec.input_path is not None
    await asyncio.to_thread(_shutil.copy2, str(rec.input_path), str(new_rec.input_path))

    background_tasks.add_task(process_job, new_rec.job_id, payload.target_platform, payload.prompt)
    return JobCreateResponse(job_id=new_rec.job_id)


@app.websocket("/ws/jobs/{job_id}")
async def ws_job_progress(websocket: WebSocket, job_id: str) -> None:
    """Stream job progress and final result over WebSocket."""
    await websocket.accept()
    live_view_sent = 0  # version of rec.live_view already sent (sent once per version, ~2 KB)
    try:
        while True:
            rec = await job_store.get(job_id)
            if not rec:
                await websocket.send_json({"type": "error", "detail": "Job not found"})
                break

            await websocket.send_json({
                "type": "progress",
                "status": rec.status.value,
                "progress": rec.progress,
                "message": rec.message or "",
                "stage": rec.stage or "",
            })
            lv = rec.live_view
            if lv and int(lv.get("version", 0)) > live_view_sent:
                live_view_sent = int(lv.get("version", 0))
                await websocket.send_json({"type": "live_view", **lv})

            if rec.status == JobStatus.completed:
                await websocket.send_json(build_ws_result_payload(rec))
                # Wait for client to disconnect (navigating to result page)
                # then schedule ephemeral cleanup
                try:
                    await websocket.receive_text()
                except Exception:
                    pass
                break

            elif rec.status == JobStatus.failed:
                await websocket.send_json({
                    "type": "failed",
                    "message": rec.error or rec.message or "Processing failed",
                })
                break

            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        pass
    finally:
        # For ephemeral jobs, schedule folder deletion after 10 min
        # (gives result page time to load audio files before cleanup)
        rec = await job_store.get(job_id)
        if rec and rec.ephemeral:
            await schedule_delete(job_id, delay_secs=600)
