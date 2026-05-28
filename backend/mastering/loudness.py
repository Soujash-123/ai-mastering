"""Gradual loudness normalization + gentle perceptual density (no broadband tanh stack)."""

from __future__ import annotations

import numpy as np
import pyloudnorm as pyln
from scipy import signal

from mastering.dsp_params import SafeDSPParams
from mastering.limiter import mastering_limiter


def _low_mid_density(stereo: np.ndarray, sr: int, amount: float) -> np.ndarray:
    if amount < 0.04:
        return stereo
    nyq = sr / 2.0
    sos = signal.butter(2, min(320.0, nyq * 0.9) / nyq, btype="low", output="sos")
    out = stereo.copy().astype(np.float64)
    for ch in range(stereo.shape[0]):
        band = signal.sosfilt(sos, stereo[ch].astype(np.float64))
        out[ch] = stereo[ch] + band * amount * 0.045
    return out


def perceptual_loudness_optimize(stereo: np.ndarray, sr: int, params: SafeDSPParams) -> np.ndarray:
    """Early-stage spectral density only — avoids late tanh overload."""
    return _low_mid_density(stereo, sr, params.perceptual_density)


def gradual_loudness_normalize(stereo: np.ndarray, sr: int, params: SafeDSPParams) -> np.ndarray:
    """Multi-pass LUFS approach: small gain steps with limiter between (no +10 dB slam)."""
    meter = pyln.Meter(sr)
    out = stereo.astype(np.float64, copy=True)
    max_step_db = 2.5
    passes = 5

    for _ in range(passes):
        try:
            current = meter.integrated_loudness(out.T)
            if not np.isfinite(current):
                break
            delta = float(params.target_lufs - current)
            if abs(delta) < 0.35:
                break
            step_db = float(np.clip(delta, -max_step_db, max_step_db))
            out *= 10 ** (step_db / 20.0)
            out = mastering_limiter(out, sr, params)
        except Exception:
            break

    return out.astype(np.float64, copy=False)


def loudness_normalize(stereo: np.ndarray, sr: int, params: SafeDSPParams) -> np.ndarray:
    return gradual_loudness_normalize(stereo, sr, params)
