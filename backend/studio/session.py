"""Studio Session: the single document shared by the browser engine, the
Mastering Copilot and the server renderer.

Every numeric field is clamped to MODULE_SPEC / REGION_SPEC bounds on the way
in (client autosave, copilot ops), so nothing downstream ever sees an
out-of-range value. The spec is also served to the frontend, which renders its
knobs from it — one definition of every control.
"""

from __future__ import annotations

import copy
import json
import math
import uuid
from pathlib import Path
from typing import Any, Optional

SESSION_FILENAME = "studio_session.json"
SESSION_VERSION = 1
MAX_REGIONS = 32

# module -> param -> spec. "default" values are neutral on top of the AI master
# (EQ flat, comp/warmth bypassed, width 100%, output 0 dB at a -1 dBTP ceiling).
MODULE_SPEC: dict[str, dict[str, Any]] = {
    "eq": {
        "label": "Tone EQ",
        "default_enabled": True,
        "params": {
            "bass_db": {"label": "Bass", "min": -6.0, "max": 6.0, "step": 0.1, "default": 0.0, "unit": "dB", "hint": "Low shelf @ 100 Hz"},
            "mud_db": {"label": "Mud", "min": -6.0, "max": 6.0, "step": 0.1, "default": 0.0, "unit": "dB", "hint": "Body / boxiness @ 300 Hz"},
            "presence_db": {"label": "Presence", "min": -6.0, "max": 6.0, "step": 0.1, "default": 0.0, "unit": "dB", "hint": "Vocal clarity @ 3 kHz"},
            "air_db": {"label": "Air", "min": -6.0, "max": 6.0, "step": 0.1, "default": 0.0, "unit": "dB", "hint": "High shelf @ 10 kHz"},
        },
    },
    "comp": {
        "label": "Glue Compressor",
        "default_enabled": False,
        "params": {
            "amount": {"label": "Amount", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.3, "unit": "%", "hint": "How hard it glues (sets threshold)"},
            "ratio": {"label": "Ratio", "min": 1.0, "max": 6.0, "step": 0.1, "default": 2.0, "unit": ":1", "hint": "Compression ratio"},
            "attack_ms": {"label": "Attack", "min": 1.0, "max": 100.0, "step": 1.0, "default": 20.0, "unit": "ms", "hint": "Slower keeps drum hits punchy"},
            "release_ms": {"label": "Release", "min": 30.0, "max": 600.0, "step": 5.0, "default": 200.0, "unit": "ms", "hint": "Slower avoids pumping"},
            "mix": {"label": "Mix", "min": 0.0, "max": 1.0, "step": 0.01, "default": 1.0, "unit": "%", "hint": "Parallel blend"},
        },
    },
    "warmth": {
        "label": "Warmth",
        "default_enabled": False,
        "params": {
            "drive": {"label": "Drive", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.3, "unit": "%", "hint": "Analog-style saturation"},
            "mix": {"label": "Mix", "min": 0.0, "max": 1.0, "step": 0.01, "default": 0.5, "unit": "%", "hint": "Blend with the clean signal"},
        },
    },
    "width": {
        "label": "Stereo Width",
        "default_enabled": True,
        "params": {
            "width": {"label": "Width", "min": 0.5, "max": 1.5, "step": 0.01, "default": 1.0, "unit": "%", "hint": "Narrow ← 100% → wide"},
            "bass_mono_hz": {"label": "Bass Mono", "min": 0.0, "max": 200.0, "step": 5.0, "default": 0.0, "unit": "Hz", "hint": "Mono below this frequency (0 = off)"},
        },
    },
    "output": {
        "label": "Loudness",
        "default_enabled": True,
        "params": {
            "gain_db": {"label": "Gain", "min": -6.0, "max": 6.0, "step": 0.1, "default": 0.0, "unit": "dB", "hint": "Drive into the limiter (louder)"},
            "ceiling_db": {"label": "Ceiling", "min": -3.0, "max": -0.3, "step": 0.1, "default": -1.0, "unit": "dBTP", "hint": "Maximum peak level"},
        },
    },
}

