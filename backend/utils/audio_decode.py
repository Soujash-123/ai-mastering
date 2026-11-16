"""Decode uploaded audio to float32 stereo PCM.

Lossless (WAV/FLAC/AIFF) and MP3/OGG/Opus go through libsndfile (soundfile).
Phone formats libsndfile can't read (.m4a / .aac / .mp4 audio) fall back to
PyAV, whose wheels bundle the FFmpeg decoders — no system ffmpeg needed.
Decode only: the pipeline never encodes to a lossy format.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

LOSSLESS_SUFFIXES = frozenset({".wav", ".flac", ".aiff", ".aif"})
LOSSY_SUFFIXES = frozenset({".mp3", ".m4a", ".aac", ".ogg", ".opus"})
ALLOWED_UPLOAD_SUFFIXES = LOSSLESS_SUFFIXES | LOSSY_SUFFIXES


@dataclass
class DecodedAudio:
    samples: np.ndarray  # (n, channels) float32
    sample_rate: int
    source_format: str  # suffix without dot, e.g. "m4a"
    lossy: bool


def _decode_with_pyav(path: Path) -> tuple[np.ndarray, int]:
    try:
        import av  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on deployment
        raise ValueError("This audio format needs the PyAV decoder, which is not installed.") from exc

    chunks: list[np.ndarray] = []
    with av.open(str(path)) as container:
        if not container.streams.audio:
            raise ValueError("File contains no audio stream")
        stream = container.streams.audio[0]
        sr = int(stream.codec_context.sample_rate or stream.rate or 0)
        if sr <= 0:
            raise ValueError("Could not determine sample rate")
        # Packed float32 stereo at the native sample rate (no resampling).
        resampler = av.AudioResampler(format="flt", layout="stereo", rate=sr)
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1, 2))
        for out in resampler.resample(None):  # flush
            chunks.append(out.to_ndarray().reshape(-1, 2))
    if not chunks:
        raise ValueError("No audio frames decoded")
    return np.concatenate(chunks, axis=0).astype(np.float32, copy=False), sr


def decode_audio_file(path: Path, suffix: str) -> DecodedAudio:
    suffix = suffix.lower()
    try:
        y, sr = sf.read(str(path), always_2d=True, dtype="float32")
    except Exception as sf_exc:
        try:
            y, sr = _decode_with_pyav(path)
        except Exception as av_exc:
            raise ValueError(
                f"Could not read audio ({suffix or 'unknown format'}): {av_exc or sf_exc}"
            ) from av_exc
    if y.ndim != 2 or y.shape[0] == 0 or y.shape[1] < 1:
        raise ValueError("Invalid or empty audio")
    return DecodedAudio(
        samples=y,
        sample_rate=int(sr),
        source_format=suffix.lstrip("."),
        lossy=suffix in LOSSY_SUFFIXES,
    )
