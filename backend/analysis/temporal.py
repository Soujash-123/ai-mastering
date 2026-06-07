from __future__ import annotations

from typing import Any

import numpy as np


def build_temporal_analysis(
    frame_times: np.ndarray,
    frames: dict[str, Any],
    interval_sec: float = 1.0,
) -> list[dict[str, Any]]:
    if frame_times.size == 0:
        return []
    end = float(frame_times[-1])
    bins = np.arange(0.0, end + interval_sec, interval_sec)
    if bins.size < 2:
        bins = np.array([0.0, max(interval_sec, end)])

    out: list[dict[str, Any]] = []
    for i in range(len(bins) - 1):
        start, stop = float(bins[i]), float(bins[i + 1])
        mask = (frame_times >= start) & (frame_times < stop)
        if not np.any(mask):
            continue

        rms = frames["rms"][mask]
        dyn = float(np.percentile(rms, 95) / (np.percentile(rms, 5) + 1e-12))
        out.append(
            {
                "time_start_sec": start,
                "time_end_sec": stop,
                "lufs_proxy": float(20.0 * np.log10(np.mean(rms) + 1e-12)),
                "rms": float(np.mean(rms)),
                "crest_factor_db": float(20.0 * np.log10((np.max(rms) + 1e-12) / (np.mean(rms) + 1e-12))),
                "dynamic_range_db": float(20.0 * np.log10(dyn + 1e-12)),
                "spectral_centroid_hz": float(np.mean(frames["spectral_centroid"][mask])),
                "spectral_rolloff_hz": float(np.mean(frames["spectral_rolloff"][mask])),
                "spectral_contrast": float(np.mean(frames["spectral_contrast"][mask])),
                "transient_density": float(np.mean(frames["transient_density"][mask])),
                "punch_score": float(np.mean(frames["punch_score"][mask])),
                "low_end_energy": float(np.mean(frames["low_end_energy"][mask])),
                "sub_energy": float(np.mean(frames["sub_energy"][mask])),
                "vocal_presence": float(np.mean(frames["vocal_presence"][mask])),
                "harshness_index": float(np.mean(frames["harshness_index"][mask])),
                "warmth_index": float(np.mean(frames["warmth_index"][mask])),
                "brightness_index": float(np.mean(frames["brightness_index"][mask])),
                "sibilance_risk": float(np.mean(frames["sibilance_risk"][mask])),
            }
        )
    return out

