"""Style envelopes: the safety layer must enforce style limits regardless of LLM intent."""
from __future__ import annotations

import pytest

from mastering.safety import intent_to_safe_params
from mastering.style_profiles import STYLE_PROFILES, normalize_style_family
from models.mastering_intent import MasteringIntent


def _aggressive_intent() -> MasteringIntent:
    """An LLM plan that pushes everything as loud/dense as the generic clamps allow."""
    base = {name: f.annotation() for name, f in MasteringIntent.model_fields.items() if name != "sectional_processing"}
    intent = MasteringIntent(**base)
    intent.loudness_strategy.target_lufs = -7.0
    intent.loudness_strategy.limiter_aggressiveness = 10
    intent.loudness_strategy.perceived_loudness_priority = 10
    intent.mastering_chain.target_lufs = -7.0
    intent.compression_strategy.ratio = 4.0
    intent.compression_strategy.compression_intensity = 10
    intent.compression_strategy.dynamic_density = 10
    intent.compression_strategy.attack_behavior_ms = 3
    intent.compression_strategy.release_behavior_ms = 40
    intent.saturation_strategy.saturation_amount = 10
    intent.saturation_strategy.harmonic_density = 10
    intent.saturation_strategy.tube_character = 10
    intent.saturation_strategy.tape_character = 10
    intent.eq_strategy.brightness_intensity = 10
    intent.eq_strategy.air_enhancement_db = 4
    intent.vocal_strategy.vocal_air = 10
    intent.spatial_strategy.stereo_width_amount = 10
    intent.transient_strategy.impact_preservation = 0
    intent.transient_strategy.transient_emphasis = 0
    intent.transient_strategy.transient_smoothing = 10
    return intent


def test_auto_is_unchanged():
    intent = _aggressive_intent()
    a_intent, a = intent_to_safe_params(intent, -20.0)
    b_intent, b = intent_to_safe_params(intent, -20.0, style_family="auto")
    assert a == b
    assert a_intent == b_intent
    assert a.target_lufs == -7.0


def test_classical_envelope_overrides_loud_llm_plan():
    safe_intent, p = intent_to_safe_params(_aggressive_intent(), -20.0, style_family="indian_classical")
    assert p.target_lufs == -14.0
    assert safe_intent.loudness_strategy.target_lufs == -14.0
    assert safe_intent.mastering_chain.target_lufs == -14.0
    assert max(p.low_ratio, p.mid_ratio, p.high_ratio) <= 1.5
    assert p.limiter_drive <= 0.28
    assert p.saturation_amount <= 0.12
    # Slow time constants so the tanpura drone doesn't pump; attacks pass through.
    assert p.mb_release_ms >= 220.0
    assert p.mb_attack_ms >= 25.0
    assert p.transient_blend >= 0.65


def test_quiet_classical_plan_is_raised_to_window_floor():
    intent = _aggressive_intent()
    intent.loudness_strategy.target_lufs = -18.0
    intent.mastering_chain.target_lufs = -18.0
    _, p = intent_to_safe_params(intent, -25.0, style_family="indian_classical")
    assert p.target_lufs == -16.0


@pytest.mark.parametrize("key", [k for k in STYLE_PROFILES if k != "auto"])
def test_every_profile_stays_inside_generic_safety_ranges(key):
    _, p = intent_to_safe_params(_aggressive_intent(), -20.0, style_family=key)
    lo, hi = STYLE_PROFILES[key].lufs_range
    assert lo <= p.target_lufs <= hi
    assert 1.0 <= p.low_ratio <= 3.0 and 1.0 <= p.mid_ratio <= 4.0 and 1.0 <= p.high_ratio <= 3.5
    assert 0.0 <= p.resonance_suppression <= 0.65
    assert 0.2 <= p.transient_blend <= 0.88
    assert 3.0 <= p.mb_attack_ms <= 80.0 and 40.0 <= p.mb_release_ms <= 400.0
    assert 0.7 <= p.sub_mono_strength <= 0.98


def test_lossy_source_limits_top_end_brightening():
    _, clean = intent_to_safe_params(_aggressive_intent(), -20.0, style_family="bollywood_dance")
    _, lossy = intent_to_safe_params(_aggressive_intent(), -20.0, style_family="bollywood_dance", source_lossy=True)
    assert clean.exciter_amount > 0.12
    assert lossy.exciter_amount <= 0.12
    assert lossy.high_shelf_db <= 1.5
    assert lossy.harmonic_high <= 0.15


def test_normalize_style_family():
    assert normalize_style_family(None) == "auto"
    assert normalize_style_family("  Indian_Classical ") == "indian_classical"
    with pytest.raises(ValueError):
        normalize_style_family("k-pop")
