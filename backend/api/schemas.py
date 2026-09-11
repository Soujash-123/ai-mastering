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


class MemoryStepReport(BaseModel):
    name: str
    rss_start_mb: float
    rss_end_mb: float
    rss_peak_mb: float
    delta_mb: float


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
    memory_profile: list[MemoryStepReport] = Field(default_factory=list)
    dsp_params: Optional[dict[str, float]] = None


class PreviewRequest(BaseModel):
    overrides: dict[str, float] = Field(default_factory=dict)
    # Length of the preview window in seconds. 0 renders the full track.
    segment_sec: float = Field(default=30.0, ge=0.0, le=120.0)
    # Optional window center (seconds). When omitted, the loudest section is used.
    window_start_sec: Optional[float] = Field(default=None, ge=0.0)


class PreviewResponse(BaseModel):
    url: str
    params: dict[str, float]
    lufs: Optional[float] = None
    peak_db: Optional[float] = None
    duration_sec: float
    is_full: bool
    segment_start_sec: Optional[float] = None


class FinalizeRequest(BaseModel):
    overrides: dict[str, float] = Field(default_factory=dict)
