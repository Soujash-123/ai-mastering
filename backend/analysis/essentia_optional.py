"""Optional Essentia-powered descriptors. Falls back silently if Essentia is not installed."""

from __future__ import annotations

from typing import Any


def extract_essentia_descriptors(mono_float: Any, sr: int) -> dict[str, Any]:
    try:
        import essentia.standard as es  # type: ignore

        audio = es.array(mono_float.astype("float32"))
        rhythm = es.RhythmDescriptors()(audio)
        danceability = float(rhythm[1]) if len(rhythm) > 1 else 0.0
        return {
            "essentia_available": True,
            "rhythm_danceability_proxy": danceability,
        }
    except Exception:
        return {"essentia_available": False}
