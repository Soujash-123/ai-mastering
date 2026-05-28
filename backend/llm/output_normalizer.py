"""Repair and clamp LLM mastering JSON before Pydantic validation (0–10 perceptual scale)."""

from __future__ import annotations

import copy
from typing import Any

from models.mastering_intent import (
    CompressionStrategy,
    EqStrategy,
    FinalReport,
    MasteringChain,
    MasteringIntent,
    LoudnessStrategy,
    RiskManagement,
    SaturationStrategy,
    SpatialStrategy,
    TranslationStrategy,
    TransientStrategy,
    VocalStrategy,
)

# Nested paths for perceptual 0–10 intensity (not LUFS/dB/ms/ratio/dB gain fields).
PERCEPTUAL_PATHS: list[tuple[str, ...]] = [
    ("mastering_chain", "processing_intensity"),
    ("mastering_chain", "analog_character_amount"),
    ("eq_strategy", "brightness_intensity"),
    ("eq_strategy", "warmth_intensity"),
    ("eq_strategy", "clarity_intensity"),
    ("compression_strategy", "compression_intensity"),
    ("compression_strategy", "glue_amount"),
    ("compression_strategy", "punch_preservation"),
    ("compression_strategy", "microdynamic_retention"),
    ("compression_strategy", "dynamic_density"),
    ("saturation_strategy", "saturation_amount"),
    ("saturation_strategy", "tube_character"),
    ("saturation_strategy", "tape_character"),
    ("saturation_strategy", "transformer_weight"),
    ("saturation_strategy", "harmonic_density"),
    ("saturation_strategy", "transient_softening"),
    ("spatial_strategy", "stereo_width_amount"),
    ("spatial_strategy", "center_image_strength"),
    ("spatial_strategy", "front_back_depth"),
    ("spatial_strategy", "side_energy_amount"),
    ("spatial_strategy", "mono_compatibility_priority"),
    ("spatial_strategy", "low_end_width_reduction"),
    ("spatial_strategy", "spatial_realism"),
    ("transient_strategy", "transient_emphasis"),
    ("transient_strategy", "attack_enhancement"),
    ("transient_strategy", "impact_preservation"),
    ("transient_strategy", "drum_punch_priority"),
    ("transient_strategy", "transient_smoothing"),
    ("vocal_strategy", "vocal_presence_amount"),
    ("vocal_strategy", "vocal_forwardness"),
    ("vocal_strategy", "vocal_warmth"),
    ("vocal_strategy", "vocal_air"),
    ("vocal_strategy", "sibilance_control"),
    ("vocal_strategy", "vocal_emotional_focus"),
    ("loudness_strategy", "limiter_aggressiveness"),
    ("loudness_strategy", "perceived_loudness_priority"),
    ("loudness_strategy", "dynamic_preservation_priority"),
    ("loudness_strategy", "streaming_optimization_strength"),
    ("translation_strategy", "earbud_translation_priority"),
    ("translation_strategy", "club_translation_priority"),
    ("translation_strategy", "car_translation_priority"),
    ("translation_strategy", "bluetooth_translation_priority"),
    ("translation_strategy", "cinema_translation_priority"),
    ("translation_strategy", "mono_translation_priority"),
    ("translation_strategy", "codec_resilience_priority"),
    ("risk_management", "fatigue_risk"),
    ("risk_management", "harshness_risk"),
    ("risk_management", "low_end_masking_risk"),
    ("risk_management", "stereo_instability_risk"),
    ("risk_management", "codec_failure_risk"),
]

SECTIONAL_INTENSITY_KEYS = frozenset(
    {
        "energy_level",
        "processing_intensity",
        "stereo_expansion",
        "compression_amount",
        "harmonic_density",
        "transient_preservation",
    }
)

# Real-unit fields (LUFS / dB / time / ratio)
LOUDNESS_LUFS_PATH = ("loudness_strategy", "target_lufs")
MASTERING_CHAIN_LUFS_PATH = ("mastering_chain", "target_lufs")
TRUE_PEAK_PATH = ("loudness_strategy", "true_peak_target_db")
ATTACK_PATH = ("compression_strategy", "attack_behavior_ms")
RELEASE_PATH = ("compression_strategy", "release_behavior_ms")
RATIO_PATH = ("compression_strategy", "ratio")

EQ_DB_FIELDS = (
    "sub_control_db",
    "bass_weight_db",
    "low_mid_cleanup_db",
    "midrange_presence_db",
    "upper_mid_control_db",
    "air_enhancement_db",
)


def _get(d: dict[str, Any], path: tuple[str, ...]) -> Any:
    cur: Any = d
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def _set(d: dict[str, Any], path: tuple[str, ...], value: Any) -> None:
    cur = d
    for p in path[:-1]:
        if p not in cur or not isinstance(cur[p], dict):
            cur[p] = {}
        cur = cur[p]
    cur[path[-1]] = value


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.strip())
        except ValueError:
            return None
    return None


def _clamp_perceptual(x: float) -> float:
    return max(0.0, min(10.0, x))


def _clamp_lufs(x: float) -> float:
    return max(-18.0, min(-7.0, x))


def _clamp_true_peak(x: float) -> float:
    return max(-3.0, min(-0.2, x))


