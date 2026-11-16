"""Mastering Copilot: turns natural-language requests into Studio Session ops.

The model sees everything the pipeline knows about the song (compact analysis,
section timeline, AI mastering intent and report, style profile, current DSP
params) plus the live session, playhead and selection. It never touches audio:
it returns `{reply, ops}`, and `studio.session.apply_ops` validates and clamps
every op before the browser applies it instantly.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable, Optional

from llm.compact_context import CompactContextBuilder
from llm.intent import try_repair_json
from studio.session import MODULE_SPEC, PRESETS, REGION_SPEC
from utils.config import get_settings

logger = logging.getLogger(__name__)

MAX_HISTORY_TURNS = 12
MAX_MESSAGE_CHARS = 2000


class CopilotUnavailable(RuntimeError):
    pass


def _controls_doc() -> str:
    lines = []
    for mod, spec in MODULE_SPEC.items():
        params = ", ".join(
            f"{k}[{p['min']}..{p['max']} {p['unit']}]" for k, p in spec["params"].items()
        )
        lines.append(f"- {mod} ({spec['label']}): {params}")
    region = ", ".join(f"{k}[{p['min']}..{p['max']} {p['unit']}]" for k, p in REGION_SPEC.items())
    lines.append(f"- region fields: start_sec, end_sec, label, {region}")
    lines.append(f"- presets: {', '.join(PRESETS)}")
    return "\n".join(lines)


SYSTEM_PROMPT = f"""You are the Kord Mastering Copilot inside the Mastering Table, helping music students finish their songs.
The AI has already mastered the song. You adjust a live mastering layer on top of that AI master. The user hears your changes instantly.

Output ONLY one JSON object, no markdown: {{"reply": "...", "ops": [ ... ]}}
- reply: 1-3 short, friendly sentences in plain language (no jargon without a quick explanation). Say what you changed and why, or answer the question.
- ops: zero or more actions (empty if the user only asked a question):
  {{"op":"set_param","module":"eq","param":"bass_db","value":1.5}}
  {{"op":"toggle_module","module":"comp","enabled":true}}
  {{"op":"add_region","start_sec":72.0,"end_sec":100.5,"label":"Chorus 2","gain_db":2.0,"bass_db":0,"air_db":0,"fade_ms":300}}
  {{"op":"update_region","id":"<existing id>","gain_db":1.0}}
  {{"op":"remove_region","id":"<existing id>"}}
  {{"op":"apply_preset","preset":"warmer"}}
  {{"op":"propose_remaster","overrides":{{"mid_ratio":1.6}},"reason":"..."}}  (only for deep changes the live layer cannot do; the user must confirm, it is slow)

Controls:
{_controls_doc()}

