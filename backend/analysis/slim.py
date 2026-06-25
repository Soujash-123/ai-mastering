"""Minimal analysis payload for the mastering DSP chain."""

from __future__ import annotations

from typing import Any


def slim_analysis_for_dsp(
    analysis: dict[str, Any],
    llm_section_modifiers: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Keep only fields required by build_mastering_plan / section automation."""
    return {
        "sectional_analysis": list(analysis.get("sectional_analysis") or []),
        "llm_section_modifiers": llm_section_modifiers
        if llm_section_modifiers is not None
        else list(analysis.get("llm_section_modifiers") or []),
    }
