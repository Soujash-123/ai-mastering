"""Deep audio feature extraction driving mastering decisions."""

from __future__ import annotations

from typing import Any

from analysis.pipeline import run_multilayer_analysis
from utils.json_safe import to_json_safe


def analyze_audio_file(path: str, target_platform: str = "Spotify", user_intent: str = "") -> dict[str, Any]:
    analysis: dict[str, Any] = run_multilayer_analysis(
        path=path,
        target_platform=target_platform,
        user_intent=user_intent,
        temporal_interval_sec=1.0,
    )
    return to_json_safe(analysis)
