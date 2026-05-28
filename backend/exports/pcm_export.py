"""WAV/FLAC exports and lightweight playback simulations — no FFmpeg."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal


def _read_float(path: Path) -> tuple[np.ndarray, int]:
    y, sr = sf.read(str(path), always_2d=True, dtype="float32")
    return y, int(sr)


def _stereo_from_any(y: np.ndarray) -> np.ndarray:
    if y.ndim == 1:
        y = np.column_stack([y, y])
    if y.shape[1] == 1:
        y = np.column_stack([y[:, 0], y[:, 0]])
    if y.shape[1] > 2:
        y = y[:, :2]
    return np.clip(y, -1.0, 1.0).astype(np.float32)


def _peak_normalize(y: np.ndarray, ceiling: float = 0.989) -> np.ndarray:
    peak = float(np.max(np.abs(y)) + 1e-12)
    if peak > ceiling:
        y = (y * (ceiling / peak)).astype(np.float32)
    return y


def _lufs_adjust(y: np.ndarray, sr: int, target_lufs: float, max_step_db: float = 8.0) -> np.ndarray:
    """y: (frames, channels)."""
    meter = pyln.Meter(sr)
    try:
        cur = float(meter.integrated_loudness(y))
        if not np.isfinite(cur):
            return y
        db = float(np.clip(target_lufs - cur, -max_step_db, max_step_db))
        return _peak_normalize((y * (10 ** (db / 20.0))).astype(np.float32))
    except Exception:
        return y


def _club_squash(y: np.ndarray) -> np.ndarray:
    x = y * 1.08
    wet = np.tanh(x)
    out = (0.65 * y + 0.35 * wet).astype(np.float32)
    return _peak_normalize(out)


def _simple_tilt(y: np.ndarray, sr: int, bass_db: float, treble_db: float) -> np.ndarray:
    """Rough tilt: low-pass split + gain on lows vs rest (per channel)."""
    nyq = sr * 0.5
    lo_hz = min(220.0, nyq * 0.08)
    wn = max(0.002, min(lo_hz / nyq, 0.45))
    out = np.zeros_like(y)
    for c in range(y.shape[1]):
        x = y[:, c]
        sos_lo = signal.butter(1, wn, btype="low", output="sos")
        low = signal.sosfilt(sos_lo, x)
        rest = x - low
        g_lo = 10 ** (bass_db / 20.0)
        g_hi = 10 ** (treble_db / 20.0)
        out[:, c] = (low * g_lo + rest * g_hi).astype(np.float32)
    return _peak_normalize(out)


def export_variants(master_wav: Path, out_dir: Path) -> list[dict[str, str]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    artifacts: list[dict[str, str]] = []
    stem = master_wav.stem
    y, sr = _read_float(master_wav)
    y = _stereo_from_any(y)

    jobs: list[tuple[str, Path, np.ndarray]] = [
        ("Spotify Master", out_dir / f"{stem}_spotify.flac", _lufs_adjust(y, sr, -14.0)),
        ("Apple Master", out_dir / f"{stem}_apple.wav", _lufs_adjust(y, sr, -16.0)),
        ("Club Master", out_dir / f"{stem}_club.wav", _club_squash(y)),
        ("Broadcast Master", out_dir / f"{stem}_broadcast.wav", _lufs_adjust(y, sr, -24.0)),
    ]
    for label, outp, audio in jobs:
        audio = _peak_normalize(audio)
        fmt = outp.suffix.lower().lstrip(".")
        try:
            if fmt == "wav":
                sf.write(str(outp), audio, sr, subtype="PCM_24")
            else:
                sf.write(str(outp), audio, sr, format="FLAC")
            artifacts.append({"profile": label, "format": fmt, "path": str(outp)})
        except Exception:
            # FLAC requires libsndfile built with FLAC support
            if fmt == "flac":
                fallback = outp.with_suffix(".wav")
                sf.write(str(fallback), audio, sr, subtype="PCM_24")
                artifacts.append({"profile": label, "format": "wav", "path": str(fallback)})

    master_copy = out_dir / f"{stem}_master.wav"
    sf.write(str(master_copy), _peak_normalize(y.copy()), sr, subtype="PCM_24")
    artifacts.append({"profile": "Master (lossless copy)", "format": "wav", "path": str(master_copy)})

    return artifacts


def simulate_streaming_platforms(master_wav: Path, sim_dir: Path) -> list[str]:
    sim_dir.mkdir(parents=True, exist_ok=True)
    notes: list[str] = []
    y, sr = _read_float(master_wav)
    y = _stereo_from_any(y)

    def save(name: str, audio: np.ndarray, desc: str) -> None:
        outp = sim_dir / name
        audio = _peak_normalize(_stereo_from_any(audio))
        sf.write(str(outp), audio, sr, subtype="PCM_24")
        notes.append(f"{desc}: wrote {outp.name}")

    save("spotify_sim.wav", _lufs_adjust(y, sr, -14.0), "Spotify-style loudness (approx., PCM)")
    save("youtube_sim.wav", _lufs_adjust(y, sr, -14.0), "YouTube-style loudness (approx., PCM)")
    save("apple_sim.wav", _lufs_adjust(y, sr, -16.0), "Apple Sound Check–style loudness (approx., PCM)")
    notes.append("AAC / Ogg codec passes: not generated (no FFmpeg). Use external encoders if needed.")

    save("mobile_eq.wav", _simple_tilt(y, sr, -1.5, 1.2), "Mobile speaker EQ proxy (approx.)")
    save("airpods_eq.wav", _simple_tilt(y, sr, 0.0, 1.0), "AirPods-style tilt proxy (approx.)")
    save("car_eq.wav", _simple_tilt(y, sr, 2.5, -0.5), "Car speaker EQ proxy (approx.)")

    mono = ((y[:, 0] + y[:, 1]) * 0.5).astype(np.float32)
    mono2 = np.column_stack([mono, mono])
    save("mono.wav", mono2, "Mono fold-down")

    return notes
