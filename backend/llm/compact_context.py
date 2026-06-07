"""Build minimal token-efficient context for the mastering LLM (no raw time series)."""

from __future__ import annotations

import json
from typing import Any

from analysis.insight_compression import (
    emotional_arc_one_liner,
    risk_digest,
    spectral_evolution_summary,
    stereo_behavior_summary,
    summarize_transitions,
    temporal_series_insights,
)


def round_floats(obj: Any, ndigits: int = 2) -> Any:
    """Round floats recursively for JSON compaction."""
    if isinstance(obj, float):
        return round(obj, ndigits)
    if isinstance(obj, dict):
        return {k: round_floats(v, ndigits) for k, v in obj.items()}
    if isinstance(obj, list):
        return [round_floats(x, ndigits) for x in obj]
    return obj


def _merge_two_sections(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Merge adjacent section rows (numeric means, time span union)."""
    keys_mean = [
        "lufs_proxy",
        "dynamic_range_db",
        "rms",
        "spectral_centroid_hz",
        "spectral_rolloff_hz",
        "spectral_contrast",
        "transient_density",
        "punch_score",
        "low_end_energy",
        "sub_energy",
        "vocal_presence",
        "harshness_index",
        "warmth_index",
        "brightness_index",
        "sibilance_risk",
        "emotional_intensity_estimation",
        "immersion_depth_estimation",
    ]
    out: dict[str, Any] = {
        "section": f"{a.get('section', '?')}+{b.get('section', '?')}"[:40],
        "start_sec": min(float(a.get("start_sec", 0.0)), float(b.get("start_sec", 0.0))),
        "end_sec": max(float(a.get("end_sec", 0.0)), float(b.get("end_sec", 0.0))),
    }
    for k in keys_mean:
        va = float(a.get(k, 0.0))
        vb = float(b.get(k, 0.0))
        out[k] = (va + vb) * 0.5
    return out


def cap_sections(sectional: list[dict[str, Any]], max_sections: int = 12) -> list[dict[str, Any]]:
    """Ensure at most `max_sections` rows by merging pairs; keep at least 1 row."""
    rows = list(sectional)
    if not rows:
        return rows
    while len(rows) > max_sections:
        merged: list[dict[str, Any]] = []
        i = 0
        while i < len(rows):
            if i + 1 < len(rows):
                merged.append(_merge_two_sections(rows[i], rows[i + 1]))
                i += 2
            else:
                merged.append(rows[i])
                i += 1
        rows = merged
    return rows


def slim_global(global_summary: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "duration_sec",
        "lufs",
        "true_peak_dbfs",
        "crest_factor_db",
        "rms_linear",
        "stereo_width",
        "phase_correlation",
        "dynamic_range_db",
        "spectral_centroid_hz",
        "spectral_rolloff_hz",
        "spectral_contrast",
        "transient_density",
        "punch_score",
        "low_end_energy",
        "sub_energy",
        "vocal_presence",
        "harshness_index",
        "warmth_index",
        "brightness_index",
        "sibilance_risk",
        "mono_compatibility",
        "codec_vulnerability",
        "emotional_intensity_estimation",
        "immersion_depth_estimation",
    ]
    return {k: global_summary[k] for k in keys if k in global_summary}


def slim_section_row(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "section": str(s.get("section", ""))[:24],
        "t0": float(s.get("start_sec", 0.0)),
        "t1": float(s.get("end_sec", 0.0)),
        "lu": float(s.get("lufs_proxy", 0.0)),
        "dyn": float(s.get("dynamic_range_db", 0.0)),
        "voc": float(s.get("vocal_presence", 0.0)),
        "pch": float(s.get("punch_score", 0.0)),
        "cent": float(s.get("spectral_centroid_hz", 0.0)),
        "harsh": float(s.get("harshness_index", 0.0)),
        "bri": float(s.get("brightness_index", 0.0)),
    }


def _temporal_anchors(temporal_bins: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """At most 3 time anchors (not a full series)."""
    if not temporal_bins:
        return []
    idxs = {0, len(temporal_bins) // 2, len(temporal_bins) - 1}
    out: list[dict[str, Any]] = []
    for i in sorted(idxs):
        b = temporal_bins[i]
        out.append(
            {
                "t0": float(b.get("time_start_sec", 0.0)),
                "lu": float(b.get("lufs_proxy", 0.0)),
                "dyn": float(b.get("dynamic_range_db", 0.0)),
                "bri": float(b.get("brightness_index", 0.0)),
                "voc": float(b.get("vocal_presence", 0.0)),
            }
        )
    return out


def estimate_json_tokens(payload: dict[str, Any]) -> int:
    """Rough token estimate (~4 chars per token for English-ish JSON)."""
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    return max(1, len(raw) // 4)


class CompactContextBuilder:
    """Aggregates analysis → compact LLM input (insights + rounded scalars, no temporal arrays)."""

    @staticmethod
    def build(full_analysis: dict[str, Any]) -> dict[str, Any]:
        gs = full_analysis.get("global_summary") or {}
        sectional = full_analysis.get("sectional_analysis") or []
        temporal_bins = full_analysis.get("temporal_analysis") or []
        events = full_analysis.get("transition_events") or []
        emotional_full = dict(full_analysis.get("emotional_features") or {})
        translation = dict(full_analysis.get("translation_features") or {})
        reference = dict(full_analysis.get("reference_comparison_data") or {})

        intent_cap = 280
        max_sections = 12
        max_trans = 12
        include_anchors = True
        include_emotional_blob = True

        def _assemble() -> dict[str, Any]:
            emotional = dict(emotional_full)
            emotional.pop("sectional_emotional_arc", None)

            sectional_capped = cap_sections(sectional, max_sections=max_sections)
            curves = temporal_series_insights(temporal_bins)
            transition_prose, transition_slim = summarize_transitions(events, max_items=max_trans)

            payload: dict[str, Any] = {
                "global_analysis": slim_global(gs),
                "sectional_analysis": [slim_section_row(s) for s in sectional_capped],
                "temporal_insights": {
                    **curves,
                    "stereo_behavior": stereo_behavior_summary(gs, sectional_capped),
                    "spectral_evolution": spectral_evolution_summary(temporal_bins),
                },
                "transition_summary": transition_prose,
                "transition_peaks": transition_slim,
                "emotional_arc": emotional_arc_one_liner(sectional_capped),
                "translation_features": translation,
                "risk_digest": risk_digest(gs, translation),
                "reference_comparison": reference,
                "meta": {
                    "target_platform": str(full_analysis.get("target_platform", ""))[:64],
                    "user_intent": str(full_analysis.get("user_intent", ""))[:intent_cap],
                },
            }
            if include_anchors:
                payload["temporal_anchors"] = _temporal_anchors(temporal_bins)
            if include_emotional_blob:
                payload["emotional_compact"] = emotional
            rounded = round_floats(payload, ndigits=2)
            rounded["meta"]["estimated_input_tokens"] = estimate_json_tokens(rounded)
            return rounded

        payload = _assemble()
        # Hard cap ~8k estimated tokens: progressively drop low-value fields
        while payload["meta"]["estimated_input_tokens"] > 8000 and include_anchors:
            include_anchors = False
            payload = _assemble()
        while payload["meta"]["estimated_input_tokens"] > 8000 and include_emotional_blob:
            include_emotional_blob = False
            payload = _assemble()
        while payload["meta"]["estimated_input_tokens"] > 8000 and max_trans > 4:
            max_trans -= 2
            payload = _assemble()
        while payload["meta"]["estimated_input_tokens"] > 8000 and intent_cap > 80:
            intent_cap = max(80, intent_cap - 80)
            payload = _assemble()
        while payload["meta"]["estimated_input_tokens"] > 8000 and max_sections > 6:
            max_sections = max(6, max_sections - 2)
            payload = _assemble()

        payload["meta"]["compression_flags"] = {
            "max_sections": max_sections,
            "max_transition_peaks": max_trans,
            "user_intent_chars": intent_cap,
            "temporal_anchors": include_anchors,
            "emotional_compact": include_emotional_blob,
        }
        return payload
