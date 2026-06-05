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

    # Single FLAC master export
    outp = out_dir / f"{stem}_master.flac"
    audio = _peak_normalize(y.copy())
    try:
        sf.write(str(outp), audio, sr, format="FLAC")
        artifacts.append({"profile": "Master (FLAC)", "format": "flac", "path": str(outp)})
    except Exception:
        # FLAC requires libsndfile built with FLAC support; fall back to WAV if unavailable
        fallback = outp.with_suffix(".wav")
        sf.write(str(fallback), audio, sr, subtype="PCM_24")
        artifacts.append({"profile": "Master (WAV fallback)", "format": "wav", "path": str(fallback)})

    return artifacts


def simulate_streaming_platforms(master_wav: Path, sim_dir: Path) -> tuple[list[str], list[dict[str, str]]]:
    sim_dir.mkdir(parents=True, exist_ok=True)
    notes: list[str] = []
    previews: list[dict[str, str]] = []
    y, sr = _read_float(master_wav)
    y = _stereo_from_any(y)

    def save(name: str, audio: np.ndarray, label: str, description: str, category: str) -> None:
        outp = sim_dir / name
        audio = _peak_normalize(_stereo_from_any(audio))
        sf.write(str(outp), audio, sr, subtype="PCM_24")
        previews.append(
            {
                "label": label,
                "description": description,
                "filename": name,
                "category": category,
            }
        )

    save(
        "spotify_sim.wav",
        _lufs_adjust(y, sr, -14.0),
        "Spotify",
        "Approximate −14 LUFS normalization (PCM preview)",
        "streaming",
    )
    save(
        "youtube_sim.wav",
        _lufs_adjust(y, sr, -14.0),
        "YouTube",
        "Approximate −14 LUFS normalization (PCM preview)",
        "streaming",
    )
    save(
        "apple_sim.wav",
        _lufs_adjust(y, sr, -16.0),
        "Apple Music",
        "Approximate −16 LUFS Sound Check style (PCM preview)",
        "streaming",
    )
    notes.append("AAC / Ogg codec passes are not generated (no FFmpeg). Previews are PCM-only.")

    save(
        "mobile_eq.wav",
        _simple_tilt(y, sr, -1.5, 1.2),
        "Mobile Speakers",
        "Small-speaker EQ proxy with slight treble lift",
        "device",
    )
    save(
        "airpods_eq.wav",
        _simple_tilt(y, sr, 0.0, 1.0),
        "Earbuds",
        "Consumer earbud tilt proxy",
        "device",
    )
    save(
        "car_eq.wav",
        _simple_tilt(y, sr, 2.5, -0.5),
        "Car Stereo",
        "Car playback EQ proxy with bass emphasis",
        "device",
    )

    mono = ((y[:, 0] + y[:, 1]) * 0.5).astype(np.float32)
    mono2 = np.column_stack([mono, mono])
    save("mono.wav", mono2, "Mono", "Mono fold-down compatibility check", "device")

    return notes, previews
