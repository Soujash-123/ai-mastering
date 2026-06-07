"""CLAP-style embedding hook. Uses TorchAudio + a small CNN stub when no CLAP weights are configured."""

from __future__ import annotations

import os
from typing import Any

import numpy as np
import torch
import torch.nn as nn


class _TinyEncoder(nn.Module):
    def __init__(self, dim: int = 512):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(1, 32, kernel_size=7, stride=2, padding=3),
            nn.GELU(),
            nn.Conv1d(32, 64, kernel_size=5, stride=2, padding=2),
            nn.GELU(),
            nn.AdaptiveAvgPool1d(32),
            nn.Flatten(),
            nn.Linear(64 * 32, dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def compute_clap_like_embedding(mono_float: np.ndarray, sr: int) -> dict[str, Any]:
    """
    Deterministic, lightweight embedding for conditioning downstream LLM context.
    Replace with real CLAP checkpoint loading when you have weights + deps pinned.
    """
    _ = sr
    device = torch.device("cpu")
    x = torch.from_numpy(mono_float.astype(np.float32)).unsqueeze(0).unsqueeze(0)
    # crop / pad to ~5s at sr for stability
    max_len = int(sr * 5)
    if x.shape[-1] > max_len:
        x = x[..., :max_len]
    elif x.shape[-1] < max_len:
        pad = max_len - x.shape[-1]
        x = torch.nn.functional.pad(x, (0, pad))

    dim = int(os.getenv("CLAP_EMBED_DIM", "512"))
    model = _TinyEncoder(dim=dim).to(device)
    model.eval()
    with torch.no_grad():
        emb = model(x.to(device)).cpu().numpy().ravel()

    return {
        "dim": int(emb.shape[0]),
        "vector_preview": [float(v) for v in emb[:16]],
        "l2_norm": float(np.linalg.norm(emb)),
    }
