from __future__ import annotations

from typing import Any

import librosa
import numpy as np
import pyloudnorm as pyln


def _safe_db(x: float) -> float:
    return float(20.0 * np.log10(max(x, 1e-12)))


def _energy_band_ratio(mag: np.ndarray, freqs: np.ndarray, lo: float, hi: float) -> float:
    band = mag[(freqs >= lo) & (freqs <= hi), :]
    if band.size == 0:
        return 0.0
    return float(np.mean(band) / (np.mean(mag) + 1e-12))


def _stereo_width_and_phase(stereo: np.ndarray) -> tuple[float, float]:
    l, r = stereo[0], stereo[1]
    mid = (l + r) * 0.5
    side = (l - r) * 0.5
    mid_rms = float(np.sqrt(np.mean(mid**2)) + 1e-12)
    side_rms = float(np.sqrt(np.mean(side**2)) + 1e-12)
    width = float(np.clip(side_rms / mid_rms, 0.0, 2.0))
    phase_corr = float(np.corrcoef(l, r)[0, 1]) if l.size > 1 else 1.0
    if not np.isfinite(phase_corr):
        phase_corr = 0.0
    return width, float(np.clip(phase_corr, -1.0, 1.0))


def extract_frame_features(stereo: np.ndarray, sr: int, hop_length: int = 512) -> dict[str, Any]:
    mono = np.mean(stereo, axis=0)
    rms = librosa.feature.rms(y=mono, hop_length=hop_length)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)
    stft = librosa.stft(mono, n_fft=2048, hop_length=hop_length)
    mag = np.abs(stft) + 1e-10
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)

    centroid = librosa.feature.spectral_centroid(S=mag, sr=sr)[0]
    rolloff = librosa.feature.spectral_rolloff(S=mag, sr=sr)[0]
    contrast = librosa.feature.spectral_contrast(S=mag, sr=sr)
    contrast_mean = np.mean(contrast, axis=0)
    zcr = librosa.feature.zero_crossing_rate(mono, hop_length=hop_length)[0]
    onset = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=hop_length)

    low_end = np.array([_energy_band_ratio(mag[:, i : i + 1], freqs, 20.0, 120.0) for i in range(mag.shape[1])])
    sub = np.array([_energy_band_ratio(mag[:, i : i + 1], freqs, 20.0, 60.0) for i in range(mag.shape[1])])
    vocal = np.array([_energy_band_ratio(mag[:, i : i + 1], freqs, 1000.0, 4000.0) for i in range(mag.shape[1])])
    harsh = np.array([_energy_band_ratio(mag[:, i : i + 1], freqs, 2500.0, 5500.0) for i in range(mag.shape[1])])
    warm = np.array([_energy_band_ratio(mag[:, i : i + 1], freqs, 150.0, 450.0) for i in range(mag.shape[1])])
    bright = np.array([_energy_band_ratio(mag[:, i : i + 1], freqs, 6000.0, 12000.0) for i in range(mag.shape[1])])
    sib = np.array([_energy_band_ratio(mag[:, i : i + 1], freqs, 5000.0, 10000.0) for i in range(mag.shape[1])])

    flux = np.sqrt(np.sum(np.diff(mag, axis=1, prepend=mag[:, :1]) ** 2, axis=0))
    transient_density = np.convolve((onset > np.percentile(onset, 85)).astype(float), np.ones(8), mode="same") / 8.0
    punch = np.clip((flux / (np.mean(flux) + 1e-12)) * (rms / (np.mean(rms) + 1e-12)), 0.0, 4.0)

    return {
        "times_sec": times,
        "rms": rms,
        "spectral_centroid": centroid,
        "spectral_rolloff": rolloff,
        "spectral_contrast": contrast_mean,
        "onset_strength": onset,
        "zcr": zcr,
        "low_end_energy": low_end,
        "sub_energy": sub,
        "vocal_presence": vocal,
        "harshness_index": harsh,
        "warmth_index": warm,
        "brightness_index": bright,
        "sibilance_risk": sib,
        "transient_density": transient_density,
        "punch_score": punch,
    }


def compute_global_summary(stereo: np.ndarray, sr: int, frames: dict[str, Any]) -> dict[str, Any]:
    mono = np.mean(stereo, axis=0)
    peak = float(np.max(np.abs(stereo)))
    rms_lin = float(np.sqrt(np.mean(mono**2)))
    crest = _safe_db((peak + 1e-12) / (rms_lin + 1e-12))

    meter = pyln.Meter(sr)
    try:
        lufs = float(meter.integrated_loudness(stereo.T))
        if not np.isfinite(lufs):
            raise ValueError("non-finite LUFS")
    except Exception:
        lufs = _safe_db(rms_lin)

    dyn = float(np.percentile(frames["rms"], 95) / (np.percentile(frames["rms"], 5) + 1e-12))
    dynamic_range_db = _safe_db(dyn)
    width, phase_corr = _stereo_width_and_phase(stereo)
    mono_mix = np.mean(stereo, axis=0)
    mono_delta = float(np.sqrt(np.mean((mono_mix - mono) ** 2)))

    codec_vulnerability = float(
        np.clip(
            np.mean(frames["brightness_index"]) * 0.35
            + np.mean(frames["sibilance_risk"]) * 0.45
            + max(0.0, width - 1.0) * 0.5,
            0.0,
            3.0,
        )
    )
    emotional_intensity = float(np.clip(np.mean(frames["punch_score"]) * 0.4 + np.mean(frames["rms"]) * 8.0, 0.0, 10.0))
    immersion_depth = float(np.clip(width * 4.0 + (1.0 - abs(phase_corr)) * 2.0 + np.mean(frames["warmth_index"]), 0.0, 10.0))

    return {
        "duration_sec": float(len(mono) / sr),
        "sample_rate": int(sr),
        "channels": int(stereo.shape[0]),
        "lufs": lufs,
        "true_peak_dbfs": _safe_db(peak),
        "crest_factor_db": crest,
        "rms_linear": rms_lin,
        "stereo_width": width,
        "phase_correlation": phase_corr,
        "spectral_centroid_hz": float(np.mean(frames["spectral_centroid"])),
        "spectral_rolloff_hz": float(np.mean(frames["spectral_rolloff"])),
        "spectral_contrast": float(np.mean(frames["spectral_contrast"])),
        "transient_density": float(np.mean(frames["transient_density"])),
        "punch_score": float(np.mean(frames["punch_score"])),
        "low_end_energy": float(np.mean(frames["low_end_energy"])),
        "sub_energy": float(np.mean(frames["sub_energy"])),
        "vocal_presence": float(np.mean(frames["vocal_presence"])),
        "harshness_index": float(np.mean(frames["harshness_index"])),
        "warmth_index": float(np.mean(frames["warmth_index"])),
        "brightness_index": float(np.mean(frames["brightness_index"])),
        "sibilance_risk": float(np.mean(frames["sibilance_risk"])),
        "dynamic_range_db": dynamic_range_db,
        "mono_compatibility": float(np.clip(1.0 - mono_delta * 4.0, 0.0, 1.0)),
        "codec_vulnerability": codec_vulnerability,
        "emotional_intensity_estimation": emotional_intensity,
        "immersion_depth_estimation": immersion_depth,
    }

