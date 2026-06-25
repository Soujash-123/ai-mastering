"""Frequency-dependent stereo imaging: mono subs, narrow bass, wide air."""

from __future__ import annotations

import numpy as np
from scipy import signal

from mastering.dsp_params import MasteringDSPPlan


def _band_ms_width(
    l: np.ndarray,
    r: np.ndarray,
    side_scale: float,
    center_boost: float,
) -> tuple[np.ndarray, np.ndarray]:
    mid = (l + r) * 0.5
    side = (l - r) * 0.5
    mid *= 1.0 + center_boost * 0.1
    side *= side_scale
    return mid + side, mid - side


def immersive_stereo(stereo: np.ndarray, sr: int, plan: MasteringDSPPlan) -> np.ndarray:
    p = plan.params
    l = stereo[0].astype(np.float32, copy=False)
    r = stereo[1].astype(np.float32, copy=False)
    nyq = sr / 2.0

    sos_sub = signal.butter(4, min(55.0, nyq * 0.8) / nyq, btype="low", output="sos")
    sos_bass = signal.butter(
        3,
        [min(55.0, nyq * 0.8) / nyq, min(220.0, nyq * 0.95) / nyq],
        btype="band",
        output="sos",
    )
    sos_mid_hi = signal.butter(2, min(220.0, nyq * 0.95) / nyq, btype="high", output="sos")
    sos_air = signal.butter(4, min(5000.0, nyq * 0.98) / nyq, btype="high", output="sos")

    sub_l = signal.sosfilt(sos_sub, l)
    sub_r = signal.sosfilt(sos_sub, r)
    sub_mono = (sub_l + sub_r) * 0.5
    strength = float(p.sub_mono_strength)
    sub_l = sub_mono * strength + sub_l * (1.0 - strength)
    sub_r = sub_mono * strength + sub_r * (1.0 - strength)

    bass_l = signal.sosfilt(sos_bass, l)
    bass_r = signal.sosfilt(sos_bass, r)
    body_l = signal.sosfilt(sos_mid_hi, l) - bass_l - sub_l
    body_r = signal.sosfilt(sos_mid_hi, r) - bass_r - sub_r
    air_l = signal.sosfilt(sos_air, l)
    air_r = signal.sosfilt(sos_air, r)

    width_bass = float(np.clip(0.98 + (p.width_body - 1.0) * 0.15, 0.94, 1.02))
    width_body = float(p.width_body)
    width_air = float(p.width_air)
    wm = float(np.clip(plan.width_mod, 0.8, 1.2))
    width_body *= wm
    width_air *= wm

    bass_l, bass_r = _band_ms_width(bass_l, bass_r, width_bass, p.center_anchor)
    body_l, body_r = _band_ms_width(body_l, body_r, width_body, p.center_anchor)
    air_l, air_r = _band_ms_width(air_l, air_r, width_air, p.center_anchor * 0.65)

    out_l = sub_l + bass_l + body_l + air_l
    out_r = sub_r + bass_r + body_r + air_r
    out = np.stack([out_l, out_r], axis=0)

    peak = float(np.max(np.abs(out)) + 1e-12)
    if peak > 1.0:
        out /= peak
    return out.astype(np.float32, copy=False)
