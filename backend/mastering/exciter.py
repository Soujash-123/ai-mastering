"""Psychoacoustic exciter with oversampled harmonics (gentle air enhancement)."""

from __future__ import annotations

import numpy as np
from scipy import signal

from mastering.dsp_params import MasteringDSPPlan
from mastering.oversample import process_nonlinear_os


def psychoacoustic_exciter(stereo: np.ndarray, sr: int, plan: MasteringDSPPlan) -> np.ndarray:
    amount = float(np.clip(plan.params.exciter_amount, 0.0, 0.35))
    if amount < 0.02:
        return stereo.astype(np.float64, copy=False)

    if plan.exciter_curve is not None:
        amount *= float(np.clip(np.mean(plan.exciter_curve), 0.75, 1.15))

    nyq = sr / 2.0
    fc = min(4800.0, nyq * 0.92)
    sos_hp = signal.butter(3, fc / nyq, btype="high", output="sos")
    factor = max(4, int(getattr(plan.params, "oversample_factor", 8)))
    out = np.zeros_like(stereo, dtype=np.float64)

    for ch in range(stereo.shape[0]):
        x = stereo[ch].astype(np.float64)
        air = signal.sosfilt(sos_hp, x)

        def _excite(band: np.ndarray) -> np.ndarray:
            harm = np.tanh(band * (1.5 + amount * 1.8)) * 0.85
            return band * 0.5 + harm * 0.5

        wet = process_nonlinear_os(air, sr, factor, _excite)
        out[ch] = x + wet * amount * 0.22

    peak = float(np.max(np.abs(out)) + 1e-12)
    if peak > 0.98:
        out /= peak
    return out.astype(np.float64, copy=False)
