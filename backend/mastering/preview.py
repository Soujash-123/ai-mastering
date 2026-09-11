"""User-facing DSP editing: re-render mastered audio from stored render context.

The mastering pipeline normally runs once (analysis → LLM intent → safe params →
render). When a job completes we persist the exact render inputs (SafeDSPParams +
slim analysis) so the user can tweak bounded DSP parameters on the results page
and preview / re-render without re-running the LLM or analysis step.
"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path
from typing import Any

import numpy as np
import pyloudnorm as pyln
import soundfile as sf

from mastering.chain import render_master
from mastering.dsp_params import SECTION_CONTROL_HZ, SafeDSPParams
from mastering.section_automation import build_mastering_plan

CONTEXT_FILENAME = "mastering_context.json"

# Bounded editable parameters (key → (min, max)). Mirrors the safe clamps in
# mastering/safety.py so user edits cannot push the chain out of its design space.
PARAM_BOUNDS: dict[str, tuple[float, float]] = {
    "low_shelf_db": (-3.0, 3.0),
    "mid_peak_db": (-4.0, 4.0),
    "high_shelf_db": (-4.0, 4.0),
    "dynamic_eq_strength": (0.0, 1.0),
    "low_ratio": (1.0, 3.0),
    "mid_ratio": (1.0, 4.0),
    "high_ratio": (1.0, 3.5),
    "saturation_amount": (0.0, 0.45),
    "stereo_width_factor": (0.9, 1.2),
    "transient_blend": (0.15, 0.9),
    "exciter_amount": (0.0, 0.35),
    "resonance_suppression": (0.0, 0.7),
    "perceptual_density": (0.0, 0.25),
    "transient_restore": (0.0, 0.5),
    "limiter_drive": (0.15, 0.6),
    "harmonic_low": (0.0, 0.42),
    "harmonic_mid": (0.0, 0.42),
    "harmonic_high": (0.0, 0.32),
    "width_air": (0.9, 1.2),
    "width_body": (0.9, 1.15),
    "mb_attack_ms": (3.0, 80.0),
    "mb_release_ms": (40.0, 400.0),
    "mb_release_high_ms": (25.0, 250.0),
    "clip_drive": (0.0, 0.25),
    "center_anchor": (0.0, 1.0),
    "sub_mono_strength": (0.7, 0.98),
    "target_lufs": (-18.0, -7.0),
    "true_peak_ceiling_db": (-3.0, -0.3),
}


def sanitize_overrides(overrides: dict[str, Any]) -> dict[str, float]:
    """Validate + clamp a user-provided DSP override map to safe bounds."""
    if not isinstance(overrides, dict):
        raise ValueError("overrides must be a JSON object")
    clean: dict[str, float] = {}
    for key, raw in overrides.items():
        if key not in PARAM_BOUNDS:
            raise ValueError(f"Unknown DSP parameter: {key}")
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid value for {key}: {raw!r}") from exc
        if not np.isfinite(value):
            raise ValueError(f"Invalid value for {key}: {raw!r}")
        lo, hi = PARAM_BOUNDS[key]
        clean[key] = float(np.clip(value, lo, hi))
    return clean


def params_from_ctx(ctx: dict[str, Any]) -> SafeDSPParams:
    return SafeDSPParams(**ctx["params"])


def apply_overrides(base: SafeDSPParams, overrides: dict[str, Any]) -> SafeDSPParams:
    clean = sanitize_overrides(overrides)
    if not clean:
        return base
    return dataclasses.replace(base, **clean)


def _to_stereo(y: np.ndarray) -> np.ndarray:
    y = np.asarray(y, dtype=np.float32)
    if y.ndim == 1:
        y = np.stack([y, y], axis=0)
    if y.shape[0] == 1:
        y = np.stack([y[0], y[0]], axis=0)
    if y.shape[0] > 2:
        y = y[:2]
    return np.clip(y, -1.0, 1.0).astype(np.float32)


def _measure(output_path: str, sr: int) -> tuple[float | None, float | None]:
    """Integrated LUFS (pyloudnorm) + true-peak-ish dBFS of the rendered file."""
    try:
        audio, _sr = sf.read(output_path, always_2d=True, dtype="float32")
        meter = pyln.Meter(_sr)
        lufs = float(meter.integrated_loudness(audio))
        if not np.isfinite(lufs):
            lufs = None
    except Exception:
        lufs = None
    try:
        audio, _sr = sf.read(output_path, always_2d=True, dtype="float32")
        peak = float(np.max(np.abs(audio)) + 1e-12)
        peak_db = float(20.0 * np.log10(peak))
        if not np.isfinite(peak_db):
            peak_db = None
    except Exception:
        peak_db = None
    return lufs, peak_db


def pick_preview_window(
    sectional: list[dict[str, Any]],
    duration_sec: float,
    length_sec: float,
) -> float:
    """Pick a ~length_sec window centered on the loudest/most energetic section."""
    best_center: float | None = None
    best_e: float = -1.0
    for row in sectional:
        start = float(row.get("start_sec", 0.0))
        end = float(row.get("end_sec", start))
        if end <= start:
            end = start + min(30.0, max(0.0, duration_sec - start))
        punch = float(row.get("punch_score", 0.5))
        rms = float(row.get("rms", 0.1))
        emo = float(row.get("emotional_intensity_estimation", 5.0))
        energy = punch * 0.08 + rms * 0.5 + emo * 0.02
        if energy > best_e:
            best_e = energy
            best_center = (start + end) / 2.0
    if best_center is None:
        best_center = duration_sec / 2.0
    half = length_sec / 2.0
    return float(np.clip(best_center, half, max(half, duration_sec - half)))


def render_with_context(
    input_path: str,
    output_path: str,
    ctx: dict[str, Any],
    overrides: dict[str, Any],
    segment: tuple[float, float] | None = None,
) -> dict[str, Any]:
    """Re-render a master (or a segment window) from the stored context.

    `segment` is (start_sec, length_sec); when None the full track is rendered.
    Returns render metadata (params snapshot + meters).
    """
    import time
    import os

    t0 = time.time()
    y, sr = sf.read(input_path, always_2d=True, dtype="float32")
    stereo = _to_stereo(y.T)
    del y
    sr = int(sr)
    full_duration = float(stereo.shape[1] / sr)

    params = apply_overrides(params_from_ctx(ctx), overrides)
    analysis = ctx.get("analysis") or {}
    plan = build_mastering_plan(params, analysis, full_duration, sr)

    seg_start: float | None = None
    seg_len: float = 0.0
    if segment is not None:
        seg_start, seg_len = segment
        i0 = int(seg_start * SECTION_CONTROL_HZ)
        i1 = int((seg_start + seg_len) * SECTION_CONTROL_HZ) + 1
        if plan.compression_curve is not None and plan.compression_curve.size > 0:
            plan.compression_curve = plan.compression_curve[i0:i1]
        s0 = int(seg_start * sr)
        s1 = min(stereo.shape[1], int((seg_start + seg_len) * sr))
        stereo = stereo[:, s0:s1]

    out = render_master(stereo, sr, plan)
    del stereo, plan

    output_path = Path(output_path)
    tmp_path = output_path.parent / f".{output_path.stem}.{os.getpid()}.tmp.wav"
    sf.write(str(tmp_path), out.T, sr, subtype="PCM_24")
    os.replace(str(tmp_path), str(output_path))

    lufs, peak_db = _measure(output_path, sr)
    return {
        "params": dataclasses.asdict(params),
        "lufs": lufs,
        "peak_db": peak_db,
        "duration_sec": float(out.shape[1] / sr),
        "is_full": seg_start is None,
        "render_sec": round(time.time() - t0, 2),
        "segment": (seg_start, seg_len) if seg_start is not None else None,
    }


def save_render_context(
    job_dir: Path,
    params: SafeDSPParams,
    analysis_dsp: dict[str, Any],
    platform: str | None = None,
) -> None:
    """Persist render inputs so preview/finalize can re-run the DSP chain."""
    ctx = {
        "params": dataclasses.asdict(params),
        "analysis": analysis_dsp or {},
        "platform": platform,
    }
    try:
        job_dir.mkdir(parents=True, exist_ok=True)
        with open(job_dir / CONTEXT_FILENAME, "w", encoding="utf-8") as fh:
            json.dump(ctx, fh)
    except Exception:
        # Non-fatal: preview/finalize will simply report "unavailable".
        pass


def load_render_context(job_dir: Path) -> dict[str, Any] | None:
    try:
        with open(job_dir / CONTEXT_FILENAME, "r", encoding="utf-8") as fh:
            ctx = json.load(fh)
    except Exception:
        return None
    if not isinstance(ctx.get("params"), dict):
        return None
    return ctx


def update_render_context_params(job_dir: Path, params: dict[str, Any]) -> None:
    """Commit a new DSP snapshot so future result payloads reflect the render."""
    ctx = load_render_context(job_dir)
    if ctx is None:
        return
    ctx["params"] = dict(params)
    tmp = job_dir / f".{CONTEXT_FILENAME}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(ctx, fh)
        import os

        os.replace(str(tmp), str(job_dir / CONTEXT_FILENAME))
    except Exception:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass