"""Dynamic resonance suppression (upper-mid harshness, mud, sibilance)."""

from __future__ import annotations

import librosa
import numpy as np

from mastering.rbj import peaking_sos
from scipy import signal


def dynamic_resonance_suppress(stereo: np.ndarray, sr: int, strength: float) -> np.ndarray:
    if strength < 0.03:
        return stereo

    out = stereo.copy()
    hop = max(256, int(0.008 * sr))

    for ch in range(stereo.shape[0]):
        x = stereo[ch]
        stft = librosa.stft(x, n_fft=2048, hop_length=hop)
        mag = np.abs(stft)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)

        def band_ratio(lo: float, hi: float) -> float:
            idx = (freqs >= lo) & (freqs <= hi)
            if not np.any(idx):
                return 0.0
            b = float(np.mean(mag[idx, :]))
            return b / (float(np.mean(mag)) + 1e-12)

        mud = band_ratio(180, 450)
        harsh = band_ratio(2400, 5200)
        sib = band_ratio(5500, 9500)

        cuts: list[tuple[float, float]] = []
        if mud > 1.15:
            cuts.append((260.0, -1.8 * strength * min(mud - 1.0, 1.5)))
        if harsh > 1.12:
            cuts.append((3200.0, -1.5 * strength * min(harsh - 1.0, 1.2)))
        if sib > 1.18:
            cuts.append((7200.0, -1.2 * strength * min(sib - 1.0, 1.0)))

        y = x
        for fc, db in cuts:
            sos = peaking_sos(fc, db, float(sr), q=2.5 if fc > 2000 else 0.85)
            y = signal.sosfilt(sos, y)
        out[ch] = y.astype(np.float32)

    return out
