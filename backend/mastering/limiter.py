"""Oversampled soft clip + multi-stage mastering limiter with ISP protection."""

from __future__ import annotations

import numpy as np

from mastering.dsp_params import SafeDSPParams
from mastering.envelope import envelope_follower, smooth_envelope
from mastering.oversample import process_nonlinear_os, true_peak


def _soft_knee_gain(env: np.ndarray, ceiling: float, knee_db: float, ratio: float) -> np.ndarray:
    env = np.maximum(env.astype(np.float64), 1e-12)
    over_db = 20.0 * np.log10(env / ceiling)
    knee = max(knee_db, 0.5)
    gr_db = np.where(
        over_db <= 0.0,
        0.0,
        np.where(
            over_db < knee,
            (over_db**2) / (2.0 * knee * max(ratio, 1.01)),
            (over_db - knee / 2.0) / max(ratio, 1.01),
        ),
    )
    return np.power(10.0, -gr_db / 20.0)


def soft_clip_oversampled(stereo: np.ndarray, sr: int, params: SafeDSPParams) -> np.ndarray:
    """8x oversampled gentle soft clip; crest-aware drive cap."""
    factor = max(4, int(getattr(params, "oversample_factor", 8)))
    drive = 1.0 + params.clip_drive * 2.2
    out = np.zeros_like(stereo, dtype=np.float32)

    for ch in range(stereo.shape[0]):
        x = stereo[ch].astype(np.float64, copy=False)
        crest = float(np.max(np.abs(x)) / (np.sqrt(np.mean(x**2)) + 1e-12))
        knee = float(np.clip(0.9 - params.clip_drive * 0.08 + crest * 0.008, 0.82, 0.93))

        def _shape(up: np.ndarray) -> np.ndarray:
            shaped = np.tanh(up * drive) / np.tanh(drive)
            mask = np.abs(up) > knee
            excess = np.maximum(np.abs(up) - knee, 0.0)
            soft = knee + np.tanh(excess * 3.0) * 0.035
            return np.where(mask, soft * np.sign(up), shaped)

        out[ch] = process_nonlinear_os(x, sr, factor, _shape)

    return out.astype(np.float32, copy=False)


def mastering_limiter(
    stereo: np.ndarray,
    sr: int,
    params: SafeDSPParams,
    *,
    out: np.ndarray | None = None,
) -> np.ndarray:
    """
    Linked stereo lookahead limiter: soft knee, adaptive release, crest-aware GR,
    multi-stage reduction, ISP guard via oversampled true-peak trim.
    """
    ceiling = float(10 ** (params.true_peak_ceiling_db / 20.0))
    lookahead = max(1, int(0.008 * sr))
    attack_ms = 0.25
    release_ms = 60.0 + (1.0 - params.limiter_drive) * 180.0
    knee_db = 2.5 + params.limiter_drive * 2.0
    ratio = 3.0 + params.limiter_drive * 4.0

    if out is None:
        target = np.asarray(stereo, dtype=np.float32).copy()
    else:
        target = out
        np.copyto(target, stereo)

    l = target[0].astype(np.float64)
    r = target[1].astype(np.float64)
    pad = np.zeros(lookahead, dtype=np.float64)
    det_l = np.concatenate([pad, np.abs(l[:-lookahead])])
    det_r = np.concatenate([pad, np.abs(r[:-lookahead])])
    det = np.maximum(det_l, det_r)

    env = envelope_follower(det, sr, attack_ms, release_ms).astype(np.float64)
    env = smooth_envelope(env, sr, 12.0).astype(np.float64) + 1e-12

    crest = float(np.max(det) / (np.sqrt(np.mean(det**2)) + 1e-12))
    punch = float(np.clip(0.55 + crest * 0.06, 0.55, 0.92))

    stage1_ceil = min(0.98, ceiling * 1.02)
    g1 = _soft_knee_gain(env, stage1_ceil, knee_db + 1.5, ratio * 1.4)
    g1 = 1.0 - (1.0 - g1) * punch
    g2 = _soft_knee_gain(env * g1, ceiling, knee_db, ratio)
    gain = np.clip(g1 * g2, 0.12, 1.0)

    target[0] = (l * gain).astype(np.float32)
    target[1] = (r * gain).astype(np.float32)

    tp = true_peak(target, factor=8)
    if tp > ceiling:
        target *= ceiling / tp
    return target.astype(np.float32, copy=False)


lookahead_limiter = mastering_limiter
