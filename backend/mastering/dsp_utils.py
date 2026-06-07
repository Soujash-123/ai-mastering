"""Float64 mastering utilities, metering, and inter-stage gain staging."""

from __future__ import annotations

import numpy as np


def as_f64(stereo: np.ndarray) -> np.ndarray:
    return np.asarray(stereo, dtype=np.float64)


def as_f32(stereo: np.ndarray) -> np.ndarray:
    return np.asarray(stereo, dtype=np.float32)


def measure(stereo: np.ndarray) -> dict[str, float]:
    peak = float(np.max(np.abs(stereo)) + 1e-15)
    rms = float(np.sqrt(np.mean(stereo**2)) + 1e-15)
    crest = peak / rms
    return {"peak": peak, "rms": rms, "crest_db": float(20.0 * np.log10(crest))}


def gain_stage(
    stereo: np.ndarray,
    peak_ceiling: float = 0.92,
    rms_ceiling: float | None = None,
    min_crest_db: float | None = None,
) -> np.ndarray:
    """Auto-trim after each major stage to prevent downstream overload."""
    out = stereo.copy()
    m = measure(out)
    if m["peak"] > peak_ceiling:
        out *= peak_ceiling / m["peak"]
        m = measure(out)
    if rms_ceiling is not None and m["rms"] > rms_ceiling:
        out *= rms_ceiling / m["rms"]
        m = measure(out)
    if min_crest_db is not None and m["crest_db"] < min_crest_db:
        # Too squashed — gentle lift of crest (reduce RMS slightly)
        target_crest = 10 ** (min_crest_db / 20.0)
        desired_rms = m["peak"] / target_crest
        if m["rms"] < desired_rms:
            out *= np.clip(desired_rms / m["rms"], 1.0, 1.08)
    return out


def blend_dry_wet(dry: np.ndarray, wet: np.ndarray, mix: float) -> np.ndarray:
    mix = float(np.clip(mix, 0.0, 1.0))
    return (dry * (1.0 - mix) + wet * mix).astype(np.float64, copy=False)
