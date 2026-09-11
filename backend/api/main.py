from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Annotated, Union

# Allow `uvicorn api.main:app` from backend/ without PYTHONPATH tweaks
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

import numpy as np
import soundfile as sf
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from api.result_builder import build_job_result, build_ws_result_payload
from api.schemas import (
    FinalizeRequest,
    JobCreateResponse,
    JobResultResponse,
    JobStatus,
    JobStatusResponse,
    PreviewRequest,
    PreviewResponse,
)
from auth.admin_router import router as admin_router
from auth.database import init_db
from auth.dependencies import get_current_user, require_roles
from auth.early_access_router import router as early_access_router
from auth.models import User
from auth.permissions import duration_limit_message, max_upload_duration_sec
from auth.router import router as auth_router
from auth.schemas import UserRole
from exports.pcm_export import export_all_artifacts
from mastering.preview import (
    load_render_context,
    pick_preview_window,
    render_with_context,
    sanitize_overrides,
    update_render_context_params,
)
from services.job_store import job_store, delete_job_by_id, schedule_delete
from utils.config import get_settings
from utils.log import configure_logging
from workers.processor import process_job

configure_logging()

app = FastAPI(title="AI Mastering API", version="0.1.0")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(early_access_router)


@app.on_event("startup")
def _startup() -> None:
    init_db()

_ALLOWED = frozenset({".wav", ".flac"})

# Serialize re-renders per job so slider spam can't stack renders.
_render_locks: dict[str, asyncio.Lock] = {}


def _render_lock(job_id: str) -> asyncio.Lock:
    lock = _render_locks.get(job_id)
    if lock is None:
        lock = asyncio.Lock()
        _render_locks[job_id] = lock
    return lock


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


def _normalize_upload_to_job_wav(src: bytes, dest_wav: Path, original_suffix: str) -> None:
    """Decode WAV/FLAC with libsndfile (soundfile), write canonical float PCM WAV for the pipeline."""
    import tempfile

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=original_suffix)
    tmp_path = Path(tmp.name)
    try:
        tmp.write(src)
        tmp.close()
        y, sr = sf.read(str(tmp_path), always_2d=True, dtype="float32")
    except Exception as exc:
        raise ValueError(f"Could not read audio (WAV or FLAC required): {exc}") from exc
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)

    if y.ndim != 2 or y.shape[1] < 1:
        raise ValueError("Invalid channel layout")
    if y.shape[1] == 1:
        y = np.column_stack([y[:, 0], y[:, 0]])
    elif y.shape[1] > 2:
        y = y[:, :2]
    y = np.clip(y, -1.0, 1.0).astype(np.float32)
    dest_wav.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(dest_wav), y, sr, subtype="PCM_24")


@app.post("/api/jobs", response_model=JobCreateResponse)
async def create_job(
    background_tasks: BackgroundTasks,
    user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
    target_platform: str = Form("Spotify"),
    user_intent: str = Form(""),
    ephemeral: bool = Form(False),
) -> JobCreateResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in _ALLOWED:
        raise HTTPException(
            status_code=400,
            detail="Only WAV and FLAC uploads are supported (no transcoding pipeline).",
        )

    rec = await job_store.create_job(
        settings.data_dir,
        ephemeral=ephemeral,
        user_id=user.id,
        user_role=user.role,
    )
    assert rec.input_path is not None

    try:
        content = await file.read()
        await file.close()
        _normalize_upload_to_job_wav(content, rec.input_path, suffix)
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
        url=f"/api/jobs/{job_id}/artifacts/{out_name}",
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
    user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.EARLY_ACCESS))],
) -> JobResultResponse:
    """Commit the user's DSP overrides: render the final full-track master + exports."""
    _ = user
    rec = await job_store.get(job_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Job not found")
    ctx = _load_ctx_or_409(rec)

    try:
        overrides = sanitize_overrides(payload.overrides)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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

        # Regenerate platform exports + streaming simulations from the new master.
        is_rollout = rec.user_role == UserRole.ROLLOUT.value
        exports: list[dict[str, str]] = []
        notes: list[str] = []
        if not is_rollout:
            exports_list, notes = await asyncio.to_thread(
                export_all_artifacts,
                master_path,
                job_dir / "exports",
                job_dir / "streaming_sim",
            )
            exports_public: list[dict[str, str]] = []
            for item in exports_list:
                p = Path(item["path"]).resolve()
                rel = p.relative_to(job_dir.resolve()).as_posix()
                exports_public.append({**item, "download_url": f"/api/jobs/{job_id}/artifacts/{rel}"})
            exports = exports_public

    await job_store.update(
        job_id,
        master_path=master_path,
        exports=exports,
        streaming_notes=notes,
        message="Done",
    )
    rec = await job_store.get(job_id)
    assert rec is not None
    return build_job_result(rec)


@app.get("/api/jobs/{job_id}/artifacts/{file_path:path}")
async def job_artifact(job_id: str, file_path: str) -> FileResponse:
    base = (settings.data_dir / "jobs" / job_id).resolve()
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
    if kind == "input":
        path = rec.input_path
        media = "audio/wav"
    elif kind == "master":
        path = rec.master_path
        media = "audio/wav"
    else:
        raise HTTPException(status_code=404, detail="Unknown file kind")
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="File not available")
    return FileResponse(path, media_type=media, filename=path.name)


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


@app.websocket("/ws/jobs/{job_id}")
async def ws_job_progress(websocket: WebSocket, job_id: str) -> None:
    """Stream job progress and final result over WebSocket."""
    await websocket.accept()
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
            })

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
