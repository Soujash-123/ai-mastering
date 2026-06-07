"""Biquad coefficients (Robert Bristow-Johnson Audio EQ Cookbook style, simplified)."""

from __future__ import annotations

import math

import numpy as np
from scipy import signal


def _biquad_sos(b0: float, b1: float, b2: float, a0: float, a1: float, a2: float) -> np.ndarray:
    return np.array([[b0 / a0, b1 / a0, b2 / a0, 1.0, a1 / a0, a2 / a0]])


def low_shelf_sos(fc: float, gain_db: float, sr: float, q: float = 0.707) -> np.ndarray:
    a = math.pow(10.0, gain_db / 40.0)
    w0 = 2 * math.pi * fc / sr
    cos_w0 = math.cos(w0)
    sin_w0 = math.sin(w0)
    beta = math.sqrt(a) / q
    b0 = a * ((a + 1) - (a - 1) * cos_w0 + beta * sin_w0)
    b1 = 2 * a * ((a - 1) - (a + 1) * cos_w0)
    b2 = a * ((a + 1) - (a - 1) * cos_w0 - beta * sin_w0)
    a0 = (a + 1) + (a - 1) * cos_w0 + beta * sin_w0
    a1 = -2 * ((a - 1) + (a + 1) * cos_w0)
    a2 = (a + 1) + (a - 1) * cos_w0 - beta * sin_w0
    return _biquad_sos(b0, b1, b2, a0, a1, a2)


def high_shelf_sos(fc: float, gain_db: float, sr: float, q: float = 0.707) -> np.ndarray:
    a = math.pow(10.0, gain_db / 40.0)
    w0 = 2 * math.pi * fc / sr
    cos_w0 = math.cos(w0)
    sin_w0 = math.sin(w0)
    beta = math.sqrt(a) / q
    b0 = a * ((a + 1) + (a - 1) * cos_w0 + beta * sin_w0)
    b1 = -2 * a * ((a - 1) + (a + 1) * cos_w0)
    b2 = a * ((a + 1) + (a - 1) * cos_w0 - beta * sin_w0)
    a0 = (a + 1) - (a - 1) * cos_w0 + beta * sin_w0
    a1 = 2 * ((a - 1) - (a + 1) * cos_w0)
    a2 = (a + 1) - (a - 1) * cos_w0 - beta * sin_w0
    return _biquad_sos(b0, b1, b2, a0, a1, a2)


def peaking_sos(fc: float, gain_db: float, sr: float, q: float) -> np.ndarray:
    a = math.pow(10.0, gain_db / 40.0)
    w0 = 2 * math.pi * fc / sr
    cos_w0 = math.cos(w0)
    sin_w0 = math.sin(w0)
    alpha = sin_w0 / (2 * q)
    b0 = 1 + alpha * a
    b1 = -2 * cos_w0
    b2 = 1 - alpha * a
    a0 = 1 + alpha / a
    a1 = -2 * cos_w0
    a2 = 1 - alpha / a
    return _biquad_sos(b0, b1, b2, a0, a1, a2)


def sos_chain_filter(x: np.ndarray, sos_list: list[np.ndarray], zero_phase: bool = False) -> np.ndarray:
    y = np.asarray(x, dtype=np.float64)
    for sos in sos_list:
        if zero_phase and len(y) > 8:
            y = signal.sosfiltfilt(sos, y)
        else:
            y = signal.sosfilt(sos, y)
    return y.astype(np.float64, copy=False)
