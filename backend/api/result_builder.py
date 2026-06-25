"""Build job result payloads with role-based field filtering."""

from __future__ import annotations

from typing import Any

from api.schemas import JobResultResponse, JobStatus
from auth.schemas import UserRole
from services.job_store import JobRecord
from utils.json_safe import to_json_safe


def build_job_result(rec: JobRecord) -> JobResultResponse:
    job_id = rec.job_id
    is_rollout = rec.user_role == UserRole.ROLLOUT.value

    if is_rollout:
        return JobResultResponse(
            job_id=job_id,
            status=rec.status,
            analysis={},
            raw_intent=None,
            safe_intent=None,
            report={},
            input_url="",
            master_wav_url=f"/api/jobs/{job_id}/files/master",
            exports=[],
            streaming_notes=[],
            memory_profile=[],
        )

    return JobResultResponse(
        job_id=job_id,
        status=rec.status,
        analysis=to_json_safe(rec.analysis or {}),
        raw_intent=to_json_safe(rec.raw_intent) if rec.raw_intent is not None else None,
        safe_intent=to_json_safe(rec.safe_intent) if rec.safe_intent is not None else None,
        report=to_json_safe(rec.report or {}),
        input_url=f"/api/jobs/{job_id}/files/input",
        master_wav_url=f"/api/jobs/{job_id}/files/master",
        exports=rec.exports,
        streaming_notes=rec.streaming_notes,
        memory_profile=rec.memory_profile or [],
    )


def build_ws_result_payload(rec: JobRecord) -> dict[str, Any]:
    """WebSocket result message (JSON-serializable dict)."""
    result = build_job_result(rec)
    return {
        "type": "result",
        **result.model_dump(mode="json"),
    }
