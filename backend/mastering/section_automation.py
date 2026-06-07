"""Section-aware automation curves from analysis (no LLM)."""

from __future__ import annotations

from typing import Any

import numpy as np

from mastering.dsp_params import MasteringDSPPlan, SafeDSPParams

# Perceptual multipliers by section role (applied on top of global params)
_SECTION_PRESETS: dict[str, dict[str, float]] = {
    "intro": {"width": 0.96, "sat": 0.88, "comp": 0.9, "exciter": 0.85},
    "verse": {"width": 0.98, "sat": 0.92, "comp": 0.92, "exciter": 0.9},
    "pre_chorus": {"width": 1.02, "sat": 0.98, "comp": 0.96, "exciter": 0.95},
    "chorus": {"width": 1.08, "sat": 1.12, "comp": 1.05, "exciter": 1.08},
    "bridge": {"width": 1.04, "sat": 1.05, "comp": 0.98, "exciter": 1.0},
    "drop": {"width": 1.1, "sat": 1.15, "comp": 1.08, "exciter": 1.12},
    "outro": {"width": 1.0, "sat": 0.95, "comp": 0.94, "exciter": 0.88},
}


def _smooth_crossfade(env: np.ndarray, sr: int, ms: float = 60.0) -> np.ndarray:
    win = max(3, int(ms * 1e-3 * sr))
    k = np.hanning(win).astype(np.float32)
    k /= np.sum(k) + 1e-12
    return np.convolve(env, k, mode="same").astype(np.float32)


def _energy_scale(section_row: dict[str, Any]) -> float:
    """Map sectional metrics to 0.85..1.15 multiplier."""
    punch = float(section_row.get("punch_score", 0.5))
    rms = float(section_row.get("rms", 0.1))
    emo = float(section_row.get("emotional_intensity_estimation", 5.0))
    e = 0.9 + min(0.2, punch * 0.08 + rms * 0.4 + emo * 0.02)
    return float(np.clip(e, 0.85, 1.18))


def build_section_curves(
    n_samples: int,
    sr: int,
    sectional_analysis: list[dict[str, Any]],
    base_width: float,
    analysis: dict[str, Any] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, list[str]]:
    width = np.ones(n_samples, dtype=np.float32) * base_width
    sat = np.ones(n_samples, dtype=np.float32)
    comp = np.ones(n_samples, dtype=np.float32)
    exciter = np.ones(n_samples, dtype=np.float32)
    labels: list[str] = []

    ctx = analysis or {}
    for row in sectional_analysis:
        name = str(row.get("section", "verse")).split("+")[0]
        preset = _SECTION_PRESETS.get(name, _SECTION_PRESETS["verse"])
        e_scale = _energy_scale(row)
        s0 = max(0, int(float(row.get("start_sec", 0)) * sr))
        s1 = min(n_samples, int(float(row.get("end_sec", 0)) * sr))
        if s1 <= s0:
            continue
        labels.append(name)
        llm = _llm_section_scale(ctx, name)
        width[s0:s1] = preset["width"] * e_scale * llm
        sat[s0:s1] = preset["sat"] * e_scale * llm
        comp[s0:s1] = preset["comp"] * e_scale * llm
        exciter[s0:s1] = preset["exciter"] * e_scale * llm

    width = _smooth_crossfade(width, sr)
    sat = _smooth_crossfade(sat, sr)
    comp = _smooth_crossfade(comp, sr)
    exciter = _smooth_crossfade(exciter, sr)
    return width, sat, comp, exciter, labels


def _llm_section_scale(analysis: dict[str, Any], section_name: str) -> float:
    mods = analysis.get("llm_section_modifiers") or []
    for m in mods:
        if str(m.get("section", "")).lower() == section_name.lower():
            pi = float(m.get("processing_intensity", 5.0))
            return float(np.clip(0.85 + (pi / 10.0) * 0.3, 0.85, 1.2))
    return 1.0


def build_mastering_plan(
    params: SafeDSPParams,
    analysis: dict[str, Any] | None,
    duration_sec: float,
    sr: int,
) -> MasteringDSPPlan:
    n = max(1, int(duration_sec * sr))
    sectional = []
    if analysis:
        sectional = list(analysis.get("sectional_analysis") or [])

    if sectional:
        w, s, c, e, labels = build_section_curves(n, sr, sectional, params.stereo_width_factor, analysis)
    else:
        w = np.full(n, params.stereo_width_factor, dtype=np.float32)
        s = np.ones(n, dtype=np.float32)
        c = np.ones(n, dtype=np.float32)
        e = np.ones(n, dtype=np.float32)
        labels = []

    return MasteringDSPPlan(
        params=params,
        duration_sec=duration_sec,
        width_curve=w,
        saturation_curve=s,
        compression_curve=c,
        exciter_curve=e,
        section_labels=labels,
    )
