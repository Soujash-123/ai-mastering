"""Delivery FLAC: lossless when it fits the storage cap, 16-bit dithered otherwise."""
from __future__ import annotations

import os
import time

import numpy as np
import soundfile as sf

from utils.audio_encode import ensure_master_flac


def _master(path, seconds=2.0, sr=44100):
    rng = np.random.default_rng(1)
    t = np.arange(int(seconds * sr)) / sr
    y = 0.3 * np.sin(2 * np.pi * 220 * t) + 0.05 * rng.standard_normal(t.size)
    sf.write(str(path), np.stack([y, 0.9 * y], axis=1).astype("float32"), sr, subtype="PCM_24")
    return path


def test_24bit_flac_is_bit_identical_when_it_fits(tmp_path):
    wav = _master(tmp_path / "master.wav")
    enc = ensure_master_flac(wav, max_bytes=50_000_000)
    assert enc.bit_depth == 24 and enc.path.name == "master.flac"
    assert sf.info(str(enc.path)).subtype == "PCM_24"
    a, _ = sf.read(str(wav), dtype="int32")
    b, _ = sf.read(str(enc.path), dtype="int32")
    assert np.array_equal(a, b)
    assert enc.size_bytes < wav.stat().st_size


def test_falls_back_to_16bit_when_24bit_exceeds_cap(tmp_path):
    wav = _master(tmp_path / "master.wav")
    size24 = ensure_master_flac(wav, max_bytes=None).size_bytes
    os.remove(tmp_path / "master.flac")
    enc = ensure_master_flac(wav, max_bytes=int(size24 * 0.8))
    assert enc.bit_depth == 16
    assert sf.info(str(enc.path)).subtype == "PCM_16"
    assert enc.size_bytes <= size24 * 0.8
    # Dithered 16-bit stays within ~1 LSB of the 24-bit master.
    a, _ = sf.read(str(wav), dtype="float64")
    b, _ = sf.read(str(enc.path), dtype="float64")
    assert np.max(np.abs(a - b)) < 2.5 / 32768


def test_cached_until_master_changes(tmp_path):
    wav = _master(tmp_path / "master.wav")
    first = ensure_master_flac(wav, 50_000_000)
    mtime = first.path.stat().st_mtime_ns
    assert ensure_master_flac(wav, 50_000_000).path.stat().st_mtime_ns == mtime  # reused

    time.sleep(0.01)
    _master(wav, seconds=1.0)  # e.g. Mastering Table commit rewrote the master
    again = ensure_master_flac(wav, 50_000_000)
    assert sf.info(str(again.path)).duration == sf.info(str(wav)).duration
