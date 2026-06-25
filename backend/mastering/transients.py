"""Transient reconstruction after dynamics/limiting."""

from __future__ import annotations

import numpy as np


def transient_reconstruct(
    dry: np.ndarray,
    processed: np.ndarray,
    sr: int,
    amount: float,
) -> np.ndarray:
    """Restore attack energy from dry vs limited difference."""
    if amount < 0.05:
        return processed.astype(np.float32, copy=False)

    out = processed.astype(np.float32, copy=True)
    win = max(1, int(0.003 * sr))

    for ch in range(processed.shape[0]):
        d = dry[ch].astype(np.float32, copy=False)
        p = processed[ch].astype(np.float32, copy=False)
        diff = d - p
        fast = diff - np.convolve(diff, np.ones(win, dtype=np.float32) / win, mode="same")
        out[ch] = p + fast * amount * 0.38

    peak = float(np.max(np.abs(out)) + 1e-12)
    if peak > 0.98:
        out = (out * (0.98 / peak)).astype(np.float32)
    return out.astype(np.float32, copy=False)
