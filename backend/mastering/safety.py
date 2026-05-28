"""Map LLM intent (0–10 perceptual) → SafeDSPParams for premium DSP engine."""

from __future__ import annotations

import numpy as np

from mastering.dsp_params import SafeDSPParams
from models.mastering_intent import MasteringIntent


def clamp(n: float, lo: float, hi: float) -> float:
    return float(np.clip(n, lo, hi))


def intent_to_safe_params(intent: MasteringIntent, measured_integrated_lufs: float) -> tuple[MasteringIntent, SafeDSPParams]:
    """Returns (clamped intent copy, DSP parameters)."""
    eq = intent.eq_strategy
    comp = intent.compression_strategy
    sat = intent.saturation_strategy
    spatial = intent.spatial_strategy
    trans = intent.transient_strategy
    loud = intent.loudness_strategy
    tr = intent.translation_strategy
    risk = intent.risk_management

    safe_intent = intent.model_copy(
        update={
            "loudness_strategy": loud.model_copy(
                update={
                    "target_lufs": clamp(loud.target_lufs, -18.0, -7.0),
                    "true_peak_target_db": clamp(loud.true_peak_target_db, -3.0, -0.3),
                }
            ),
            "mastering_chain": intent.mastering_chain.model_copy(
                update={"target_lufs": clamp(intent.mastering_chain.target_lufs, -18.0, -7.0)}
            ),
        }
    )
    safe_loud = safe_intent.loudness_strategy

    def n10(x: float) -> float:
        return clamp(float(x) / 10.0, 0.0, 1.0)

    low_shelf = clamp(eq.bass_weight_db - (eq.sub_control_db * 0.6), -3.0, 3.0)
    mid_peak = clamp(
        eq.midrange_presence_db + (n10(intent.vocal_strategy.vocal_presence_amount) - 0.5) * 2.0,
        -4.0,
        4.0,
    )
    high_shelf = clamp(eq.air_enhancement_db - eq.upper_mid_control_db * 0.5, -4.0, 4.0)
    dyn_eq = clamp(
        n10(eq.clarity_intensity) * 0.5
        + n10(intent.vocal_strategy.sibilance_control) * 0.35
        + n10(risk.harshness_risk) * 0.25,
        0.0,
        1.0,
    )

    ratio_base = clamp(comp.ratio, 1.0, 4.0)
    low_r = clamp(ratio_base * (0.85 + n10(comp.dynamic_density) * 0.4), 1.0, 3.0)
    mid_r = clamp(ratio_base * (0.95 + n10(comp.compression_intensity) * 0.5), 1.0, 4.0)
    high_r = clamp(ratio_base * (0.8 + n10(risk.harshness_risk) * 0.5), 1.0, 3.5)

    if measured_integrated_lufs > -10.0:
        low_r = min(low_r, 1.35)
        mid_r = min(mid_r, 1.45)
        high_r = min(high_r, 1.35)

    sat_amount = clamp(
        n10(sat.saturation_amount) * 0.38
        + n10(sat.harmonic_density) * 0.2
        + n10(sat.tape_character) * 0.08
        + n10(sat.tube_character) * 0.07,
        0.0,
        0.38,
    )

    width = 1.0 + (n10(spatial.stereo_width_amount) - 0.5) * 0.2
    width -= n10(spatial.low_end_width_reduction) * 0.04
    width = clamp(width, 0.94, 1.14)

    width_air = clamp(1.0 + (n10(spatial.stereo_width_amount) - 0.5) * 0.22, 0.95, 1.18)
    width_body = clamp(1.0 + (n10(spatial.side_energy_amount) - 0.5) * 0.12, 0.96, 1.1)

    transient_blend = clamp(
        n10(trans.impact_preservation) * 0.55
        + n10(trans.transient_emphasis) * 0.3
        + (1.0 - n10(trans.transient_smoothing)) * 0.15,
        0.2,
        0.88,
    )

    exciter = clamp(n10(eq.brightness_intensity) * 0.28 + n10(intent.vocal_strategy.vocal_air) * 0.18, 0.0, 0.28)
    resonance = clamp(n10(risk.harshness_risk) * 0.4 + n10(intent.vocal_strategy.sibilance_control) * 0.35, 0.0, 0.65)
    perceptual_density = clamp(n10(comp.dynamic_density) * 0.22 + n10(sat.harmonic_density) * 0.15, 0.0, 0.22)
    transient_restore = clamp(n10(trans.impact_preservation) * 0.4 + n10(trans.drum_punch_priority) * 0.2, 0.0, 0.5)
    limiter_drive = clamp(n10(loud.limiter_aggressiveness) * 0.42 + n10(loud.perceived_loudness_priority) * 0.22, 0.2, 0.55)
    clip_drive = clamp(n10(loud.limiter_aggressiveness) * 0.22 + sat_amount * 0.18, 0.05, 0.22)

    if n10(tr.club_translation_priority) > 0.65:
        low_r = clamp(low_r + 0.08, 1.0, 3.0)
        sat_amount = clamp(sat_amount + 0.03, 0.0, 0.38)

    params = SafeDSPParams(
        low_shelf_db=clamp(low_shelf, -3.0, 3.0),
        mid_peak_db=clamp(mid_peak, -4.0, 4.0),
        high_shelf_db=clamp(high_shelf, -4.0, 4.0),
        dynamic_eq_strength=clamp(dyn_eq, 0.0, 1.0),
        low_ratio=clamp(low_r, 1.0, 3.0),
        mid_ratio=clamp(mid_r, 1.0, 4.0),
        high_ratio=clamp(high_r, 1.0, 3.5),
        saturation_amount=sat_amount,
        stereo_width_factor=width,
        transient_blend=transient_blend,
        target_lufs=safe_loud.target_lufs,
        true_peak_ceiling_db=safe_loud.true_peak_target_db,
        exciter_amount=exciter,
        resonance_suppression=resonance,
        perceptual_density=perceptual_density,
        transient_restore=transient_restore,
        limiter_drive=limiter_drive,
        harmonic_low=clamp(n10(sat.tape_character) * 0.32 + sat_amount * 0.22, 0.0, 0.38),
        harmonic_mid=clamp(n10(sat.harmonic_density) * 0.35 + sat_amount * 0.25, 0.0, 0.4),
        harmonic_high=clamp(n10(sat.tube_character) * 0.28 + n10(eq.brightness_intensity) * 0.1, 0.0, 0.3),
        oversample_factor=8,
        width_air=width_air,
        width_body=width_body,
        mb_attack_ms=clamp(comp.attack_behavior_ms, 3.0, 80.0),
        mb_release_ms=clamp(comp.release_behavior_ms, 40.0, 400.0),
        mb_release_high_ms=clamp(comp.release_behavior_ms * 0.55, 25.0, 250.0),
        clip_drive=clip_drive,
        center_anchor=n10(spatial.center_image_strength),
        sub_mono_strength=clamp(0.75 + n10(spatial.mono_compatibility_priority) * 0.2, 0.7, 0.98),
    )
    return safe_intent, params
