"""Multi-band analog harmonic engine with oversampled nonlinear processing."""

from __future__ import annotations

import numpy as np
from scipy import signal

from mastering.dsp_params import MasteringDSPPlan
from mastering.oversample import process_nonlinear_os


def _transformer_bass(x: np.ndarray, amount: float) -> np.ndarray:
    drive = 1.0 + amount * 1.6
    pos = np.tanh(x * drive * 0.85)
    neg = np.tanh(x * drive * 1.05) * 0.96
    wet = np.where(x >= 0, pos, neg)
    return (1.0 - amount) * x + amount * wet


def _tape_mid(x: np.ndarray, amount: float) -> np.ndarray:
    drive = 1.0 + amount * 1.4
    wet = x * (1.0 - 0.05 * x * x * drive)
    wet = np.tanh(wet * drive) / np.tanh(drive)
    return (1.0 - amount) * x + amount * wet


def _tube_high(x: np.ndarray, amount: float) -> np.ndarray:
    drive = 1.0 + amount * 1.2
    wet = np.tanh(x * drive) + 0.04 * amount * (x**2) * np.sign(x)
    wet = wet / (1.0 + 0.12 * amount)
    return (1.0 - amount) * x + amount * wet


def _split_4band(x: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    nyq = sr / 2.0
    sos_sub = signal.butter(3, min(50.0, nyq * 0.75) / nyq, btype="low", output="sos")
    sos_bass = signal.butter(
        3,
        [min(50.0, nyq * 0.75) / nyq, min(180.0, nyq * 0.95) / nyq],
        btype="band",
        output="sos",
    )
    sos_air = signal.butter(3, min(5200.0, nyq * 0.98) / nyq, btype="high", output="sos")
    sub = signal.sosfilt(sos_sub, x)
    bass = signal.sosfilt(sos_bass, x)
    high = signal.sosfilt(sos_air, x)
    mid = x - sub - bass - high
    return sub, bass, mid, high


def analog_harmonic_engine(stereo: np.ndarray, sr: int, plan: MasteringDSPPlan) -> np.ndarray:
    p = plan.params
    factor = max(4, int(getattr(p, "oversample_factor", 8)))
    out = np.zeros_like(stereo, dtype=np.float32)
    sm = float(np.clip(plan.sat_mod, 0.75, 1.15))

    for ch in range(stereo.shape[0]):
        x = stereo[ch].astype(np.float64, copy=False)
        sub, bass, mid, high = _split_4band(x, sr)

        a_sub = float(np.clip(p.saturation_amount * 0.04, 0.0, 0.06))
        a_bass = float(np.clip(p.harmonic_low + p.saturation_amount * 0.28, 0.0, 0.42))
        a_mid = float(np.clip(p.harmonic_mid + p.saturation_amount * 0.32, 0.0, 0.45))
        a_high = float(np.clip(p.harmonic_high + p.saturation_amount * 0.22, 0.0, 0.32))

        if sm != 1.0:
            a_bass *= sm
            a_mid *= sm
            a_high *= sm

        sub_w = sub * (1.0 - a_sub) + np.tanh(sub * (1.0 + a_sub * 0.5)) * a_sub * 0.02
        bass_w = process_nonlinear_os(bass, sr, factor, lambda b, a=a_bass: _transformer_bass(b, a))
        mid_w = process_nonlinear_os(mid, sr, factor, lambda m, a=a_mid: _tape_mid(m, a))
        high_w = process_nonlinear_os(high, sr, factor, lambda h, a=a_high: _tube_high(h, a))

        out[ch] = sub_w + bass_w + mid_w + high_w

    return out.astype(np.float32, copy=False)
