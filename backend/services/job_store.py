from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

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


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = asyncio.Lock()

    async def create_job(self, data_dir: Path) -> JobRecord:
        async with self._lock:
            job_id = str(uuid.uuid4())
            job_dir = data_dir / "jobs" / job_id
            job_dir.mkdir(parents=True, exist_ok=True)
            rec = JobRecord(job_id=job_id, input_path=job_dir / "input.wav")
            self._jobs[job_id] = rec
            return rec

    async def get(self, job_id: str) -> Optional[JobRecord]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def update(self, job_id: str, **kwargs: Any) -> None:
        async with self._lock:
            rec = self._jobs.get(job_id)
            if not rec:
                return
            for k, v in kwargs.items():
                setattr(rec, k, v)
            rec.updated_at = datetime.now(timezone.utc)


job_store = JobStore()
