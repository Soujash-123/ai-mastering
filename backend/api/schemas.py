from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    queued = "queued"
    analyzing = "analyzing"
    reasoning = "reasoning"
    mastering = "mastering"
    exporting = "exporting"
    completed = "completed"
    failed = "failed"


class JobCreateResponse(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: float = Field(ge=0.0, le=1.0)
    message: str = ""
    updated_at: datetime


class ExportArtifact(BaseModel):
    profile: str
    format: str
    path: str
    download_url: str


class JobResultResponse(BaseModel):
    job_id: str
    status: JobStatus
    analysis: dict[str, Any]
    raw_intent: Optional[dict[str, Any]] = None
    safe_intent: Optional[dict[str, Any]] = None
    report: dict[str, Any]
    input_url: str
    master_wav_url: str
    exports: list[ExportArtifact] = Field(default_factory=list)
    streaming_notes: list[str] = Field(default_factory=list)
