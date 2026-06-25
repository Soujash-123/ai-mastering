"""High-quality oversampling for nonlinear mastering stages (block-wise for low peak RAM)."""

from __future__ import annotations

import os

import numpy as np
from scipy import signal

_DEFAULT_BLOCK = int(os.getenv("MASTERING_OS_BLOCK", "16384"))
_DEFAULT_PAD = int(os.getenv("MASTERING_OS_PAD", "2048"))
# Signals shorter than this use full-buffer OS (no block seams). ~10 s @ 48 kHz.
_FULL_BUFFER_MAX = int(os.getenv("MASTERING_OS_FULL_MAX", "480000"))


def oversample(x: np.ndarray, factor: int) -> np.ndarray:
    if factor <= 1:
        return np.asarray(x, dtype=np.float64)
    return signal.resample_poly(x, factor, 1).astype(np.float64)


def downsample(x: np.ndarray, factor: int, orig_len: int) -> np.ndarray:
    if factor <= 1:
        return np.asarray(x[:orig_len], dtype=np.float64)
    y = signal.resample_poly(x, 1, factor).astype(np.float64)
    n = min(orig_len, len(y))
    return y[:n]


def _ola_weights(seg_len: int, overlap: int, is_first: bool, is_last: bool) -> np.ndarray:
    w = np.ones(seg_len, dtype=np.float64)
    if overlap <= 0:
        return w
    if not is_first:
        fi = min(overlap, seg_len)
        w[:fi] *= np.hanning(fi * 2)[:fi]
    if not is_last:
        fo = min(overlap, seg_len)
        w[-fo:] *= np.hanning(fo * 2)[fo:]
    return w


def process_nonlinear_os(
    x: np.ndarray,
    sr: int,
    factor: int,
    fn,
    block_size: int = _DEFAULT_BLOCK,
    pad: int = _DEFAULT_PAD,
) -> np.ndarray:
    """
    Apply nonlinear `fn` at `factor` oversampling.
    Uses float64 resampling; overlap-add crossfade between blocks to avoid seam hiss.
    """
    _ = sr
    x = np.asarray(x, dtype=np.float64)
    if factor <= 1:
        return fn(x).astype(np.float32)

    n = len(x)
    if n == 0:
        return np.asarray(x, dtype=np.float32)

    if n <= _FULL_BUFFER_MAX:
        up = oversample(x, factor)
        wet = fn(up)
        return downsample(wet, factor, n).astype(np.float32)

    block_size = max(4096, block_size)
    pad = max(512, pad)
    overlap = min(max(pad // 2, 256), block_size // 2)
    hop = max(block_size - overlap, 4096)

    out = np.zeros(n, dtype=np.float64)
    wsum = np.zeros(n, dtype=np.float64)

    start = 0
    block_idx = 0
    while start < n:
        end = min(start + block_size, n)
        p0 = max(0, start - pad)
        p1 = min(n, end + pad)
        chunk = x[p0:p1]
        proc = downsample(fn(oversample(chunk, factor)), factor, len(chunk))

        rs = start - p0
        re = rs + (end - start)
        seg = proc[rs:re]
        seg_len = end - start
        is_first = block_idx == 0
        is_last = end >= n
        w = _ola_weights(seg_len, overlap, is_first, is_last)

        out[start:end] += seg * w
        wsum[start:end] += w

        if is_last:
            break
        start += hop
        block_idx += 1

    return (out / np.maximum(wsum, 1e-12)).astype(np.float32)


def true_peak(stereo: np.ndarray, factor: int = 8) -> float:
    peak = 0.0
    for ch in range(stereo.shape[0]):
        x = np.asarray(stereo[ch], dtype=np.float64)
        n = len(x)
        if n <= _FULL_BUFFER_MAX:
            up = oversample(x, factor)
            peak = max(peak, float(np.max(np.abs(up))))
            continue

        block_size = max(4096, _DEFAULT_BLOCK)
        pad = max(512, _DEFAULT_PAD)
        for start in range(0, n, block_size):
            end = min(start + block_size, n)
            p0 = max(0, start - pad)
            p1 = min(n, end + pad)
            up = oversample(x[p0:p1], factor)
            peak = max(peak, float(np.max(np.abs(up))))
    return peak
