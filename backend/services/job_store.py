from __future__ import annotations

import asyncio
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
import json

from api.schemas import JobStatus
from services.appwrite_storage import APPWRITE_META_KEYS, jobs_root, preserve_appwrite_metadata


@dataclass
class JobRecord:
    job_id: str
    status: JobStatus = JobStatus.queued
    progress: float = 0.0
    message: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    input_path: Optional[Path] = None
    master_path: Optional[Path] = None
    original_filename: Optional[str] = None
    analysis: Optional[dict[str, Any]] = None
    raw_intent: Optional[dict[str, Any]] = None
    safe_intent: Optional[dict[str, Any]] = None
    report: Optional[dict[str, Any]] = None
    exports: list[dict[str, str]] = field(default_factory=list)
    streaming_notes: list[str] = field(default_factory=list)
    memory_profile: list[dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None
    ephemeral: bool = False
    user_id: Optional[int] = None
    user_role: Optional[str] = None
    # Background /finalize state. Persisted so a reload while a finalize is in
    # flight can resume polling; reset on disk-load (work does not survive restarts).
    finalizing: bool = False
    finalize_error: Optional[str] = None
    # Appwrite Cloud Storage metadata for the mastered audio. Only ever the
    # final master; persisted so the 12-hour cleanup survives restarts.
    appwrite_state: str = ""  # "", "uploaded", "failed", "expired"
    appwrite_file_id: Optional[str] = None
    appwrite_filename: Optional[str] = None
    appwrite_created_at: Optional[datetime] = None
    appwrite_expires_at: Optional[datetime] = None
    appwrite_download_url: Optional[str] = None
    appwrite_error: Optional[str] = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = asyncio.Lock()
        self._memory_cap = 200
        self._pending_deletes: dict[str, asyncio.Task] = {}

    async def create_job(
        self,
        data_dir: Path,
        ephemeral: bool = False,
        user_id: int | None = None,
        user_role: str | None = None,
    ) -> JobRecord:
        async with self._lock:
            job_id = str(uuid.uuid4())
            job_dir = data_dir / "jobs" / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            rec = JobRecord(
                job_id=job_id,
                input_path=job_dir / "input.wav",
                ephemeral=ephemeral,
                user_id=user_id,
                user_role=user_role,
            )
            self._jobs[job_id] = rec
            if not ephemeral:
                try:
                    meta = _record_to_dict(rec)
                    with open(job_dir / "metadata.json", "w", encoding="utf-8") as fh:
                        json.dump(meta, fh)
                except Exception:
                    pass
            return rec

    async def get(self, job_id: str) -> Optional[JobRecord]:
        async with self._lock:
            rec = self._jobs.get(job_id)
            if rec:
                return rec
            # Fall back to the on-disk record. Use the same jobs root the Appwrite
            # cleanup loop scans, so the two can never disagree about where job
            # state lives (this used to hardcode ./data/jobs, which diverged from
            # settings.data_dir whenever the tmp-slot layout was in play).
            possible = jobs_root() / job_id / "metadata.json"
            if possible.exists():
                try:
                    with open(possible, "r", encoding="utf-8") as fh:
                        data = json.load(fh)
                    rec = _dict_to_record(data)
                    # A persisted `finalizing` flag is stale: background renders do
                    # not survive a process restart. Reset so the job isn't stuck
                    # "finalizing" forever (the client will simply see it as done).
                    if rec.finalizing:
                        rec.finalizing = False
                        rec.finalize_error = None
                    self._jobs[job_id] = rec
                    _enforce_memory_cap(self)
                    return rec
                except Exception:
                    return None
            return None

    async def update(self, job_id: str, **kwargs: Any) -> None:
        async with self._lock:
            rec = self._jobs.get(job_id)
            if not rec:
                return
            for k, v in kwargs.items():
                setattr(rec, k, v)
            rec.updated_at = datetime.now(timezone.utc)

            job_dir = rec.input_path.parent if rec.input_path else None
            if not rec.ephemeral:
                # persist metadata to job dir
                if job_dir:
                    try:
                        meta = _record_to_dict(rec)
                        with open(job_dir / "metadata.json", "w", encoding="utf-8") as fh:
                            json.dump(meta, fh)
                    except Exception:
                        pass
            elif job_dir and any(k in APPWRITE_META_KEYS for k in kwargs):
                # Ephemeral jobs keep their bulk fields in memory, but the
                # Appwrite tracking keys MUST reach disk: without them the
                # cleanup loop has no way to find (and delete) the cloud master
                # once its window closes. This is safe because the job folder is
                # removed on the ephemeral delete path, which also deletes the
                # cloud file first.
                _persist_appwrite_only(job_dir, rec)

            # free large in-memory fields for completed/failed PERSISTENT jobs only
            # ephemeral jobs keep them in memory until WS delivers then deletes the record
            if not rec.ephemeral:
                try:
                    if rec.status in (JobStatus.completed, JobStatus.failed):
                        rec.analysis = None
                        rec.raw_intent = None
                        rec.safe_intent = None
                        rec.report = None
                except Exception:
                    pass

            _enforce_memory_cap(self)


job_store = JobStore()


def _persist_appwrite_only(job_dir: Path, rec: JobRecord) -> None:
    """Write just the Appwrite tracking keys for an ephemeral job.

    Kept deliberately tiny: this is the only thing from an ephemeral job that
    ever touches disk, and it exists solely so the cleanup loop can locate the
    cloud master for deletion once its retention window closes.
    """
    try:
        payload = {
            "job_id": rec.job_id,
            "status": rec.status.value,
            "ephemeral": True,
            "updated_at": rec.updated_at.isoformat(),
            "appwrite_state": rec.appwrite_state,
            "appwrite_file_id": rec.appwrite_file_id,
            "appwrite_filename": rec.appwrite_filename,
            "appwrite_created_at": rec.appwrite_created_at.isoformat() if rec.appwrite_created_at else None,
            "appwrite_expires_at": rec.appwrite_expires_at.isoformat() if rec.appwrite_expires_at else None,
            "appwrite_download_url": rec.appwrite_download_url,
            "appwrite_error": rec.appwrite_error,
        }
        with open(job_dir / "metadata.json", "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
    except Exception:
        pass


async def _delete_job_impl(store: JobStore, job_id: str) -> None:
    """Remove job from memory and delete its folder. Called by delete_job and schedule_delete."""
    job_dir: Optional[Path] = None
    async with store._lock:
        rec = store._jobs.pop(job_id, None)
        task = store._pending_deletes.pop(job_id, None)
        if task:
            task.cancel()
        if rec and rec.input_path:
            job_dir = rec.input_path.parent
    # Ephemeral jobs retain their Appwrite master until its normal TTL expires.
    # The local job is temporary, but the cloud result must remain streamable
    # after the processing WebSocket and local folder are cleaned up.
    if rec:
        if rec.ephemeral:
            preserve_appwrite_metadata(rec)
        else:
            await _delete_cloud_master(rec)
    if job_dir and job_dir.exists():
        try:
            shutil.rmtree(str(job_dir), ignore_errors=True)
        except Exception:
            pass


async def _delete_cloud_master(rec: Optional[JobRecord]) -> None:
    if not rec or rec.appwrite_state != "uploaded" or not rec.appwrite_file_id:
        return
    from services.appwrite_storage import delete_file_safe

    await delete_file_safe(rec.appwrite_file_id, retries=2)


async def delete_job_by_id(job_id: str) -> None:
    await _delete_job_impl(job_store, job_id)


async def schedule_delete(job_id: str, delay_secs: int = 600) -> None:
    """Schedule deletion of a job after `delay_secs` seconds (default 10 min)."""
    async def _do() -> None:
        await asyncio.sleep(delay_secs)
        await _delete_job_impl(job_store, job_id)

    task = asyncio.create_task(_do())
    async with job_store._lock:
        existing = job_store._pending_deletes.get(job_id)
        if existing:
            existing.cancel()
        job_store._pending_deletes[job_id] = task


def _serialize_value(v: Any) -> Any:
    if isinstance(v, Path):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, list):
        return [ _serialize_value(x) for x in v ]
    return v


def _record_to_dict(rec: JobRecord) -> dict:
    return {
        "job_id": rec.job_id,
        "status": rec.status.value,
        "progress": rec.progress,
        "message": rec.message,
        "created_at": rec.created_at.isoformat(),
        "updated_at": rec.updated_at.isoformat(),
        "input_path": str(rec.input_path) if rec.input_path else None,
        "master_path": str(rec.master_path) if rec.master_path else None,
        "original_filename": rec.original_filename,
        "analysis": rec.analysis,
        "raw_intent": rec.raw_intent,
        "safe_intent": rec.safe_intent,
        "report": rec.report,
        "exports": rec.exports,
        "streaming_notes": rec.streaming_notes,
        "memory_profile": rec.memory_profile,
        "error": rec.error,
        "ephemeral": rec.ephemeral,
        "user_id": rec.user_id,
        "user_role": rec.user_role,
        "finalizing": rec.finalizing,
        "finalize_error": rec.finalize_error,
        "appwrite_state": rec.appwrite_state,
        "appwrite_file_id": rec.appwrite_file_id,
        "appwrite_filename": rec.appwrite_filename,
        "appwrite_created_at": rec.appwrite_created_at.isoformat() if rec.appwrite_created_at else None,
        "appwrite_expires_at": rec.appwrite_expires_at.isoformat() if rec.appwrite_expires_at else None,
        "appwrite_download_url": rec.appwrite_download_url,
        "appwrite_error": rec.appwrite_error,
    }


def _dict_to_record(d: dict) -> JobRecord:
    created = datetime.fromisoformat(d.get("created_at")) if d.get("created_at") else datetime.now(timezone.utc)
    updated = datetime.fromisoformat(d.get("updated_at")) if d.get("updated_at") else datetime.now(timezone.utc)
    rec = JobRecord(
        job_id=d.get("job_id"),
        status=JobStatus(d.get("status")) if d.get("status") else JobStatus.queued,
        progress=float(d.get("progress", 0.0)),
        message=d.get("message", ""),
        created_at=created,
        updated_at=updated,
        input_path=Path(d["input_path"]) if d.get("input_path") else None,
        master_path=Path(d["master_path"]) if d.get("master_path") else None,
        original_filename=d.get("original_filename"),
        analysis=d.get("analysis"),
        raw_intent=d.get("raw_intent"),
        safe_intent=d.get("safe_intent"),
        report=d.get("report"),
        exports=d.get("exports", []),
        streaming_notes=d.get("streaming_notes", []),
        memory_profile=d.get("memory_profile", []),
        error=d.get("error"),
        # Ephemeral jobs persist only their Appwrite tracking keys, so this flag
        # is what stops a rehydrated record from being treated as persistent.
        ephemeral=bool(d.get("ephemeral", False)),
        user_id=d.get("user_id"),
        user_role=d.get("user_role"),
        finalizing=bool(d.get("finalizing", False)),
        finalize_error=d.get("finalize_error"),
        appwrite_state=d.get("appwrite_state", ""),
        appwrite_file_id=d.get("appwrite_file_id"),
        appwrite_filename=d.get("appwrite_filename"),
        appwrite_created_at=datetime.fromisoformat(d["appwrite_created_at"]) if d.get("appwrite_created_at") else None,
        appwrite_expires_at=datetime.fromisoformat(d["appwrite_expires_at"]) if d.get("appwrite_expires_at") else None,
        appwrite_download_url=d.get("appwrite_download_url"),
        appwrite_error=d.get("appwrite_error"),
    )
    return rec


def _enforce_memory_cap(store: JobStore) -> None:
    try:
        if len(store._jobs) <= store._memory_cap:
            return
        # remove oldest entries (by updated_at)
        items = sorted(store._jobs.items(), key=lambda kv: kv[1].updated_at)
        remove_count = max(1, len(items) - store._memory_cap)
        for i in range(remove_count):
            key = items[i][0]
            store._jobs.pop(key, None)
    except Exception:
        pass
