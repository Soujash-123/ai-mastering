"""DSP execution plan: bounded parameters + optional section automation curves."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class SafeDSPParams:
    """Mapped from LLM intent (0–10 perceptual → internal 0–1 where noted)."""

    low_shelf_db: float
    mid_peak_db: float
    high_shelf_db: float
    dynamic_eq_strength: float

    low_ratio: float
    mid_ratio: float
    high_ratio: float

    saturation_amount: float
    stereo_width_factor: float
    transient_blend: float

    target_lufs: float
    true_peak_ceiling_db: float

    # Extended psychoacoustic / premium chain (derived in safety.py, no extra LLM)
    exciter_amount: float = 0.0
    resonance_suppression: float = 0.0
    perceptual_density: float = 0.0
    transient_restore: float = 0.0
    limiter_drive: float = 0.35
    harmonic_low: float = 0.25
    harmonic_mid: float = 0.28
    harmonic_high: float = 0.18
    width_air: float = 1.0
    width_body: float = 1.0
    mb_attack_ms: float = 12.0
    mb_release_ms: float = 90.0
    mb_release_high_ms: float = 60.0
    clip_drive: float = 0.25
    center_anchor: float = 0.5
    sub_mono_strength: float = 0.85
    oversample_factor: int = 8


@dataclass
class MasteringDSPPlan:
    """Full render plan passed to the mastering engine."""

    params: SafeDSPParams
    duration_sec: float = 0.0
    # Per-sample modulation 0..1+ (built from sectional analysis)
    width_curve: np.ndarray | None = None
    saturation_curve: np.ndarray | None = None
    compression_curve: np.ndarray | None = None
    exciter_curve: np.ndarray | None = None
    section_labels: list[str] = field(default_factory=list)