REGION_SPEC: dict[str, dict[str, Any]] = {
    "gain_db": {"label": "Loudness", "min": -6.0, "max": 6.0, "step": 0.1, "default": 0.0, "unit": "dB"},
    "bass_db": {"label": "Bass", "min": -4.0, "max": 4.0, "step": 0.1, "default": 0.0, "unit": "dB"},
    "air_db": {"label": "Air", "min": -4.0, "max": 4.0, "step": 0.1, "default": 0.0, "unit": "dB"},
    "fade_ms": {"label": "Fade", "min": 10.0, "max": 2000.0, "step": 10.0, "default": 250.0, "unit": "ms"},
}
MIN_REGION_SEC = 0.25

# Fixed filter design shared with frontend/lib/studio/engine.ts.
DSP_CONSTANTS: dict[str, float] = {
    "eq_bass_hz": 100.0,
    "eq_mud_hz": 300.0,
    "eq_mud_q": 1.0,
    "eq_presence_hz": 3000.0,
    "eq_presence_q": 0.9,
    "eq_air_hz": 10000.0,
    "region_bass_hz": 120.0,
    "region_air_hz": 10000.0,
    "comp_knee_db": 6.0,
    "limiter_release_ms": 120.0,
}

# Presets: partial module settings layered over the defaults.
PRESETS: dict[str, dict[str, Any]] = {
    "ai_master": {"label": "AI Master", "modules": {}},
    "warmer": {
        "label": "Warmer",
        "modules": {
            "eq": {"enabled": True, "bass_db": 1.5, "air_db": -1.0},
            "warmth": {"enabled": True, "drive": 0.35, "mix": 0.5},
        },
    },
    "brighter": {
        "label": "Brighter",
        "modules": {"eq": {"enabled": True, "presence_db": 1.0, "air_db": 2.0}},
    },
    "louder": {
        "label": "Louder",
        "modules": {
            "comp": {"enabled": True, "amount": 0.35, "ratio": 2.0, "attack_ms": 25.0, "release_ms": 180.0, "mix": 0.8},
            "output": {"enabled": True, "gain_db": 2.5, "ceiling_db": -1.0},
        },
    },
    "vocal_forward": {
        "label": "Vocal Forward",
        "modules": {"eq": {"enabled": True, "mud_db": -1.5, "presence_db": 2.0}},
    },
    "classical_gentle": {
        "label": "Classical Gentle",
        "modules": {
            "comp": {"enabled": True, "amount": 0.15, "ratio": 1.5, "attack_ms": 40.0, "release_ms": 400.0, "mix": 0.6},
            "output": {"enabled": True, "gain_db": 0.0, "ceiling_db": -1.0},
        },
    },
    "wide": {
        "label": "Wide & Open",
        "modules": {"width": {"enabled": True, "width": 1.25, "bass_mono_hz": 120.0}},
    },
}


def _clamp(value: Any, spec: dict[str, Any]) -> float:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return float(spec["default"])
    if not math.isfinite(v):
        return float(spec["default"])
    return float(min(max(v, spec["min"]), spec["max"]))


def default_modules() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for mod, mspec in MODULE_SPEC.items():
        out[mod] = {"enabled": bool(mspec["default_enabled"])}
        for key, pspec in mspec["params"].items():
            out[mod][key] = float(pspec["default"])
    return out


def default_session() -> dict[str, Any]:
    return {
        "version": SESSION_VERSION,
        "preset": "ai_master",
        "modules": default_modules(),
        "regions": [],
        "committed": False,
    }


