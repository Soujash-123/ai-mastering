"""Transient reconstruction after dynamics/limiting."""

from __future__ import annotations

import numpy as np

from mastering.dsp_params import SafeDSPParams


def transient_reconstruct(
    dry: np.ndarray,
    processed: np.ndarray,
    sr: int,
    amount: float,
) -> np.ndarray:
    """Restore attack energy from dry vs limited difference."""
    if amount < 0.05:
        return processed

    out = processed.copy()
    win = max(1, int(0.003 * sr))

    for ch in range(processed.shape[0]):
        d = dry[ch]
        p = processed[ch]
        diff = d - p
        # Emphasize fast component
        fast = diff - np.convolve(diff, np.ones(win) / win, mode="same")
        out[ch] = p + fast * amount * 0.38

    peak = float(np.max(np.abs(out)) + 1e-12)
    if peak > 0.98:
        out /= peak
    return out.astype(np.float64, copy=False)
