"""Creative desk: the artist's own nudges on top of Kord's plan.

The upload page has a small mastering desk with seven channels, each an integer
from -5 to +5 (0 = leave it to Kord). The desk position that gets applied is:

    effective = STYLE_DESK_START[style] + artist tweaks   (clamped to -5..+5)

The style's starting position applies for every tier: choosing a style moves the
desk. Only EARLY_ACCESS and ADMIN can add their own tweaks; the API drops tweaks
for ROLLOUT (see api/main.py create_job).

The effective desk nudges the SafeDSPParams the safety layer produced; then the
generic safety ranges and the style envelope (style_profiles.apply_style_profile)
are applied again, so no desk setting can take the master outside the limits the
safety layer owns.
"""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Optional

import numpy as np
from pydantic import BaseModel, Field, ValidationError

from mastering.dsp_params import SafeDSPParams
from mastering.style_profiles import StyleProfile

DESK_MIN = -5
DESK_MAX = 5


class CreativeControls(BaseModel):
    """Seven desk channels. Field names match frontend/lib/desk.ts."""

    low: int = Field(0, ge=DESK_MIN, le=DESK_MAX)
    mids: int = Field(0, ge=DESK_MIN, le=DESK_MAX)
    air: int = Field(0, ge=DESK_MIN, le=DESK_MAX)
    punch: int = Field(0, ge=DESK_MIN, le=DESK_MAX)
    warmth: int = Field(0, ge=DESK_MIN, le=DESK_MAX)
    width: int = Field(0, ge=DESK_MIN, le=DESK_MAX)
    loudness: int = Field(0, ge=DESK_MIN, le=DESK_MAX)

    model_config = {"extra": "forbid"}

    def is_neutral(self) -> bool:
        return all(v == 0 for v in self.model_dump().values())


# Where each style puts the desk before the artist touches it. Mirrors
# frontend/lib/desk.ts (STYLE_DESK_START); keep the two in sync.
STYLE_DESK_START: dict[str, dict[str, int]] = {
    "auto": {},
    "indian_classical": {"loudness": -3, "punch": -1, "warmth": -1, "width": -1},
    "devotional": {"warmth": 2, "air": -1},
    "film_melodic": {"mids": 2, "air": 1},
    "bollywood_dance": {"loudness": 4, "low": 2, "punch": 2},
    "fusion_indie": {"punch": 1},
}


def effective_desk(style_key: str, tweaks: Optional[dict[str, int]] = None) -> CreativeControls:
    """Style start + artist tweaks, each channel clamped to the desk range."""
    start = STYLE_DESK_START.get(style_key, {})
    tw = tweaks or {}
    fields = CreativeControls.model_fields
    return CreativeControls(
        **{k: int(np.clip(start.get(k, 0) + int(tw.get(k, 0)), DESK_MIN, DESK_MAX)) for k in fields}
    )


class CreativeParseError(ValueError):
    pass


def parse_creative(raw: Optional[str]) -> Optional[CreativeControls]:
    """Parse the `creative` form field. Empty -> None; invalid -> CreativeParseError."""
    if raw is None or not raw.strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CreativeParseError("creative must be a JSON object") from exc
    if not isinstance(data, dict):
        raise CreativeParseError("creative must be a JSON object")
    try:
        return CreativeControls(**data)
    except ValidationError as exc:
        raise CreativeParseError(
            f"creative values must be whole numbers from {DESK_MIN} to {DESK_MAX} for: "
            "low, mids, air, punch, warmth, width, loudness"
        ) from exc


def _clip(v: float, lo: float, hi: float) -> float:
    return float(np.clip(v, lo, hi))


# Generic safety ranges, the same ones intent_to_safe_params clamps to.
_GENERIC = {
    "low_shelf_db": (-3.0, 3.0),
    "mid_peak_db": (-4.0, 4.0),
    "high_shelf_db": (-4.0, 4.0),
    "saturation_amount": (0.0, 0.38),
    "stereo_width_factor": (0.94, 1.14),
    "transient_blend": (0.2, 0.88),
    "transient_restore": (0.0, 0.5),
    "target_lufs": (-18.0, -7.0),
}


def apply_creative(params: SafeDSPParams, controls: Optional[CreativeControls], profile: StyleProfile) -> SafeDSPParams:
    """Nudge params by the desk values. The caller re-applies the style envelope afterwards."""
    if controls is None or controls.is_neutral():
        return params
    c = controls
    if profile.lufs_range is not None:
        lo, hi = profile.lufs_range
        target = lo + (hi - lo) * (c.loudness - DESK_MIN) / (DESK_MAX - DESK_MIN) if c.loudness != 0 else params.target_lufs
    else:
        target = params.target_lufs + c.loudness * 0.4
    nudged = {
        "low_shelf_db": params.low_shelf_db + c.low * 0.3,
        "mid_peak_db": params.mid_peak_db + c.mids * 0.3,
        "high_shelf_db": params.high_shelf_db + c.air * 0.3,
        "transient_blend": params.transient_blend + c.punch * 0.03,
        "transient_restore": params.transient_restore + c.punch * 0.02,
        "saturation_amount": params.saturation_amount + c.warmth * 0.03,
        "stereo_width_factor": params.stereo_width_factor + c.width * 0.012,
        "target_lufs": target,
    }
    bounded = {k: _clip(v, *_GENERIC[k]) for k, v in nudged.items()}
    return replace(params, **bounded)