def _normalize_region(raw: Any, duration_sec: Optional[float]) -> Optional[dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    try:
        start = float(raw.get("start_sec"))
        end = float(raw.get("end_sec"))
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(start) and math.isfinite(end)):
        return None
    if end < start:
        start, end = end, start
    start = max(0.0, start)
    if duration_sec is not None and duration_sec > 0:
        end = min(end, float(duration_sec))
    if end - start < MIN_REGION_SEC:
        return None
    region: dict[str, Any] = {
        "id": str(raw.get("id") or uuid.uuid4().hex[:10])[:32],
        "start_sec": round(start, 3),
        "end_sec": round(end, 3),
        "label": str(raw.get("label") or "")[:60],
    }
    for key, spec in REGION_SPEC.items():
        region[key] = _clamp(raw.get(key, spec["default"]), spec)
    return region


def normalize_session(raw: Any, duration_sec: Optional[float] = None) -> dict[str, Any]:
    """Coerce any client/LLM-provided session into a valid, clamped session."""
    session = default_session()
    if not isinstance(raw, dict):
        return session
    preset = raw.get("preset")
    if isinstance(preset, str) and (preset in PRESETS or preset == "custom"):
        session["preset"] = preset
    mods = raw.get("modules") if isinstance(raw.get("modules"), dict) else {}
    for mod, mspec in MODULE_SPEC.items():
        src = mods.get(mod) if isinstance(mods.get(mod), dict) else {}
        if "enabled" in src:
            session["modules"][mod]["enabled"] = bool(src["enabled"])
        for key, pspec in mspec["params"].items():
            if key in src:
                session["modules"][mod][key] = _clamp(src[key], pspec)
    regions = []
    for r in (raw.get("regions") or [])[:MAX_REGIONS]:
        nr = _normalize_region(r, duration_sec)
        if nr:
            regions.append(nr)
    session["regions"] = sorted(regions, key=lambda r: r["start_sec"])
    session["committed"] = bool(raw.get("committed", False))
    return session


def session_is_neutral(session: dict[str, Any]) -> bool:
    return normalize_session({**session, "committed": False, "preset": "ai_master"}) == default_session()


def load_session(job_dir: Path, duration_sec: Optional[float] = None) -> dict[str, Any]:
    path = job_dir / SESSION_FILENAME
    try:
        with path.open("r", encoding="utf-8") as fh:
            return normalize_session(json.load(fh), duration_sec)
    except Exception:
        return default_session()


def save_session(job_dir: Path, session: dict[str, Any]) -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    tmp = job_dir / f".{SESSION_FILENAME}.tmp"
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(session, fh)
    tmp.replace(job_dir / SESSION_FILENAME)


def public_spec() -> dict[str, Any]:
    return {
        "modules": MODULE_SPEC,
        "region": REGION_SPEC,
        "presets": {k: {"label": v["label"], "modules": v["modules"]} for k, v in PRESETS.items()},
        "constants": DSP_CONSTANTS,
        "max_regions": MAX_REGIONS,
    }


# --- Copilot ops -------------------------------------------------------------

def _fmt_time(sec: float) -> str:
    sec = max(0.0, float(sec))
    return f"{int(sec // 60)}:{int(sec % 60):02d}"


def _fmt_val(spec: dict[str, Any], v: float) -> str:
    unit = spec.get("unit", "")
    if unit == "%":
        return f"{round(v * 100)}%"
    if unit == "dB" or unit == "dBTP":
        return f"{v:+.1f} {unit}" if unit == "dB" else f"{v:.1f} {unit}"
    return f"{v:g} {unit}".strip()


def apply_preset(session: dict[str, Any], preset_key: str) -> dict[str, Any]:
    out = copy.deepcopy(session)
    out["modules"] = default_modules()
    for mod, values in PRESETS[preset_key]["modules"].items():
        out["modules"][mod].update(values)
    out["preset"] = preset_key
    return out


