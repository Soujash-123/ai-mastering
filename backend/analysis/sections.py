from __future__ import annotations

from typing import Any

import numpy as np


SECTION_ORDER = ["intro", "verse", "pre_chorus", "chorus", "bridge", "drop", "outro"]


def detect_sections(duration_sec: float) -> list[dict[str, Any]]:
    # Lightweight deterministic segmentation; modular entry point for model-based sectioning later.
    if duration_sec <= 0.0:
        return [{"section": "intro", "start_sec": 0.0, "end_sec": 0.0}]

    anchors = [0.0, 0.1, 0.32, 0.46, 0.62, 0.78, 0.9, 1.0]
    times = [duration_sec * a for a in anchors]
    out: list[dict[str, Any]] = []
    for i, name in enumerate(SECTION_ORDER):
        out.append(
            {
                "section": name,
                "start_sec": float(times[i]),
                "end_sec": float(times[i + 1]),
            }
        )
    return out


def summarize_sectional_analysis(
    frame_times: np.ndarray,
    frames: dict[str, Any],
    sections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    for sec in sections:
        start, end = float(sec["start_sec"]), float(sec["end_sec"])
        mask = (frame_times >= start) & (frame_times < end)
        if not np.any(mask):
            continue

        def meanv(name: str) -> float:
            return float(np.mean(frames[name][mask]))

        rms = frames["rms"][mask]
        dyn = float(np.percentile(rms, 95) / (np.percentile(rms, 5) + 1e-12))

        items.append(
            {
                "section": sec["section"],
                "start_sec": start,
                "end_sec": end,
                "lufs_proxy": float(20.0 * np.log10(np.mean(rms) + 1e-12)),
                "dynamic_range_db": float(20.0 * np.log10(dyn + 1e-12)),
                "rms": meanv("rms"),
                "spectral_centroid_hz": meanv("spectral_centroid"),
                "spectral_rolloff_hz": meanv("spectral_rolloff"),
                "spectral_contrast": meanv("spectral_contrast"),
                "transient_density": meanv("transient_density"),
                "punch_score": meanv("punch_score"),
                "low_end_energy": meanv("low_end_energy"),
                "sub_energy": meanv("sub_energy"),
                "vocal_presence": meanv("vocal_presence"),
                "harshness_index": meanv("harshness_index"),
                "warmth_index": meanv("warmth_index"),
                "brightness_index": meanv("brightness_index"),
                "sibilance_risk": meanv("sibilance_risk"),
                "emotional_intensity_estimation": float(np.clip(meanv("punch_score") * 0.6 + meanv("rms") * 6.0, 0.0, 10.0)),
                "immersion_depth_estimation": float(np.clip(meanv("warmth_index") + meanv("spectral_contrast") * 0.1, 0.0, 10.0)),
            }
        )
    return items

