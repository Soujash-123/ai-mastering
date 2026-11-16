"""Style-aware safety envelopes (Indian music first).

The LLM may *describe* a style, but the deterministic safety layer *enforces*
how each style is treated: loudness window, compression ceilings, slower time
constants for drone-based music, transient protection for tabla / mridangam /
dhol, and harshness control for bright playback vocals.

Each profile only narrows what `intent_to_safe_params` already produced (caps
and floors). "auto" is a no-op so existing behaviour is unchanged.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Optional

from mastering.dsp_params import SafeDSPParams

DEFAULT_STYLE_FAMILY = "auto"


@dataclass(frozen=True)
class StyleProfile:
    key: str
    label: str
    llm_guidance: str
    # Loudness window (LUFS). None = keep the generic -18..-7 clamp.
    lufs_range: Optional[tuple[float, float]] = None
    # Ceilings (None = no extra cap).
    max_ratio: Optional[float] = None
    max_limiter_drive: Optional[float] = None
    max_clip_drive: Optional[float] = None
    max_saturation: Optional[float] = None
    max_exciter: Optional[float] = None
    max_density: Optional[float] = None
    max_width: Optional[float] = None
    # Floors (None = no extra floor).
    min_transient_blend: Optional[float] = None
    min_transient_restore: Optional[float] = None
    min_attack_ms: Optional[float] = None
    min_release_ms: Optional[float] = None
    min_release_high_ms: Optional[float] = None
    min_resonance: Optional[float] = None
    min_dynamic_eq: Optional[float] = None
    min_sub_mono: Optional[float] = None


STYLE_PROFILES: dict[str, StyleProfile] = {
    p.key: p
    for p in (
        StyleProfile(
            key="auto",
            label="Auto (general)",
            llm_guidance="",
        ),
        StyleProfile(
            key="indian_classical",
            label="Hindustani / Carnatic classical",
            llm_guidance=(
                "Indian classical (Hindustani/Carnatic). Preserve wide dynamics and the quiet alaap; "
                "never pump the tanpura/drone; keep tabla/mridangam attacks and vocal gamakas natural; "
                "minimal colouration; loudness is secondary to dynamics."
            ),
            lufs_range=(-16.0, -14.0),
            max_ratio=1.5,
            max_limiter_drive=0.28,
            max_clip_drive=0.08,
            max_saturation=0.12,
            max_exciter=0.10,
            max_density=0.05,
            max_width=1.06,
            min_transient_blend=0.65,
            min_transient_restore=0.25,
            min_attack_ms=25.0,
            min_release_ms=220.0,
            min_release_high_ms=140.0,
            min_resonance=0.20,
        ),
        StyleProfile(
            key="devotional",
            label="Devotional / bhajan / kirtan",
            llm_guidance=(
                "Devotional (bhajan/kirtan/qawwali-style). Warm, natural, intimate; keep the room and "
                "harmonium body; gentle control only; avoid hype, brittle highs and over-compression."
            ),
            lufs_range=(-15.0, -13.0),
            max_ratio=2.0,
            max_limiter_drive=0.35,
            max_clip_drive=0.12,
            max_saturation=0.20,
            max_exciter=0.14,
            max_density=0.10,
            max_width=1.08,
            min_transient_blend=0.55,
            min_transient_restore=0.15,
            min_attack_ms=18.0,
            min_release_ms=160.0,
            min_release_high_ms=100.0,
            min_resonance=0.20,
        ),
        StyleProfile(
            key="film_melodic",
            label="Film / playback song",
            llm_guidance=(
                "Indian film/playback song (melodic). Vocal is the hero: clear, forward, smooth on high "
                "notes; tame 2-5 kHz harshness on bright female vocals; polished but not crushed."
            ),
            lufs_range=(-12.0, -10.0),
            max_ratio=3.0,
            max_limiter_drive=0.50,
            max_clip_drive=0.18,
            max_saturation=0.30,
            max_exciter=0.20,
            max_density=0.18,
            max_width=1.12,
            min_transient_blend=0.45,
            min_transient_restore=0.10,
            min_attack_ms=10.0,
            min_release_ms=90.0,
            min_release_high_ms=60.0,
            min_resonance=0.35,
            min_dynamic_eq=0.40,
        ),
        StyleProfile(
            key="bollywood_dance",
            label="Bollywood / Punjabi / dance",
            llm_guidance=(
                "Bollywood/Punjabi/dance. Energetic and competitive loudness; dhol and kick must punch "
                "through; tight mono low end separated from bass; vocals stay clear on top of the beat."
            ),
            lufs_range=(-10.0, -8.0),
            max_limiter_drive=0.55,
            max_clip_drive=0.22,
            max_width=1.14,
            min_transient_blend=0.50,
            min_transient_restore=0.25,
            min_attack_ms=8.0,
            min_release_ms=60.0,
            min_resonance=0.30,
            min_sub_mono=0.90,
        ),
        StyleProfile(
            key="fusion_indie",
            label="Fusion / indie",
            llm_guidance=(
                "Indian fusion/indie. Mix of acoustic Indian instruments and modern production; keep "
                "percussion attacks and instrument realism while giving a modern, balanced finish."
            ),
            lufs_range=(-13.0, -10.0),
            max_ratio=2.5,
            max_limiter_drive=0.45,
            max_clip_drive=0.16,
            max_saturation=0.30,
            max_exciter=0.22,
            max_density=0.15,
            max_width=1.14,
            min_transient_blend=0.55,
            min_transient_restore=0.20,
            min_attack_ms=15.0,
            min_release_ms=120.0,
            min_release_high_ms=80.0,
            min_resonance=0.25,
        ),
    )
}

# Lossy sources (phone .m4a / .mp3 / WhatsApp .opus) already carry codec
# artefacts in the top octave; brightening them makes the artefacts audible.
_LOSSY_MAX_EXCITER = 0.12
_LOSSY_MAX_HARMONIC_HIGH = 0.15
_LOSSY_MAX_HIGH_SHELF_DB = 1.5


def normalize_style_family(value: Optional[str]) -> str:
    """Return a valid profile key. Empty -> "auto"; unknown -> ValueError."""
    key = (value or "").strip().lower() or DEFAULT_STYLE_FAMILY
    if key not in STYLE_PROFILES:
        raise ValueError(
            f"Unknown style_family '{value}'. Expected one of: {', '.join(STYLE_PROFILES)}"
        )
    return key


def get_style_profile(key: Optional[str]) -> StyleProfile:
    try:
        return STYLE_PROFILES[normalize_style_family(key)]
    except ValueError:
        return STYLE_PROFILES[DEFAULT_STYLE_FAMILY]


def clamp_target_lufs(target_lufs: float, profile: StyleProfile) -> float:
    if profile.lufs_range is None:
        return float(target_lufs)
    lo, hi = profile.lufs_range
    return float(min(max(target_lufs, lo), hi))


def _cap(value: float, ceiling: Optional[float]) -> float:
    return float(value) if ceiling is None else float(min(value, ceiling))


def _floor(value: float, floor: Optional[float]) -> float:
    return float(value) if floor is None else float(max(value, floor))


def apply_style_profile(
    params: SafeDSPParams,
    profile: StyleProfile,
    *,
    source_lossy: bool = False,
) -> SafeDSPParams:
    """Narrow already-safe DSP params to the style's envelope."""
    p = profile
    out = replace(
        params,
        target_lufs=clamp_target_lufs(params.target_lufs, p),
        low_ratio=_cap(params.low_ratio, p.max_ratio),
        mid_ratio=_cap(params.mid_ratio, p.max_ratio),
        high_ratio=_cap(params.high_ratio, p.max_ratio),
        limiter_drive=_cap(params.limiter_drive, p.max_limiter_drive),
        clip_drive=_cap(params.clip_drive, p.max_clip_drive),
        saturation_amount=_cap(params.saturation_amount, p.max_saturation),
        harmonic_low=_cap(params.harmonic_low, p.max_saturation),
        harmonic_mid=_cap(params.harmonic_mid, p.max_saturation),
        harmonic_high=_cap(params.harmonic_high, p.max_saturation),
        exciter_amount=_cap(params.exciter_amount, p.max_exciter),
        perceptual_density=_cap(params.perceptual_density, p.max_density),
        stereo_width_factor=_cap(params.stereo_width_factor, p.max_width),
        width_air=_cap(params.width_air, p.max_width),
        width_body=_cap(params.width_body, p.max_width),
        transient_blend=_floor(params.transient_blend, p.min_transient_blend),
        transient_restore=_floor(params.transient_restore, p.min_transient_restore),
        mb_attack_ms=_floor(params.mb_attack_ms, p.min_attack_ms),
        mb_release_ms=_floor(params.mb_release_ms, p.min_release_ms),
        mb_release_high_ms=_floor(params.mb_release_high_ms, p.min_release_high_ms),
        resonance_suppression=_floor(params.resonance_suppression, p.min_resonance),
        dynamic_eq_strength=_floor(params.dynamic_eq_strength, p.min_dynamic_eq),
        sub_mono_strength=_floor(params.sub_mono_strength, p.min_sub_mono),
    )
    if source_lossy:
        out = replace(
            out,
            exciter_amount=min(out.exciter_amount, _LOSSY_MAX_EXCITER),
            harmonic_high=min(out.harmonic_high, _LOSSY_MAX_HARMONIC_HIGH),
            high_shelf_db=min(out.high_shelf_db, _LOSSY_MAX_HIGH_SHELF_DB),
        )
    return out
