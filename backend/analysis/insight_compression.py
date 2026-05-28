"""Compress frame-level / temporal descriptors into prose trends for LLM (no raw time series)."""

from __future__ import annotations

from collections import Counter
from typing import Any


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _split_thirds(values: list[float]) -> tuple[list[float], list[float], list[float]]:
    n = len(values)
    if n == 0:
        return [], [], []
    a, b = n // 3, (2 * n) // 3
    return values[:a], values[a:b], values[b:] if b > a else values[a:]


def _trend_word(early: float, mid: float, late: float, *, higher_is: str = "more") -> str:
    """Return a short trend label from three segment means."""
    d_em = mid - early
    d_ml = late - mid
    thr = max(0.02 * (abs(early) + abs(mid) + abs(late)) / 3.0 + 1e-6, 0.03)
    rising = late > early + thr
    falling = late < early - thr
    arch = mid > early + thr and mid > late + thr
    dip = mid < early - thr and mid < late - thr
    if arch:
        return f"arc up then down ({higher_is} mid)"
    if dip:
        return f"dip mid ({higher_is} lower middle)"
    if rising and d_ml > thr * 0.5:
        return f"steady rise toward tail ({higher_is} louder/denser later)"
    if falling:
        return f"ebb toward tail ({higher_is} less later)"
    if abs(d_em) + abs(d_ml) < thr:
        return f"mostly flat ({higher_is} stable)"
    return "mixed contour"


def _curve_from_series(values: list[float], *, higher_is: str) -> str:
    a, b, c = _split_thirds(values)
    return _trend_word(_mean(a), _mean(b), _mean(c), higher_is=higher_is)


def temporal_series_insights(temporal_bins: list[dict[str, Any]]) -> dict[str, str]:
    """Build curve descriptions from aggregated temporal bins only (caller does not ship bins to LLM)."""
    if not temporal_bins:
        return {
            "energy_curve": "insufficient temporal resolution",
            "brightness_curve": "insufficient temporal resolution",
            "dynamic_behavior": "insufficient temporal resolution",
            "vocal_motion": "insufficient temporal resolution",
            "spectral_tilt_motion": "insufficient temporal resolution",
            "transient_motion": "insufficient temporal resolution",
            "punch_motion": "insufficient temporal resolution",
        }

    lu = [float(b.get("lufs_proxy", 0.0)) for b in temporal_bins]
    bright = [float(b.get("brightness_index", 0.0)) for b in temporal_bins]
    dyn = [float(b.get("dynamic_range_db", 0.0)) for b in temporal_bins]
    voc = [float(b.get("vocal_presence", 0.0)) for b in temporal_bins]
    cent = [float(b.get("spectral_centroid_hz", 0.0)) for b in temporal_bins]
    punch = [float(b.get("punch_score", 0.0)) for b in temporal_bins]
    transient = [float(b.get("transient_density", 0.0)) for b in temporal_bins]

    return {
        "energy_curve": _curve_from_series(lu, higher_is="energy"),
        "brightness_curve": _curve_from_series(bright, higher_is="brightness"),
        "dynamic_behavior": _curve_from_series(dyn, higher_is="dynamics spread"),
        "vocal_motion": _curve_from_series(voc, higher_is="vocal band"),
        "spectral_tilt_motion": _curve_from_series(cent, higher_is="brightness/tilt"),
        "transient_motion": _curve_from_series(transient, higher_is="onset density"),
        "punch_motion": _curve_from_series(punch, higher_is="impact"),
    }


def stereo_behavior_summary(
    global_summary: dict[str, Any],
    sectional_analysis: list[dict[str, Any]],
) -> str:
    """No per-frame stereo in bins; infer from global width / phase + section contrast spread."""
    w = float(global_summary.get("stereo_width", 0.0))
    ph = float(global_summary.get("phase_correlation", 1.0))
    contrasts = [float(s.get("spectral_contrast", 0.0)) for s in sectional_analysis]
    spread = max(contrasts) - min(contrasts) if contrasts else 0.0
    if w > 1.15 and spread > 0.15:
        return "wide image with strong section-to-section spectral contrast swings (likely width/arrangement shifts)"
    if w > 1.08:
        return "moderately wide; maintain mono-safe lows"
    if ph < 0.35:
        return "weak L/R correlation at times; prioritize mono compatibility over width"
    return "conservative stereo; focus center anchor"


def summarize_transitions(events: list[dict[str, Any]], max_items: int = 14) -> tuple[str, list[dict[str, Any]]]:
    """Bulleted-style summary + tiny list for model (no verbose fields)."""
    if not events:
        return "no strong automated transition flags", []

    counts = Counter(str(e.get("event", "?")) for e in events)
    top = counts.most_common(4)
    summary_bits = [f"{k}×{v}" for k, v in top]
    prose = "events: " + ", ".join(summary_bits)

    slim: list[dict[str, Any]] = []
    for e in sorted(events, key=lambda x: float(x.get("time_sec", 0.0)))[:max_items]:
        slim.append(
            {
                "e": str(e.get("event", ""))[:32],
                "t": round(float(e.get("time_sec", 0.0)), 2),
                "s": round(float(e.get("strength", 0.0)), 2),
            }
        )
    return prose, slim


def risk_digest(global_summary: dict[str, Any], translation: dict[str, Any]) -> str:
    h = float(global_summary.get("harshness_index", 0.0))
    sib = float(global_summary.get("sibilance_risk", 0.0))
    codec_v = float(global_summary.get("codec_vulnerability", 0.0))
    mono = float(global_summary.get("mono_compatibility", 1.0))
    hb = float(translation.get("high_band_risk", 0.0))
    le = float(translation.get("low_end_translation_risk", 0.0))
    parts: list[str] = []
    if h > 1.2 or hb > 1.8:
        parts.append("upper-mid/air harshness accumulation risk")
    if sib > 1.1:
        parts.append("sibilance-hot zones")
    if le > 1.25:
        parts.append("low-end masking on small speakers")
    if codec_v > 1.2:
        parts.append("codec brittleness vulnerability")
    if mono < 0.65:
        parts.append("mono collapse risk")
    return "; ".join(parts) if parts else "no dominant automated risk flags"


def emotional_arc_one_liner(sectional_analysis: list[dict[str, Any]]) -> str:
    if not sectional_analysis:
        return "unknown arc"
    keys = [(str(s.get("section", "?")), float(s.get("emotional_intensity_estimation", 0.0))) for s in sectional_analysis]
    peak = max(keys, key=lambda x: x[1])
    low = min(keys, key=lambda x: x[1])
    return f"intensity trough near {low[0]} (~{round(low[1], 2)}), peak near {peak[0]} (~{round(peak[1], 2)})"


def spectral_evolution_summary(temporal_bins: list[dict[str, Any]]) -> str:
    if len(temporal_bins) < 2:
        return "limited evolution data"
    c0 = float(temporal_bins[0].get("spectral_centroid_hz", 0.0))
    c1 = float(temporal_bins[-1].get("spectral_centroid_hz", 0.0))
    r0 = float(temporal_bins[0].get("spectral_rolloff_hz", 0.0))
    r1 = float(temporal_bins[-1].get("spectral_rolloff_hz", 0.0))
    dc = c1 - c0
    dr = r1 - r0
    if abs(dc) < 120 and abs(dr) < 400:
        return "spectral tilt largely stable throughout"
    tilt = "brighter toward end" if dc > 120 else ("darker toward end" if dc < -120 else "centroid mixed")
    air = " more air/extension late" if dr > 500 else (" less extension late" if dr < -500 else "")
    return tilt + air
