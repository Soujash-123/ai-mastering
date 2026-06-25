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


def _write_audio(outp: Path, audio: np.ndarray, sr: int) -> tuple[str, Path]:
    audio = _peak_normalize(audio)
    fmt = outp.suffix.lower().lstrip(".")
    try:
        if fmt == "wav":
            sf.write(str(outp), audio, sr, subtype="PCM_24")
        else:
            sf.write(str(outp), audio, sr, format="FLAC")
        return fmt, outp
    except Exception:
        if fmt == "flac":
            fallback = outp.with_suffix(".wav")
            sf.write(str(fallback), audio, sr, subtype="PCM_24")
            return "wav", fallback
        raise


def _write_variants(y: np.ndarray, sr: int, stem: str, out_dir: Path) -> list[dict[str, str]]:
    out_dir.mkdir(parents=True, exist_ok=True)
    artifacts: list[dict[str, str]] = []
    jobs: list[tuple[str, Path, float | None, str]] = [
        ("Spotify Master", out_dir / f"{stem}_spotify.flac", -14.0, "lufs"),
        ("Apple Master", out_dir / f"{stem}_apple.wav", -16.0, "lufs"),
        ("Club Master", out_dir / f"{stem}_club.wav", None, "club"),
        ("Broadcast Master", out_dir / f"{stem}_broadcast.wav", -24.0, "lufs"),
    ]
    for label, outp, target, mode in jobs:
        audio = _club_squash(y) if mode == "club" else _lufs_adjust(y, sr, float(target))
        fmt, written = _write_audio(outp, audio, sr)
        artifacts.append({"profile": label, "format": fmt, "path": str(written)})

    master_copy = out_dir / f"{stem}_master.wav"
    _, written = _write_audio(master_copy, y, sr)
    artifacts.append({"profile": "Master (lossless copy)", "format": "wav", "path": str(written)})
    return artifacts


def _write_streaming_sims(y: np.ndarray, sr: int, sim_dir: Path) -> list[str]:
    sim_dir.mkdir(parents=True, exist_ok=True)
    notes: list[str] = []

    def save(name: str, audio: np.ndarray, desc: str) -> None:
        _, path = _write_audio(sim_dir / name, audio, sr)
        notes.append(f"{desc}: wrote {path.name}")

    save("spotify_sim.wav", _lufs_adjust(y, sr, -14.0), "Spotify-style loudness (approx., PCM)")
    save("youtube_sim.wav", _lufs_adjust(y, sr, -14.0), "YouTube-style loudness (approx., PCM)")
    save("apple_sim.wav", _lufs_adjust(y, sr, -16.0), "Apple Sound Check–style loudness (approx., PCM)")
    notes.append("AAC / Ogg codec passes: not generated (no FFmpeg). Use external encoders if needed.")
    save("mobile_eq.wav", _simple_tilt(y, sr, -1.5, 1.2), "Mobile speaker EQ proxy (approx.)")
    save("airpods_eq.wav", _simple_tilt(y, sr, 0.0, 1.0), "AirPods-style tilt proxy (approx.)")
    save("car_eq.wav", _simple_tilt(y, sr, 2.5, -0.5), "Car speaker EQ proxy (approx.)")
    mono = ((y[:, 0] + y[:, 1]) * 0.5).astype(np.float32)
    save("mono.wav", np.column_stack([mono, mono]), "Mono fold-down")
    return notes


def export_all_artifacts(
    master_wav: Path,
    exports_dir: Path,
    sim_dir: Path,
) -> tuple[list[dict[str, str]], list[str]]:
    """Single read of master.wav; write platform variants and streaming sims."""
    y, sr = _read_float(master_wav)
    y = _stereo_from_any(y)
    stem = master_wav.stem
    artifacts = _write_variants(y, sr, stem, exports_dir)
    notes = _write_streaming_sims(y, sr, sim_dir)
    return artifacts, notes


def export_variants(master_wav: Path, out_dir: Path) -> list[dict[str, str]]:
    y, sr = _read_float(master_wav)
    y = _stereo_from_any(y)
    return _write_variants(y, sr, master_wav.stem, out_dir)


def simulate_streaming_platforms(master_wav: Path, sim_dir: Path) -> list[str]:
    y, sr = _read_float(master_wav)
    y = _stereo_from_any(y)
    return _write_streaming_sims(y, sr, sim_dir)
