"""Build job result payloads with role-based field filtering."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from api.schemas import JobResultResponse, JobStatus, MasterInfo
from auth.schemas import UserRole
from mastering.preview import load_render_context
from services.job_store import JobRecord
from utils.json_safe import to_json_safe


def _build_master_info(rec: JobRecord) -> MasterInfo | None:
    """Appwrite cloud presence for the final mastered audio (or None when absent)."""
    if not rec.master_path:
        return None
    state = rec.appwrite_state or "none"
    if state not in ("uploaded", "failed", "expired"):
        state = "none"
    return MasterInfo(
        filename=rec.appwrite_filename or rec.master_path.name,
        file_id=rec.appwrite_file_id,
        expires_at=rec.appwrite_expires_at,
        download_url=rec.appwrite_download_url,
        state=state,
        error=rec.appwrite_error,
    )


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


_WAVEFORM_BUCKETS = 100


def _waveform_peaks(analysis: dict[str, Any]) -> list[float]:
    """Downsample per-second RMS from temporal_analysis into ~100 normalized bars.

    This lets the frontend render the waveform from the result payload instead of
    downloading the full WAV/FLAC just to draw bars — a large bandwidth saving on
    the deployed instance.
    """
    temporal = analysis.get("temporal_analysis")
    if not isinstance(temporal, list) or not temporal:
        return []
    values: list[float] = []
    for row in temporal:
        if not isinstance(row, dict):
            continue
        rms = row.get("rms")
        if isinstance(rms, (int, float)) and rms > 0.0:
            values.append(float(rms))
    if not values:
        return []

    n = len(values)
    if n >= _WAVEFORM_BUCKETS:
        seg = n / _WAVEFORM_BUCKETS
        bars: list[float] = []
        for b in range(_WAVEFORM_BUCKETS):
            s = int(b * seg)
            e = max(s + 1, int((b + 1) * seg))
            bars.append(float(max(values[s:e])))  # peak per bucket (envelope)
    else:
        bars = list(values)
        bars.extend([0.0] * (_WAVEFORM_BUCKETS - n))

    peak_max = max(bars) or 1.0
    return [round(min(1.0, v / peak_max), 4) for v in bars]


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
    meta = _metadata_snapshot(rec)
    analysis_val = rec.analysis or meta.get("analysis") or {}

    # master_playback_url: browser playback WAV via /files/master
    # master_wav_url: canonical 24-bit WAV download via /files/master_wav
    playback_url = f"/api/jobs/{job_id}/files/master"
    wav_url = f"/api/jobs/{job_id}/files/master_wav"

    if is_rollout:
        return JobResultResponse(
            job_id=job_id,
            status=rec.status,
            analysis={},
            raw_intent=None,
            safe_intent=None,
            report={},
            input_url="",
            master_wav_url=wav_url,
            master_playback_url=playback_url,
            waveform_peaks=_waveform_peaks(analysis_val if isinstance(analysis_val, dict) else {}),
            exports=[],
            streaming_notes=[],
            memory_profile=[],
            master=_build_master_info(rec),
            finalizing=rec.finalizing,
            finalize_error=rec.finalize_error,
        )

    raw_intent_val = rec.raw_intent if rec.raw_intent is not None else meta.get("raw_intent")
    safe_intent_val = rec.safe_intent if rec.safe_intent is not None else meta.get("safe_intent")
    report_val = rec.report or meta.get("report") or {}

    return JobResultResponse(
        job_id=job_id,
        status=rec.status,
        analysis=to_json_safe(analysis_val),
        raw_intent=to_json_safe(raw_intent_val) if raw_intent_val is not None else None,
        safe_intent=to_json_safe(safe_intent_val) if safe_intent_val is not None else None,
        report=to_json_safe(report_val),
        input_url=f"/api/jobs/{job_id}/files/input",
        master_wav_url=wav_url,
        master_playback_url=playback_url,
        waveform_peaks=_waveform_peaks(analysis_val if isinstance(analysis_val, dict) else {}),
        exports=rec.exports,
        streaming_notes=rec.streaming_notes,
        memory_profile=rec.memory_profile or [],
        dsp_params=_dsp_params_for(rec),
        master=_build_master_info(rec),
        finalizing=rec.finalizing,
        finalize_error=rec.finalize_error,
    )


def build_cloud_job_result(job_id: str, pending: dict[str, Any]) -> JobResultResponse:
    """Build the minimal result payload after local ephemeral files are gone."""
    filename = str(pending.get("filename") or "master.wav")
    return JobResultResponse(
        job_id=job_id,
        status="completed",
        analysis={},
        report={},
        input_url="",
        master_wav_url=f"/api/jobs/{job_id}/master/download",
        master_playback_url=f"/api/jobs/{job_id}/master/download",
        master=MasterInfo(
            filename=filename,
            file_id=pending.get("file_id"),
            expires_at=datetime.fromisoformat(pending["expires_at"]) if pending.get("expires_at") else None,
            download_url=pending.get("download_url"),
            state="uploaded",
        ),
    )


def build_ws_result_payload(rec: JobRecord) -> dict[str, Any]:
    """WebSocket result message (JSON-serializable dict)."""
    result = build_job_result(rec)
    return {
        "type": "result",
        **result.model_dump(mode="json"),
    }
