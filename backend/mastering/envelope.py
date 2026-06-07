"""Envelope followers for dynamics and limiting."""

from __future__ import annotations

import numpy as np


def envelope_follower(
    x: np.ndarray,
    sr: int,
    attack_ms: float = 10.0,
    release_ms: float = 120.0,
) -> np.ndarray:
    attack = float(np.exp(-1.0 / (max(attack_ms, 0.1) * 1e-3 * sr)))
    release = float(np.exp(-1.0 / (max(release_ms, 1.0) * 1e-3 * sr)))
    env = np.zeros_like(x, dtype=np.float32)
    prev = 0.0
    ax = np.abs(x)
    for i, s in enumerate(ax):
        coeff = attack if s > prev else release
        prev = (1.0 - coeff) * s + coeff * prev
        env[i] = prev
    return env


def hybrid_level(x: np.ndarray, sr: int, attack_ms: float, release_ms: float) -> np.ndarray:
    """RMS + peak blend for musical detection."""
    rms = envelope_follower(x, sr, attack_ms * 1.4, release_ms)
    peak = envelope_follower(np.abs(x), sr, attack_ms * 0.5, release_ms * 0.7)
    return (0.62 * rms + 0.38 * peak).astype(np.float32)


def smooth_envelope(env: np.ndarray, sr: int, smooth_ms: float = 40.0) -> np.ndarray:
    win = max(1, int(smooth_ms * 1e-3 * sr))
    if win <= 1:
        return env
    kernel = np.ones(win, dtype=np.float32) / win
    return np.convolve(env, kernel, mode="same").astype(np.float32)