def apply_ops(
    session: dict[str, Any],
    ops: list[Any],
    duration_sec: Optional[float] = None,
) -> tuple[dict[str, Any], list[str], list[dict[str, Any]]]:
    """Apply copilot ops. Returns (new session, change notes, remaster proposals).

    Invalid ops are skipped (with a note); values are clamped to the spec.
    """
    out = normalize_session(session, duration_sec)
    notes: list[str] = []
    proposals: list[dict[str, Any]] = []
    for raw in ops if isinstance(ops, list) else []:
        if not isinstance(raw, dict):
            continue
        op = str(raw.get("op", ""))
        if op == "set_param":
            mod, key = str(raw.get("module", "")), str(raw.get("param", ""))
            spec = MODULE_SPEC.get(mod, {}).get("params", {}).get(key)
            if spec is None:
                notes.append(f"Skipped unknown control {mod}.{key}")
                continue
            v = _clamp(raw.get("value"), spec)
            out["modules"][mod][key] = v
            if not out["modules"][mod]["enabled"]:
                out["modules"][mod]["enabled"] = True
            out["preset"] = "custom"
            notes.append(f"{MODULE_SPEC[mod]['label']} · {spec['label']} → {_fmt_val(spec, v)}")
        elif op == "toggle_module":
            mod = str(raw.get("module", ""))
            if mod not in MODULE_SPEC:
                notes.append(f"Skipped unknown module {mod}")
                continue
            enabled = bool(raw.get("enabled", True))
            out["modules"][mod]["enabled"] = enabled
            out["preset"] = "custom"
            notes.append(f"{MODULE_SPEC[mod]['label']} {'on' if enabled else 'off'}")
        elif op == "add_region":
            if len(out["regions"]) >= MAX_REGIONS:
                notes.append("Skipped region: region limit reached")
                continue
            region = _normalize_region({k: v for k, v in raw.items() if k != "id"}, duration_sec)
            if region is None:
                notes.append("Skipped region with invalid time range")
                continue
            out["regions"].append(region)
            out["regions"].sort(key=lambda r: r["start_sec"])
            notes.append(_region_note("Added", region))
        elif op == "update_region":
            rid = str(raw.get("id", ""))
            idx = next((i for i, r in enumerate(out["regions"]) if r["id"] == rid), None)
            if idx is None:
                notes.append(f"Skipped update: no region {rid}")
                continue
            merged = {**out["regions"][idx], **{k: v for k, v in raw.items() if k != "op"}}
            region = _normalize_region(merged, duration_sec)
            if region is None:
                notes.append("Skipped region update with invalid time range")
                continue
            out["regions"][idx] = region
            out["regions"].sort(key=lambda r: r["start_sec"])
            notes.append(_region_note("Updated", region))
        elif op == "remove_region":
            rid = str(raw.get("id", ""))
            before = len(out["regions"])
            out["regions"] = [r for r in out["regions"] if r["id"] != rid]
            if len(out["regions"]) < before:
                notes.append(f"Removed region {rid}")
        elif op == "apply_preset":
            key = str(raw.get("preset", ""))
            if key not in PRESETS:
                notes.append(f"Skipped unknown preset {key}")
                continue
            out = apply_preset(out, key)
            notes.append(f"Preset → {PRESETS[key]['label']}")
        elif op == "propose_remaster":
            overrides = raw.get("overrides")
            if isinstance(overrides, dict) and overrides:
                proposals.append(
                    {
                        "overrides": {str(k): v for k, v in overrides.items() if isinstance(v, (int, float))},
                        "reason": str(raw.get("reason") or "")[:300],
                    }
                )
        else:
            notes.append(f"Skipped unknown action '{op}'")
    out["committed"] = False if notes else out.get("committed", False)
    return out, notes, proposals


def _region_note(verb: str, r: dict[str, Any]) -> str:
    parts = []
    for key in ("gain_db", "bass_db", "air_db"):
        if abs(r[key]) >= 0.05:
            parts.append(f"{REGION_SPEC[key]['label'].lower()} {r[key]:+.1f} dB")
    label = f" ({r['label']})" if r.get("label") else ""
    detail = ", ".join(parts) if parts else "no change yet"
    return f"{verb} region {_fmt_time(r['start_sec'])}–{_fmt_time(r['end_sec'])}{label}: {detail}"
