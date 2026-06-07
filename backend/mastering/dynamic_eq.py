"""Improved dynamic EQ: localized resonance + vocal-aware low-mid."""

from __future__ import annotations

import librosa
import numpy as np
from scipy import signal

from mastering.dsp_params import SafeDSPParams
from mastering.rbj import peaking_sos


def intelligent_dynamic_eq(stereo: np.ndarray, sr: int, params: SafeDSPParams) -> np.ndarray:
    strength = float(params.dynamic_eq_strength)
    if strength < 0.04:
        return stereo

    out = stereo.copy()
    hop = max(256, int(0.01 * sr))

    for ch in range(stereo.shape[0]):
        x = stereo[ch]
        stft = librosa.stft(x, n_fft=2048, hop_length=hop)
        mag = np.abs(stft)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)

        vocal_idx = (freqs >= 1000) & (freqs <= 4000)
        low_mid_idx = (freqs >= 150) & (freqs <= 500)
        broad = np.mean(mag, axis=0) + 1e-8
        vocal = np.mean(mag[vocal_idx, :], axis=0) + 1e-8
        low_mid = np.mean(mag[low_mid_idx, :], axis=0) + 1e-8

        mud_ratio = np.clip(low_mid / broad - 1.0, 0.0, 2.5)
        vocal_mask = np.clip(vocal / broad - 0.85, 0.0, 1.5)

        cut_db = -2.2 * strength * float(np.mean(mud_ratio))
        boost_db = 0.8 * strength * float(np.mean(vocal_mask)) * 0.5

        y = x
        if cut_db < -0.2:
            y = signal.sosfilt(peaking_sos(240.0, cut_db, float(sr), q=0.9), y)
        if boost_db > 0.15:
            y = signal.sosfilt(peaking_sos(2800.0, boost_db, float(sr), q=1.1), y)
        out[ch] = y.astype(np.float32)

    return out
