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

Output rules: output the mastering JSON object EXACTLY ONCE, as plain JSON — NO markdown fences, NO prose before or after, NO trailing commas, no single quotes. Escape double quotes inside strings.

JSON skeleton (all keys required; intensities 0–10):
{"mastering_chain":{"mastering_style":"","processing_intensity":5,"analog_character_amount":5,"target_lufs":-10,"overall_emotional_goal":"","translation_priority":""},"eq_strategy":{"sub_control_db":0,"bass_weight_db":0,"low_mid_cleanup_db":0,"midrange_presence_db":0,"upper_mid_control_db":0,"air_enhancement_db":0,"brightness_intensity":5,"warmth_intensity":5,"clarity_intensity":5,"spectral_balance_strategy":""},"compression_strategy":{"compression_style":"","compression_intensity":5,"glue_amount":5,"punch_preservation":6,"microdynamic_retention":6,"attack_behavior_ms":24,"release_behavior_ms":180,"ratio":2.5,"dynamic_density":5,"compression_notes":""},"saturation_strategy":{"saturation_style":"","saturation_amount":5,"tube_character":5,"tape_character":5,"transformer_weight":5,"harmonic_density":5,"transient_softening":3,"high_end_texture":"","coloration_notes":""},"spatial_strategy":{"stereo_width_amount":5,"center_image_strength":7,"front_back_depth":5,"side_energy_amount":5,"mono_compatibility_priority":7,"low_end_width_reduction":5,"spatial_realism":6,"depth_strategy":""},"transient_strategy":{"transient_emphasis":5,"attack_enhancement":5,"impact_preservation":6,"drum_punch_priority":6,"transient_smoothing":3,"transient_notes":""},"vocal_strategy":{"vocal_presence_amount":5,"vocal_forwardness":5,"vocal_warmth":5,"vocal_air":4,"sibilance_control":5,"vocal_emotional_focus":6,"vocal_notes":""},"loudness_strategy":{"target_lufs":-10,"true_peak_target_db":-1,"limiter_aggressiveness":5,"perceived_loudness_priority":5,"dynamic_preservation_priority":6,"streaming_optimization_strength":6,"loudness_notes":""},"translation_strategy":{"earbud_translation_priority":6,"club_translation_priority":4,"car_translation_priority":6,"bluetooth_translation_priority":6,"cinema_translation_priority":3,"mono_translation_priority":7,"codec_resilience_priority":7,"translation_notes":""},"sectional_processing":[],"risk_management":{"detected_risks":[],"fatigue_risk":5,"harshness_risk":5,"low_end_masking_risk":5,"stereo_instability_risk":5,"codec_failure_risk":5,"protection_strategy":""},"final_report":{"mix_assessment":"","mastering_direction":"","commercial_readiness":"","translation_assessment":"","dynamic_assessment":"","spatial_assessment":"","emotional_assessment":"","final_summary":""}}"""


_STRING_TOKEN_RE = re.compile(r'"(?:[^"\\]|\\.)*"')
_TRAILING_COMMA_RE = re.compile(r",(\s*)([}\]])")
_PLACEHOLDER = "\u001f"  # unit separator; never legitimately appears in JSON


def _balanced_object(text: str) -> str | None:
    """Return the first balanced JSON object `{...}` (string/quote aware),
    ignoring any prose or trailing content around it."""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _mask_strings(text: str) -> tuple[str, list[str]]:
    store: list[str] = []

    def _rep(m: re.Match[str]) -> str:
        store.append(m.group(0))
        return f"{_PLACEHOLDER}{len(store) - 1}{_PLACEHOLDER}"

    skeleton = _STRING_TOKEN_RE.sub(_rep, text)
    return skeleton, store


def _unmask_strings(skeleton: str, store: list[str]) -> str:
    def _rep(m: re.Match[str]) -> str:
        return store[int(m.group(1))]

    return re.sub(rf"{_PLACEHOLDER}(\d+){_PLACEHOLDER}", _rep, skeleton)


def _remove_trailing_commas(text: str) -> str:
    """Drop commas directly before `}` / `]`, without touching string contents."""
    skeleton, store = _mask_strings(text)
    fixed = _TRAILING_COMMA_RE.sub(r"\1\2", skeleton)
    return _unmask_strings(fixed, store)


def _insert_missing_commas(text: str) -> str:
    """Insert ',' between adjacent JSON values separated only by whitespace.

    In valid JSON two values (objects, arrays, numbers, keys) are never
    directly adjacent without a comma, so this rule can only apply to
    malformed output. String contents are masked to avoid corruption.
    """
    skeleton, store = _mask_strings(text)
    value = rf"(?:\d|\]|\}}|{_PLACEHOLDER}\d+{_PLACEHOLDER})"
    nxt = rf"(?:[-\[{{0-9]|{_PLACEHOLDER}\d+{_PLACEHOLDER})"
    fixed = re.sub(rf"({value})(\s*)({nxt})", r"\1,\2\3", skeleton)
    return _unmask_strings(fixed, store)


def try_repair_json(text: str) -> dict[str, Any] | None:
    """Best-effort recovery of an LLM mastering JSON object.

    Tries progressively repaired candidates (markdown fences / trailing prose,
    trailing commas, missing commas). Returns None if the output is unusable so
    the caller can trigger an LLM self-correction retry.
    """
    if not isinstance(text, str):
        return None

    candidates: list[str] = []
    seen: set[str] = set()

    def _add(s: str) -> None:
        if s and s not in seen:
            seen.add(s)
            candidates.append(s)

    _add(text.strip())
    balanced = _balanced_object(text)
    if balanced:
        _add(balanced)
        no_trailing = _remove_trailing_commas(balanced)
        _add(no_trailing)
        with_commas = _insert_missing_commas(balanced)
        _add(with_commas)
        _add(_insert_missing_commas(no_trailing))
        _add(_remove_trailing_commas(with_commas))

    for candidate in candidates:
        try:
            obj = json.loads(candidate)
        except Exception:
            continue
        if isinstance(obj, dict):
            return obj
    return None


def _json_error_message(text: str) -> str:
    candidate = _balanced_object(text) or text
    try:
        json.loads(candidate)
    except Exception as exc:
        return str(exc)[:300]
    return "No valid JSON object found in output"


def _chat_json(client: OpenAI, model: str, messages: list[dict[str, str]]) -> str:
    resp = client.chat.completions.create(model=model, messages=messages)
    content = resp.choices[0].message.content or "{}"
    logger.info("Mastering LLM responded (content_chars=%d)", len(content))
    return content


SELF_CORRECT_PROMPT = (
    "Your previous response was not valid JSON and could not be parsed. "
    "Reply with ONLY the complete corrected mastering JSON object — same schema, "
    "all required keys, valid JSON, no markdown, no prose, no trailing commas.\n\n"
    "Parse error: {error}\n\nInvalid previous output:\n{snippet}"
)


def generate_mastering_plan(analysis: dict[str, Any]) -> tuple[MasteringIntent, MasteringReport, dict[str, Any]]:
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is required for LLM-driven mastering schema generation.")

    compact = CompactContextBuilder.build(analysis)

    client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=settings.groq_api_key)
    inp = json.dumps(compact, separators=(",", ":"), ensure_ascii=False)
    est = compact.get("meta", {}).get("estimated_input_tokens", 0)

    user_prompt = (
        f"estimated_input_tokens≈{est}. Analyze then output the mastering JSON. "
        f"Input JSON:\n{inp}"
    )

    logger.info(
        "Calling mastering LLM (model=%s, est_input_tokens≈%s, sections=%s, transition_peaks=%s)",
        settings.gpt_oss_mastering_model,
        est,
        len(compact.get("sectional_analysis", [])),
        len(compact.get("transition_peaks", [])),
    )

    messages: list[dict[str, str]] = [
        {"role": "system", "content": MASTERING_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    data: dict[str, Any] | None = None
    repair_attempts = 0
    max_repairs = max(0, int(settings.mastering_llm_retries))
    raw_text = _chat_json(client, settings.gpt_oss_mastering_model, messages)

    while True:
        data = try_repair_json(raw_text)
        if data is not None:
            break
        if repair_attempts >= max_repairs:
            logger.error(
                "Mastering LLM output remained unparseable after %d repair attempt(s); "
                "falling back to a safe default plan",
                repair_attempts,
            )
            data = {}
            break
        repair_attempts += 1
        error = _json_error_message(raw_text)
        logger.warning(
            "Mastering LLM JSON invalid (repair attempt %d/%d); requesting self-correction: %s",
            repair_attempts,
            max_repairs,
            error,
        )
        messages.append({"role": "assistant", "content": raw_text})
        messages.append(
            {
                "role": "user",
                "content": SELF_CORRECT_PROMPT.format(error=error, snippet=raw_text[:6000]),
            }
        )
        raw_text = _chat_json(client, settings.gpt_oss_mastering_model, messages)

    if repair_attempts:
        logger.info("Mastering LLM JSON recovered after %d repair attempt(s)", repair_attempts)
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
        "repair_attempts": repair_attempts,
        "fallback_defaults": not bool(data),
    }
