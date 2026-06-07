"""Musical multiband compression: hybrid detection, crest-aware, adaptive threshold."""

from __future__ import annotations

import numpy as np
from scipy import signal

from mastering.dsp_params import MasteringDSPPlan
from mastering.envelope import hybrid_level, smooth_envelope


def _split_bands(x: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    nyq = sr / 2.0
    sos_lp = signal.butter(4, min(120.0, nyq * 0.95) / nyq, btype="low", output="sos")
    sos_hp = signal.butter(4, min(5500.0, nyq * 0.98) / nyq, btype="high", output="sos")
    low = signal.sosfilt(sos_lp, x.astype(np.float64))
    high = signal.sosfilt(sos_hp, x.astype(np.float64))
    mid = x.astype(np.float64) - low - high
    return low, mid, high


def _compress_band(
    band: np.ndarray,
    sr: int,
    ratio: float,
    attack_ms: float,
    release_ms: float,
    section_gain: np.ndarray | None,
    max_gr_cap: float,
) -> np.ndarray:
    level = hybrid_level(band.astype(np.float32), sr, attack_ms, release_ms).astype(np.float64)
    level = smooth_envelope(level, sr, 30.0)
    # Stable adaptive threshold (median + small offset)
    thresh = float(np.median(level) * 1.08 + 1e-8)
    over = np.clip(level / thresh - 1.0, 0.0, 2.5)
    over = np.where(over < 0.6, over * over * 1.4, over * 0.75 + 0.15)

    crest = float(np.max(np.abs(band)) / (np.sqrt(np.mean(band**2)) + 1e-12))
    punch_keep = float(np.clip(0.7 + crest * 0.05, 0.74, 0.96))

    max_gr = min(max_gr_cap, 1.0 - 1.0 / max(ratio, 1.01))
    gr = 1.0 - max_gr * np.clip(over, 0.0, 1.0) * punch_keep

    if section_gain is not None and section_gain.shape == gr.shape:
        mod = np.clip(section_gain, 0.8, 1.15)
        gr = np.clip(gr ** (1.0 / mod), 0.5, 1.0)

    return (band * gr).astype(np.float64)


def multiband_compress(stereo: np.ndarray, sr: int, plan: MasteringDSPPlan) -> np.ndarray:
    p = plan.params
    out = np.zeros_like(stereo, dtype=np.float64)
    comp_curve = plan.compression_curve

    for ch in range(stereo.shape[0]):
        x = stereo[ch].astype(np.float64)
        low, mid, high = _split_bands(x, sr)
        low_c = _compress_band(
            low, sr, p.low_ratio, p.mb_attack_ms, p.mb_release_ms * 1.25, comp_curve, max_gr_cap=0.14
        )
        mid_c = _compress_band(
            mid, sr, p.mid_ratio, p.mb_attack_ms, p.mb_release_ms, comp_curve, max_gr_cap=0.18
        )
        high_c = _compress_band(
            high,
            sr,
            p.high_ratio,
            p.mb_attack_ms * 0.85,
            p.mb_release_high_ms,
            comp_curve,
            max_gr_cap=0.12,
        )
        out[ch] = low_c + mid_c + high_c

    return out.astype(np.float64, copy=False)
