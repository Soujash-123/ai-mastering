"""Low-end stabilization before loudness stages."""

from __future__ import annotations

import numpy as np
from scipy import signal

from mastering.dsp_params import MasteringDSPPlan
from mastering.envelope import envelope_follower, smooth_envelope


def stabilize_low_end(stereo: np.ndarray, sr: int, plan: MasteringDSPPlan) -> np.ndarray:
    """Sub control, bass glue compression, mono subs, crest management."""
    p = plan.params
    nyq = sr / 2.0
    out = np.zeros_like(stereo, dtype=np.float64)

    sos_sub = signal.butter(4, min(55.0, nyq * 0.8) / nyq, btype="low", output="sos")
    sos_bass = signal.butter(
        3,
        [min(55.0, nyq * 0.8) / nyq, min(160.0, nyq * 0.95) / nyq],
        btype="band",
        output="sos",
    )

    sub_l = signal.sosfilt(sos_sub, stereo[0].astype(np.float64))
    sub_r = signal.sosfilt(sos_sub, stereo[1].astype(np.float64))
    sub_mono = (sub_l + sub_r) * 0.5

    for ch in range(stereo.shape[0]):
        x = stereo[ch].astype(np.float64)
        sub = signal.sosfilt(sos_sub, x)
        bass = signal.sosfilt(sos_bass, x)
        rest = x - sub - bass

        sub_blend = sub_mono * p.sub_mono_strength + sub * (1.0 - p.sub_mono_strength)

        env = envelope_follower(np.abs(bass), sr, 15.0, 120.0)
        env = smooth_envelope(env, sr, 40.0) + 1e-9
        thresh = float(np.percentile(env, 58))
        over = np.clip(env / (thresh + 1e-12) - 1.0, 0.0, 2.0)
        max_gr = 0.12 + p.saturation_amount * 0.08
        gr = 1.0 - max_gr * np.clip(over, 0.0, 1.0)
        bass_c = bass * gr

        b_peak = float(np.max(np.abs(bass_c)) + 1e-12)
        if b_peak > 0.55:
            bass_c *= 0.55 / b_peak

        out[ch] = sub_blend + bass_c + rest

    return out.astype(np.float64, copy=False)
