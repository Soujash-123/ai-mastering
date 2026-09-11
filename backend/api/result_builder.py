"""Build job result payloads with role-based field filtering."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from api.schemas import JobResultResponse, JobStatus
from auth.schemas import UserRole
from mastering.preview import load_render_context
from services.job_store import JobRecord
from utils.json_safe import to_json_safe


def _dsp_params_for(rec: JobRecord) -> dict[str, float] | None:
    if not rec.input_path:
        return None
    ctx = load_render_context(rec.input_path.parent)
    if not ctx:
        return None
    params = ctx.get("params")
    if isinstance(params, dict) and params:
        return {k: float(v) for k, v in params.items() if isinstance(v, (int, float))}
    return None


def _metadata_snapshot(rec: JobRecord) -> dict[str, Any]:
    """On-disk metadata snapshot.

    Persistent records have their large in-memory fields (analysis, intents,
    report) freed at completion; the result payload must fall back to the job's
    metadata.json, which is written before those fields are cleared.
    """
    if not rec.input_path:
        return {}
    meta_path = Path(rec.input_path.parent) / "metadata.json"
    try:
        with meta_path.open("r", encoding="utf-8") as fh:
            meta = json.load(fh)
    except Exception:
        return {}
    return {
        "analysis": meta.get("analysis"),
        "raw_intent": meta.get("raw_intent"),
        "safe_intent": meta.get("safe_intent"),
        "report": meta.get("report"),
    }


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

    meta = _metadata_snapshot(rec)
    raw_intent_val = rec.raw_intent if rec.raw_intent is not None else meta.get("raw_intent")
    safe_intent_val = rec.safe_intent if rec.safe_intent is not None else meta.get("safe_intent")
    analysis_val = rec.analysis or meta.get("analysis") or {}
    report_val = rec.report or meta.get("report") or {}

    return JobResultResponse(
        job_id=job_id,
        status=rec.status,
        analysis=to_json_safe(analysis_val),
        raw_intent=to_json_safe(raw_intent_val) if raw_intent_val is not None else None,
        safe_intent=to_json_safe(safe_intent_val) if safe_intent_val is not None else None,
        report=to_json_safe(report_val),
        input_url=f"/api/jobs/{job_id}/files/input",
        master_wav_url=f"/api/jobs/{job_id}/files/master",
        exports=rec.exports,
        streaming_notes=rec.streaming_notes,
        memory_profile=rec.memory_profile or [],
        dsp_params=_dsp_params_for(rec),
    )


def build_ws_result_payload(rec: JobRecord) -> dict[str, Any]:
    """WebSocket result message (JSON-serializable dict)."""
    result = build_job_result(rec)
    return {
        "type": "result",
        **result.model_dump(mode="json"),
    }
