"""Delivery encoding for the final master: FLAC, sized to fit cloud storage.

The canonical master stays a 24-bit WAV on disk (the DSP chain, Mastering
Table and exports all read it). What we *store in Appwrite and hand to users*
is `master.flac`:

  1. 24-bit FLAC — bit-identical to the master, ~65% of the WAV size.
  2. If that exceeds `max_bytes` (Appwrite Free caps files at 50 MB, which
     24-bit FLAC overshoots for ~5-min masters), 16-bit FLAC with TPDF dither —
     the CD/streaming delivery standard, ~1/3 of the 24-bit WAV size.

The FLAC is cached next to the WAV and rebuilt whenever the WAV is newer.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

FLAC_NAME = "master.flac"
# Leave headroom under the provider limit for container/metadata variance.
SIZE_HEADROOM = 0.98


@dataclass
class EncodedMaster:
    path: Path
    bit_depth: int
    size_bytes: int


def _bit_depth(path: Path) -> int:
    subtype = sf.info(str(path)).subtype
    return 16 if subtype == "PCM_16" else 24


def _encode_24(src: Path, dst: Path) -> None:
    y, sr = sf.read(str(src), always_2d=True, dtype="int32")
    sf.write(str(dst), y, sr, format="FLAC", subtype="PCM_24")


def _encode_16_dithered(src: Path, dst: Path) -> None:
    y, sr = sf.read(str(src), always_2d=True, dtype="float32")
    rng = np.random.default_rng(0x4B4F5244)  # deterministic: same master → same file
    lsb = np.float32(1.0 / 32768.0)
    tpdf = (rng.random(y.shape, dtype=np.float32) - rng.random(y.shape, dtype=np.float32)) * lsb
    q = np.clip(np.round((y + tpdf) * 32767.0), -32768, 32767).astype(np.int16)
    del y, tpdf
    sf.write(str(dst), q, sr, format="FLAC", subtype="PCM_16")


def ensure_master_flac(master_wav: Path, max_bytes: int | None = None) -> EncodedMaster:
    """Return the delivery FLAC for `master_wav`, (re)encoding if stale.

    `max_bytes=None` means no size cap (always 24-bit).
    """
    master_wav = Path(master_wav)
    dst = master_wav.with_name(FLAC_NAME)
    limit = int(max_bytes * SIZE_HEADROOM) if max_bytes else None

    if dst.exists() and dst.stat().st_mtime_ns >= master_wav.stat().st_mtime_ns:
        size = dst.stat().st_size
        depth = _bit_depth(dst)
        # A cached 24-bit file that no longer fits the (possibly lowered) cap is stale.
        if limit is None or size <= limit:
            return EncodedMaster(dst, depth, size)

    tmp = dst.with_name(f".{dst.name}.tmp.flac")
    _encode_24(master_wav, tmp)
    depth = 24
    if limit is not None and tmp.stat().st_size > limit:
        logger.info(
            "24-bit FLAC is %.1f MB (> %.1f MB cap); delivering 16-bit dithered FLAC",
            tmp.stat().st_size / 1e6,
            limit / 1e6,
        )
        _encode_16_dithered(master_wav, tmp)
        depth = 16
        if tmp.stat().st_size > limit:
            logger.warning(
                "16-bit FLAC is still %.1f MB (> %.1f MB cap); the cloud upload will be rejected",
                tmp.stat().st_size / 1e6,
                limit / 1e6,
            )
    os.replace(tmp, dst)
    return EncodedMaster(dst, depth, dst.stat().st_size)
