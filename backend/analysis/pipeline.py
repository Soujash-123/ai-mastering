from __future__ import annotations

from typing import Any

import numpy as np
import soundfile as sf

from analysis.clap_embeddings import compute_clap_like_embedding
from analysis.essentia_optional import extract_essentia_descriptors
from analysis.events import detect_transition_events
from analysis.features import compute_global_summary, extract_frame_features
from analysis.sections import detect_sections, summarize_sectional_analysis
from analysis.temporal import build_temporal_analysis


def _to_stereo(data: np.ndarray) -> np.ndarray:
    y = data.T.astype(np.float32)
    if y.shape[0] > 2:
        y = y[:2]
    if y.shape[0] == 1:
        y = np.vstack([y[0], y[0]])
    return y


def _reference_comparison_data(global_summary: dict[str, Any], target_platform: str) -> dict[str, Any]:
    refs = {
        "spotify": {"target_lufs": -14.0, "true_peak_dbfs": -1.0},
        "apple_music": {"target_lufs": -16.0, "true_peak_dbfs": -1.0},
        "youtube": {"target_lufs": -14.0, "true_peak_dbfs": -1.0},
        "tidal": {"target_lufs": -14.0, "true_peak_dbfs": -1.0},
        "club": {"target_lufs": -9.5, "true_peak_dbfs": -0.8},
        "cinematic": {"target_lufs": -18.0, "true_peak_dbfs": -2.0},
    }
    ref = refs.get(target_platform.lower(), refs["spotify"])
    return {
        "target_profile": target_platform,
        "reference_targets": ref,
        "deviation_from_reference": {
            "lufs_delta": float(global_summary["lufs"] - ref["target_lufs"]),
            "true_peak_delta": float(global_summary["true_peak_dbfs"] - ref["true_peak_dbfs"]),
        },
    }


def run_multilayer_analysis(path: str, target_platform: str, user_intent: str, temporal_interval_sec: float = 1.0) -> dict[str, Any]:
    data, sr = sf.read(path, always_2d=True)
    stereo = _to_stereo(data)
    mono = np.mean(stereo, axis=0)

    frames = extract_frame_features(stereo, sr=sr, hop_length=512)
    global_summary = compute_global_summary(stereo, sr=sr, frames=frames)

    sections = detect_sections(global_summary["duration_sec"])
    sectional_analysis = summarize_sectional_analysis(
        frame_times=frames["times_sec"],
        frames=frames,
        sections=sections,
    )
    temporal_analysis = build_temporal_analysis(
        frame_times=frames["times_sec"],
        frames=frames,
        interval_sec=temporal_interval_sec,
    )
    transition_events = detect_transition_events(frame_times=frames["times_sec"], frames=frames)

    emotional_features = {
        "emotional_intensity_estimation": global_summary["emotional_intensity_estimation"],
        "immersion_depth_estimation": global_summary["immersion_depth_estimation"],
        "vocal_emotional_salience": float(np.mean(frames["vocal_presence"])),
        "sectional_emotional_arc": [
            {
                "section": s["section"],
                "emotional_intensity_estimation": s["emotional_intensity_estimation"],
            }
            for s in sectional_analysis
        ],
    }

    translation_features = {
        "mono_compatibility": global_summary["mono_compatibility"],
        "codec_vulnerability": global_summary["codec_vulnerability"],
        "phase_correlation": global_summary["phase_correlation"],
        "high_band_risk": float(np.mean(frames["brightness_index"]) + np.mean(frames["sibilance_risk"])),
        "low_end_translation_risk": float(np.mean(frames["sub_energy"]) * 0.6 + np.mean(frames["low_end_energy"]) * 0.4),
    }

    reference_comparison_data = _reference_comparison_data(global_summary, target_platform)
    essentia = extract_essentia_descriptors(mono, sr)
    clap = compute_clap_like_embedding(mono, sr)

    return {
        "global_summary": global_summary,
        "sectional_analysis": sectional_analysis,
        "temporal_analysis": temporal_analysis,
        "transition_events": transition_events,
        "emotional_features": emotional_features,
        "translation_features": translation_features,
        "reference_comparison_data": reference_comparison_data,
        "section_detection": {"sections": sections, "detector": "heuristic_v1"},
        "feature_extraction": {
            "temporal_interval_sec": temporal_interval_sec,
            "frame_hop_samples": 512,
            "descriptor_set": [
                "lufs",
                "true_peak",
                "crest_factor",
                "rms",
                "stereo_width",
                "phase_correlation",
                "spectral_centroid",
                "spectral_rolloff",
                "spectral_contrast",
                "transient_density",
                "punch_score",
                "low_end_energy",
                "sub_energy",
                "vocal_presence",
                "harshness_index",
                "warmth_index",
                "brightness_index",
                "sibilance_risk",
                "dynamic_range",
                "mono_compatibility",
                "codec_vulnerability",
                "emotional_intensity_estimation",
                "immersion_depth_estimation",
            ],
        },
        "essentia": essentia,
        "embedding": clap,
        "target_platform": target_platform,
        "user_intent": user_intent,
        # Legacy convenience keys used in downstream code.
        "integrated_lufs": global_summary["lufs"],
        "true_peak_dbfs": global_summary["true_peak_dbfs"],
        "duration_sec": global_summary["duration_sec"],
    }

