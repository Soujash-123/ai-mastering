from __future__ import annotations

import sys
from pathlib import Path
from typing import Union

# Allow `uvicorn api.main:app` from backend/ without PYTHONPATH tweaks
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

import numpy as np
import soundfile as sf
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from api.schemas import JobCreateResponse, JobResultResponse, JobStatus, JobStatusResponse
from services.job_store import job_store
from utils.config import get_settings
from utils.json_safe import to_json_safe
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

_ALLOWED = frozenset({".wav", ".flac"})


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
    file: UploadFile = File(...),
    target_platform: str = Form("Spotify"),
    user_intent: str = Form(""),
) -> JobCreateResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in _ALLOWED:
        raise HTTPException(
            status_code=400,
            detail="Only WAV and FLAC uploads are supported (no transcoding pipeline).",
        )

    rec = await job_store.create_job(settings.data_dir)
    assert rec.input_path is not None

    try:
        content = await file.read()
        await file.close()
        _normalize_upload_to_job_wav(content, rec.input_path, suffix)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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

    return JobResultResponse(
        job_id=rec.job_id,
        status=rec.status,
        analysis=to_json_safe(rec.analysis or {}),
        raw_intent=to_json_safe(rec.raw_intent) if rec.raw_intent is not None else None,
        safe_intent=to_json_safe(rec.safe_intent) if rec.safe_intent is not None else None,
        report=to_json_safe(rec.report or {}),
        input_url=f"/api/jobs/{job_id}/files/input",
        master_wav_url=f"/api/jobs/{job_id}/files/master",
        exports=rec.exports,
        streaming_notes=rec.streaming_notes,
    )


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
