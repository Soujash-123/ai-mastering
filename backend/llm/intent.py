"""LLM mastering brain: compact context in, structured JSON plan out."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import OpenAI

from llm.compact_context import CompactContextBuilder
from llm.output_normalizer import parse_mastering_intent_with_retry
from models.mastering_intent import MasteringIntent, MasteringReport
from utils.config import get_settings

logger = logging.getLogger(__name__)

MASTERING_SYSTEM_PROMPT = """Role: timeline-aware mastering director. Output ONLY valid JSON (no markdown). Use compact analysis as evidence; preserve dynamics, section contrast, translation.

IMPORTANT SCALING RULES:
All perceptual intensity values MUST use a 0–10 mastering scale.
Meaning: 0=none/minimal, 2=subtle, 5=balanced/moderate, 7=strong/professional emphasis, 10=extreme/maximal.
Applies to: warmth_intensity, brightness_intensity, punch_preservation, stereo_width_amount, harmonic_density, saturation_amount, vocal_forwardness, transient_emphasis, glue_amount, fatigue_risk, translation priorities, risk scores, etc.

Real audio units ONLY for: target_lufs (LUFS), true_peak_target_db (dBFS), attack_behavior_ms / release_behavior_ms (ms), compression ratio, EQ bands (*_db).
Never use percentages, normalized 0–1 intensities, or scientific notation for perceptual scores.

mastering_chain.target_lufs is program LUFS intent (same real unit as loudness_strategy.target_lufs; keep them consistent).

Verbosity: *_notes, protection_strategy, final_report fields ≤2 short sentences; detected_risks ≤8 short items.

JSON skeleton (all keys required; intensities 0–10):
{"mastering_chain":{"mastering_style":"","processing_intensity":5,"analog_character_amount":5,"target_lufs":-10,"overall_emotional_goal":"","translation_priority":""},"eq_strategy":{"sub_control_db":0,"bass_weight_db":0,"low_mid_cleanup_db":0,"midrange_presence_db":0,"upper_mid_control_db":0,"air_enhancement_db":0,"brightness_intensity":5,"warmth_intensity":5,"clarity_intensity":5,"spectral_balance_strategy":""},"compression_strategy":{"compression_style":"","compression_intensity":5,"glue_amount":5,"punch_preservation":6,"microdynamic_retention":6,"attack_behavior_ms":24,"release_behavior_ms":180,"ratio":2.5,"dynamic_density":5,"compression_notes":""},"saturation_strategy":{"saturation_style":"","saturation_amount":5,"tube_character":5,"tape_character":5,"transformer_weight":5,"harmonic_density":5,"transient_softening":3,"high_end_texture":"","coloration_notes":""},"spatial_strategy":{"stereo_width_amount":5,"center_image_strength":7,"front_back_depth":5,"side_energy_amount":5,"mono_compatibility_priority":7,"low_end_width_reduction":5,"spatial_realism":6,"depth_strategy":""},"transient_strategy":{"transient_emphasis":5,"attack_enhancement":5,"impact_preservation":6,"drum_punch_priority":6,"transient_smoothing":3,"transient_notes":""},"vocal_strategy":{"vocal_presence_amount":5,"vocal_forwardness":5,"vocal_warmth":5,"vocal_air":4,"sibilance_control":5,"vocal_emotional_focus":6,"vocal_notes":""},"loudness_strategy":{"target_lufs":-10,"true_peak_target_db":-1,"limiter_aggressiveness":5,"perceived_loudness_priority":5,"dynamic_preservation_priority":6,"streaming_optimization_strength":6,"loudness_notes":""},"translation_strategy":{"earbud_translation_priority":6,"club_translation_priority":4,"car_translation_priority":6,"bluetooth_translation_priority":6,"cinema_translation_priority":3,"mono_translation_priority":7,"codec_resilience_priority":7,"translation_notes":""},"sectional_processing":[],"risk_management":{"detected_risks":[],"fatigue_risk":5,"harshness_risk":5,"low_end_masking_risk":5,"stereo_instability_risk":5,"codec_failure_risk":5,"protection_strategy":""},"final_report":{"mix_assessment":"","mastering_direction":"","commercial_readiness":"","translation_assessment":"","dynamic_assessment":"","spatial_assessment":"","emotional_assessment":"","final_summary":""}}"""


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise ValueError("LLM did not return JSON object")
    return json.loads(m.group(0))


def generate_mastering_plan(analysis: dict[str, Any]) -> tuple[MasteringIntent, MasteringReport, dict[str, Any]]:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for LLM-driven mastering schema generation.")

    compact = CompactContextBuilder.build(analysis)

    client = OpenAI(api_key=settings.openai_api_key)
    inp = json.dumps(compact, separators=(",", ":"), ensure_ascii=False)
    est = compact.get("meta", {}).get("estimated_input_tokens", 0)

    user_prompt = (
        f"estimated_input_tokens≈{est}. Analyze then output the mastering JSON. "
        f"Input JSON:\n{inp}"
    )

    logger.info(
        "Calling mastering LLM (model=%s, est_input_tokens≈%s, sections=%s, transition_peaks=%s)",
        settings.openai_mastering_model,
        est,
        len(compact.get("sectional_analysis", [])),
        len(compact.get("transition_peaks", [])),
    )
    resp = client.chat.completions.create(
        model=settings.openai_mastering_model,
        messages=[
            {"role": "system", "content": MASTERING_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.35,
        response_format={"type": "json_object"},
    )
    raw_text = resp.choices[0].message.content or "{}"
    logger.info("Mastering LLM responded (content_chars=%d)", len(raw_text))
    try:
        data = _extract_json(raw_text)
    except Exception:
        logger.exception("Failed to parse LLM JSON response")
        raise
    try:
        intent, attempt = parse_mastering_intent_with_retry(data)
        if attempt > 1:
            logger.warning("Mastering plan validated on attempt %s (defaults/repair applied)", attempt)
    except Exception:
        logger.exception("LLM JSON failed validation after retries")
        raise
    report = intent.final_report
    logger.info("Mastering LLM output validated")
    return intent, report, {
        "raw": data,
        "compact_llm_input": compact,
        "validation_attempt": attempt,
    }
