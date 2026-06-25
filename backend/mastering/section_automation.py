"""Section-aware automation from analysis (control-rate compression, scalar modifiers)."""

from __future__ import annotations

from typing import Any

import numpy as np

from mastering.dsp_params import SECTION_CONTROL_HZ, MasteringDSPPlan, SafeDSPParams

_SECTION_PRESETS: dict[str, dict[str, float]] = {
    "intro": {"width": 0.96, "sat": 0.88, "comp": 0.9, "exciter": 0.85},
    "verse": {"width": 0.98, "sat": 0.92, "comp": 0.92, "exciter": 0.9},
    "pre_chorus": {"width": 1.02, "sat": 0.98, "comp": 0.96, "exciter": 0.95},
    "chorus": {"width": 1.08, "sat": 1.12, "comp": 1.05, "exciter": 1.08},
    "bridge": {"width": 1.04, "sat": 1.05, "comp": 0.98, "exciter": 1.0},
    "drop": {"width": 1.1, "sat": 1.15, "comp": 1.08, "exciter": 1.12},
    "outro": {"width": 1.0, "sat": 0.95, "comp": 0.94, "exciter": 0.88},
}


def _smooth_1d(values: np.ndarray, radius: int = 2) -> np.ndarray:
    if values.size < 3 or radius < 1:
        return values
    kernel = np.hanning(radius * 2 + 1).astype(np.float32)
    kernel /= np.sum(kernel) + 1e-12
    return np.convolve(values, kernel, mode="same").astype(np.float32)


def _energy_scale(section_row: dict[str, Any]) -> float:
    punch = float(section_row.get("punch_score", 0.5))
    rms = float(section_row.get("rms", 0.1))
    emo = float(section_row.get("emotional_intensity_estimation", 5.0))
    e = 0.9 + min(0.2, punch * 0.08 + rms * 0.4 + emo * 0.02)
    return float(np.clip(e, 0.85, 1.18))


def _llm_section_scale(analysis: dict[str, Any], section_name: str) -> float:
    mods = analysis.get("llm_section_modifiers") or []
    for m in mods:
        if str(m.get("section", "")).lower() == section_name.lower():
            pi = float(m.get("processing_intensity", 5.0))
            return float(np.clip(0.85 + (pi / 10.0) * 0.3, 0.85, 1.2))
    return 1.0


def _build_control_rate_plan(
    duration_sec: float,
    sectional_analysis: list[dict[str, Any]],
    base_width: float,
    analysis: dict[str, Any] | None,
    control_hz: float = SECTION_CONTROL_HZ,
) -> tuple[float, float, float, np.ndarray, list[str]]:
    """Build scalar modifiers + ~10 Hz compression curve (~KB, not ~MB)."""
    n_ctl = max(2, int(duration_sec * control_hz) + 1)
    comp = np.ones(n_ctl, dtype=np.float32)
    labels: list[str] = []

    width_sum = 0.0
    sat_sum = 0.0
    exciter_sum = 0.0
    weight_sum = 0.0

    ctx = analysis or {}
    for row in sectional_analysis:
        name = str(row.get("section", "verse")).split("+")[0]
        preset = _SECTION_PRESETS.get(name, _SECTION_PRESETS["verse"])
        e_scale = _energy_scale(row)
        llm = _llm_section_scale(ctx, name)
        start = float(row.get("start_sec", 0.0))
        end = float(row.get("end_sec", start))
        dur = max(0.0, end - start)
        if dur <= 0:
            continue

        labels.append(name)
        w_val = float(preset["width"] * e_scale * llm)
        s_val = float(preset["sat"] * e_scale * llm)
        e_val = float(preset["exciter"] * e_scale * llm)
        c_val = float(preset["comp"] * e_scale * llm)

        width_sum += w_val * dur
        sat_sum += s_val * dur
        exciter_sum += e_val * dur
        weight_sum += dur

        i0 = max(0, int(start * control_hz))
        i1 = min(n_ctl, int(end * control_hz) + 1)
        if i1 > i0:
            comp[i0:i1] = c_val

    comp = _smooth_1d(comp, radius=2)

    if weight_sum > 0:
        width_mod = width_sum / weight_sum
        sat_mod = sat_sum / weight_sum
        exciter_mod = exciter_sum / weight_sum
    else:
        width_mod = float(base_width)
        sat_mod = 1.0
        exciter_mod = 1.0

    return width_mod, sat_mod, exciter_mod, comp, labels


def build_mastering_plan(
    params: SafeDSPParams,
    analysis: dict[str, Any] | None,
    duration_sec: float,
    sr: int,
) -> MasteringDSPPlan:
    _ = sr
    sectional: list[dict[str, Any]] = []
    if analysis:
        sectional = list(analysis.get("sectional_analysis") or [])

    if sectional:
        width_mod, sat_mod, exciter_mod, comp, labels = _build_control_rate_plan(
            duration_sec,
            sectional,
            params.stereo_width_factor,
            analysis,
        )
    else:
        width_mod = float(params.stereo_width_factor)
        sat_mod = 1.0
        exciter_mod = 1.0
        comp = np.ones(max(2, int(duration_sec * SECTION_CONTROL_HZ) + 1), dtype=np.float32)
        labels = []

    return MasteringDSPPlan(
        params=params,
        duration_sec=duration_sec,
        width_mod=width_mod,
        sat_mod=sat_mod,
        exciter_mod=exciter_mod,
        compression_curve=comp,
        compression_control_hz=SECTION_CONTROL_HZ,
        section_labels=labels,
    )
