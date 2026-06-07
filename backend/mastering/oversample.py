"""High-quality oversampling for nonlinear mastering stages."""

from __future__ import annotations

import numpy as np
from scipy import signal


def oversample(x: np.ndarray, factor: int) -> np.ndarray:
    if factor <= 1:
        return np.asarray(x, dtype=np.float64)
    return signal.resample_poly(x, factor, 1).astype(np.float64)


def downsample(x: np.ndarray, factor: int, orig_len: int) -> np.ndarray:
    if factor <= 1:
        return np.asarray(x[:orig_len], dtype=np.float64)
    y = signal.resample_poly(x, 1, factor).astype(np.float64)
    n = min(orig_len, len(y))
    return y[:n]


def process_nonlinear_os(
    x: np.ndarray,
    sr: int,
    factor: int,
    fn,
) -> np.ndarray:
    """Apply nonlinear `fn` at `factor` oversampling with length-matched output."""
    x = np.asarray(x, dtype=np.float64)
    if factor <= 1:
        return fn(x).astype(np.float64)
    up = oversample(x, factor)
    wet = fn(up)
    return downsample(wet, factor, len(x))


def true_peak(stereo: np.ndarray, factor: int = 8) -> float:
    peak = 0.0
    for ch in range(stereo.shape[0]):
        up = oversample(stereo[ch], factor)
        peak = max(peak, float(np.max(np.abs(up))))
    return peak
