"""Lightweight spectral fingerprint stub (NumPy only — no Torch)."""

from __future__ import annotations

import os
from typing import Any

import numpy as np


def compute_clap_like_embedding(mono_float: np.ndarray, sr: int) -> dict[str, Any]:
    """
    Deterministic spectral fingerprint for optional API metadata.
    Not used by the mastering LLM (see CompactContextBuilder).
    """
    _ = sr
    dim = int(os.getenv("CLAP_EMBED_DIM", "512"))
    chunk = np.asarray(mono_float, dtype=np.float32).ravel()
    max_len = min(chunk.size, int(sr * 5)) if sr > 0 else chunk.size
    if max_len <= 0:
        emb = np.zeros(dim, dtype=np.float64)
    else:
        chunk = chunk[:max_len]
        n_fft = max(1024, 1 << int(np.ceil(np.log2(max(64, chunk.size // 4)))))
        spec = np.abs(np.fft.rfft(chunk, n=n_fft))
        if spec.size < dim:
            spec = np.pad(spec, (0, dim - spec.size))
        emb = spec[:dim].astype(np.float64)
        norm = float(np.linalg.norm(emb))
        if norm > 1e-12:
            emb /= norm

    return {
        "dim": dim,
        "vector_preview": [float(v) for v in emb[:16]],
        "l2_norm": float(np.linalg.norm(emb)),
    }
