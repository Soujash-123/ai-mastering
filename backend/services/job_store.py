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
    analysis: Optional[dict[str, Any]] = None
    raw_intent: Optional[dict[str, Any]] = None
    safe_intent: Optional[dict[str, Any]] = None
    report: Optional[dict[str, Any]] = None
    exports: list[dict[str, str]] = field(default_factory=list)
    streaming_notes: list[str] = field(default_factory=list)
    error: Optional[str] = None
    ephemeral: bool = False


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = asyncio.Lock()
        self._memory_cap = 200
        self._pending_deletes: dict[str, asyncio.Task] = {}

    async def create_job(self, data_dir: Path, ephemeral: bool = False) -> JobRecord:
        async with self._lock:
            job_id = str(uuid.uuid4())
            job_dir = data_dir / "jobs" / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            rec = JobRecord(job_id=job_id, input_path=job_dir / "input.wav", ephemeral=ephemeral)
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
            # try loading from disk
            # assume data dir layout: ./data/jobs/{job_id}/metadata.json
            # find any metadata file by walking data dir from cwd
            # Prefer reading from the job's expected location relative to current cwd
            possible = Path("./data/jobs") / job_id / "metadata.json"
            if possible.exists():
                try:
                    with open(possible, "r", encoding="utf-8") as fh:
                        data = json.load(fh)
                    rec = _dict_to_record(data)
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
            # persist metadata to job dir (skip for ephemeral — never written to disk)
            if not rec.ephemeral:
                try:
                    if rec.input_path:
                        job_dir = rec.input_path.parent
                        meta = _record_to_dict(rec)
                        with open(job_dir / "metadata.json", "w", encoding="utf-8") as fh:
                            json.dump(meta, fh)
                except Exception:
                    pass

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
    if job_dir and job_dir.exists():
        try:
            shutil.rmtree(str(job_dir), ignore_errors=True)
        except Exception:
            pass


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
        "analysis": rec.analysis,
        "raw_intent": rec.raw_intent,
        "safe_intent": rec.safe_intent,
        "report": rec.report,
        "exports": rec.exports,
        "streaming_notes": rec.streaming_notes,
        "error": rec.error,
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
        analysis=d.get("analysis"),
        raw_intent=d.get("raw_intent"),
        safe_intent=d.get("safe_intent"),
        report=d.get("report"),
        exports=d.get("exports", []),
        streaming_notes=d.get("streaming_notes", []),
        error=d.get("error"),
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