def _clamp_attack(x: float) -> float:
    return max(1.0, min(120.0, x))


def _clamp_release(x: float) -> float:
    return max(20.0, min(600.0, x))


def _clamp_ratio(x: float) -> float:
    return max(1.0, min(4.0, x))


def _clamp_eq_db(x: float) -> float:
    return max(-6.0, min(6.0, x))


def collect_perceptual_values(data: dict[str, Any]) -> list[float]:
    out: list[float] = []
    for path in PERCEPTUAL_PATHS:
        v = _to_float(_get(data, path))
        if v is not None:
            out.append(v)
    sp = data.get("sectional_processing")
    if isinstance(sp, list):
        for row in sp:
            if not isinstance(row, dict):
                continue
            for k in SECTIONAL_INTENSITY_KEYS:
                v = _to_float(row.get(k))
                if v is not None:
                    out.append(v)
    return out


def _likely_normalized_0_1(values: list[float]) -> bool:
    if not values:
        return False
    return all(0.0 <= v <= 1.0001 for v in values) and max(values) <= 1.0001


def _migrate_legacy_keys(out: dict[str, Any]) -> None:
    mc = out.get("mastering_chain")
    if isinstance(mc, dict) and "commercial_loudness_target" in mc:
        legacy = mc.pop("commercial_loudness_target")
        if "target_lufs" not in mc:
            mc["target_lufs"] = legacy


def default_mastering_plan_dict() -> dict[str, Any]:
    return MasteringIntent(
        mastering_chain=MasteringChain(),
        eq_strategy=EqStrategy(),
        compression_strategy=CompressionStrategy(),
        saturation_strategy=SaturationStrategy(),
        spatial_strategy=SpatialStrategy(),
        transient_strategy=TransientStrategy(),
        vocal_strategy=VocalStrategy(),
        loudness_strategy=LoudnessStrategy(),
        translation_strategy=TranslationStrategy(),
        sectional_processing=[],
        risk_management=RiskManagement(),
        final_report=FinalReport(),
    ).model_dump()


def deep_merge_defaults(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in overlay.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = deep_merge_defaults(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def normalize_llm_mastering_output(data: dict[str, Any]) -> dict[str, Any]:
    """Deep copy, rescale 0–1 habit → 0–10 if detected, clamp perceptual 0–10, clamp real audio fields."""
    out = copy.deepcopy(data)
    if not isinstance(out, dict):
        return out
    _migrate_legacy_keys(out)

    vals = collect_perceptual_values(out)
    scale_up = _likely_normalized_0_1(vals)

    for path in PERCEPTUAL_PATHS:
        v = _to_float(_get(out, path))
        if v is None:
            continue
        if scale_up:
            v *= 10.0
        _set(out, path, _clamp_perceptual(v))

    sp = out.get("sectional_processing")
    if isinstance(sp, list):
        for row in sp:
            if not isinstance(row, dict):
                continue
            for k in SECTIONAL_INTENSITY_KEYS:
                v = _to_float(row.get(k))
                if v is None:
                    continue
                if scale_up:
                    v *= 10.0
                row[k] = _clamp_perceptual(v)

    # LUFS / true peak (two possible locations for program loudness target)
    for path, clamp_fn in (
        (LOUDNESS_LUFS_PATH, _clamp_lufs),
        (MASTERING_CHAIN_LUFS_PATH, _clamp_lufs),
        (TRUE_PEAK_PATH, _clamp_true_peak),
    ):
        v = _to_float(_get(out, path))
        if v is not None:
            _set(out, path, clamp_fn(v))

    av = _to_float(_get(out, ATTACK_PATH))
    if av is not None:
        _set(out, ATTACK_PATH, _clamp_attack(av))
    rv = _to_float(_get(out, RELEASE_PATH))
    if rv is not None:
        _set(out, RELEASE_PATH, _clamp_release(rv))
    ratio = _to_float(_get(out, RATIO_PATH))
    if ratio is not None:
        _set(out, RATIO_PATH, _clamp_ratio(ratio))

    eq = out.get("eq_strategy")
    if isinstance(eq, dict):
        for k in EQ_DB_FIELDS:
            v = _to_float(eq.get(k))
            if v is not None:
                eq[k] = _clamp_eq_db(v)

    return out


def parse_mastering_intent_with_retry(data_hint: dict[str, Any]) -> tuple[MasteringIntent, int]:
    """
    Normalizer → validate with retries; merge defaults on failure.
    Returns (intent, attempt_number).
    """
    migrate = copy.deepcopy(data_hint)
    if not isinstance(migrate, dict):
        migrate = {}

    attempts_ops: list[tuple[str, dict[str, Any]]] = [
        ("raw", migrate),
        ("merge_defaults", deep_merge_defaults(default_mastering_plan_dict(), migrate)),
        ("fallback_defaults", default_mastering_plan_dict()),
    ]

    last_err: Exception | None = None
    for i, (_label, blob) in enumerate(attempts_ops, start=1):
        try:
            normalized = normalize_llm_mastering_output(blob)
            intent = MasteringIntent.model_validate(normalized)
            return intent, i
        except Exception as exc:
            last_err = exc
    assert last_err is not None
    raise last_err