Rules:
- "Louder/quieter at a part of the song" → a region with gain_db. Use the section timeline (seconds) or the user's selection/playhead to place it. Prefer section boundaries.
- Make modest moves (usually ±0.5..3 dB). Respect the style profile (e.g. Indian classical: keep dynamics, avoid heavy compression).
- Overall loudness → output.gain_db (the limiter keeps peaks safe); mention that louder can reduce punch.
- Use existing region ids from the session when editing regions. Never invent ids.
- If the request is unclear, ask one short question and return no ops.
"""


def _sections(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for row in analysis.get("sectional_analysis") or []:
        if not isinstance(row, dict):
            continue
        try:
            out.append(
                {
                    "section": str(row.get("section", ""))[:24],
                    "start_sec": round(float(row.get("start_sec", 0.0)), 2),
                    "end_sec": round(float(row.get("end_sec", 0.0)), 2),
                    "energy": round(float(row.get("emotional_intensity_estimation", 0.0)), 1),
                    "lufs": round(float(row["integrated_lufs"]), 1) if "integrated_lufs" in row else None,
                }
            )
        except (TypeError, ValueError):
            continue
    return out


def build_song_context(
    *,
    analysis: dict[str, Any],
    safe_intent: Optional[dict[str, Any]],
    report: Optional[dict[str, Any]],
    dsp_params: Optional[dict[str, Any]],
    duration_sec: float,
) -> dict[str, Any]:
    """Everything the copilot should know about the song (built once per request)."""
    try:
        compact = CompactContextBuilder.build(analysis) if analysis else {}
    except Exception:  # noqa: BLE001 - copilot must still work on legacy jobs
        logger.exception("Compact context build failed; continuing with partial context")
        compact = {}
    compact.pop("temporal_anchors", None)
    report = report or {}
    return {
        "duration_sec": round(duration_sec, 2),
        "style": {
            "family": analysis.get("style_family", "auto"),
            "label": analysis.get("style_label", ""),
            "guidance": analysis.get("style_guidance", ""),
            "source_lossy": bool(analysis.get("source_lossy", False)),
        },
        "section_timeline": _sections(analysis),
        "ai_master": {
            "summary": report.get("final_summary") or report.get("mastering_direction") or "",
            "dynamic_assessment": report.get("dynamic_assessment", ""),
            "loudness": (safe_intent or {}).get("loudness_strategy", {}),
            "dsp_params": {k: round(float(v), 3) for k, v in (dsp_params or {}).items() if isinstance(v, (int, float))},
        },
        "analysis": compact,
    }


def _session_brief(session: dict[str, Any]) -> dict[str, Any]:
    return {"preset": session.get("preset"), "modules": session.get("modules"), "regions": session.get("regions")}


def _call_llm(messages: list[dict[str, str]]) -> str:
    settings = get_settings()
    if not settings.groq_api_key:
        raise CopilotUnavailable("The Mastering Copilot is not configured on this server.")
    from openai import OpenAI

    client = OpenAI(base_url="https://api.groq.com/openai/v1", api_key=settings.groq_api_key)
    resp = client.chat.completions.create(model=settings.gpt_oss_mastering_model, messages=messages)
    return resp.choices[0].message.content or "{}"


def run_copilot(
    *,
    history: list[dict[str, Any]],
    song_context: dict[str, Any],
    session: dict[str, Any],
    playhead_sec: Optional[float],
    selection: Optional[dict[str, float]],
    llm: Optional[Callable[[list[dict[str, str]]], str]] = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Returns (reply, raw ops). Raises CopilotUnavailable when no LLM is configured."""
    llm = llm or _call_llm
    turns = [
        {"role": m["role"], "content": str(m.get("content", ""))[:MAX_MESSAGE_CHARS]}
        for m in history[-MAX_HISTORY_TURNS:]
        if isinstance(m, dict) and m.get("role") in ("user", "assistant")
    ]
    if not turns or turns[-1]["role"] != "user":
        raise ValueError("The last message must be from the user.")

    state = {
        "playhead_sec": round(playhead_sec, 2) if playhead_sec is not None else None,
        "selection": selection,
        "session": _session_brief(session),
    }
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": "SONG CONTEXT:\n" + json.dumps(song_context, separators=(",", ":"), ensure_ascii=False)},
        *turns[:-1],
        {
            "role": "user",
            "content": f"{turns[-1]['content']}\n\nCURRENT TABLE STATE:\n{json.dumps(state, separators=(',', ':'))}",
        },
    ]
    raw = llm(messages)
    data = try_repair_json(raw)
    if data is None:
        retry = messages + [
            {"role": "assistant", "content": raw[:4000]},
            {"role": "user", "content": 'That was not valid JSON. Reply with ONLY {"reply": "...", "ops": [...]}.'},
        ]
        data = try_repair_json(llm(retry)) or {}
    reply = str(data.get("reply") or "").strip() or "Sorry, I couldn't work that out. Could you rephrase?"
    ops = data.get("ops") if isinstance(data.get("ops"), list) else []
    return reply[:1200], ops
