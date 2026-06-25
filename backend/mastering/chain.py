"""Adaptive mastering chain: float32 working buffers, block oversampling, gain staging."""

from __future__ import annotations

import gc
from typing import Any

import numpy as np
import soundfile as sf
from mastering.dsp_params import MasteringDSPPlan, SafeDSPParams
from mastering.dsp_utils import as_f32, gain_stage
from mastering.dynamic_eq import intelligent_dynamic_eq
from mastering.exciter import psychoacoustic_exciter
from mastering.lowend import stabilize_low_end
from mastering.loudness import gradual_loudness_normalize, perceptual_loudness_optimize
from mastering.limiter import mastering_limiter, soft_clip_oversampled
from mastering.multiband import multiband_compress
from mastering.resonance import dynamic_resonance_suppress
from mastering.rbj import high_shelf_sos, low_shelf_sos, peaking_sos, sos_chain_filter
from mastering.saturation import analog_harmonic_engine
from mastering.section_automation import build_mastering_plan
from mastering.stereo import immersive_stereo
from mastering.transients import transient_reconstruct
from utils.memory import memory_step


def _to_stereo(y: np.ndarray) -> np.ndarray:
    if y.ndim == 1:
        return np.stack([y, y], axis=0).astype(np.float32)
    return y.astype(np.float32)


def render_master(stereo: np.ndarray, sr: int, plan: MasteringDSPPlan) -> np.ndarray:
    """
    Loudness architecture (gradual crest reduction, no emergency limiting):
    tone → resonance → low-end stabilize → dynamics → gentle harmonics → stereo
    → light density → soft clip → limiter → transient restore → gradual LUFS
    """
    p = plan.params
    sr_f = float(sr)
    x = as_f32(stereo)
    scratch = np.empty_like(x)

    with memory_step("mastering.tonal_eq"):
        sos: list[np.ndarray] = [
            low_shelf_sos(90.0, p.low_shelf_db, sr_f),
            peaking_sos(2500.0, p.mid_peak_db, sr_f, q=1.0),
            high_shelf_sos(9500.0, p.high_shelf_db, sr_f),
        ]
        x = np.stack(
            [sos_chain_filter(x[0], sos, zero_phase=True), sos_chain_filter(x[1], sos, zero_phase=True)],
            axis=0,
        ).astype(np.float32)
        x = gain_stage(x, peak_ceiling=0.94, inplace=True)

    with memory_step("mastering.dynamic_eq_resonance"):
        x = intelligent_dynamic_eq(x, sr, p).astype(np.float32, copy=False)
        x = dynamic_resonance_suppress(x, sr, p.resonance_suppression).astype(np.float32, copy=False)
        x = gain_stage(x, peak_ceiling=0.93, inplace=True)

    with memory_step("mastering.low_end"):
        x = stabilize_low_end(x, sr, plan).astype(np.float32, copy=False)
        x = gain_stage(x, peak_ceiling=0.92, rms_ceiling=0.28, inplace=True)

    with memory_step("mastering.multiband_compress"):
        np.copyto(scratch, x)
        compressed = multiband_compress(x, sr, plan)
        blend = float(p.transient_blend)
        x[:] = blend * scratch + (1.0 - blend) * compressed.astype(np.float32, copy=False)
        del compressed
        plan.compression_curve = None
        gc.collect()
        x = gain_stage(x, peak_ceiling=0.91, min_crest_db=8.0, inplace=True)

    with memory_step("mastering.perceptual_density"):
        x = perceptual_loudness_optimize(x, sr, p).astype(np.float32, copy=False)
        x = gain_stage(x, peak_ceiling=0.90, inplace=True)

    with memory_step("mastering.harmonic_engine"):
        x = analog_harmonic_engine(x, sr, plan).astype(np.float32, copy=False)
        x = gain_stage(x, peak_ceiling=0.88, inplace=True)

    with memory_step("mastering.exciter"):
        x = psychoacoustic_exciter(x, sr, plan).astype(np.float32, copy=False)
        x = gain_stage(x, peak_ceiling=0.87, inplace=True)

    with memory_step("mastering.stereo"):
        x = immersive_stereo(x, sr, plan).astype(np.float32, copy=False)
        x = gain_stage(x, peak_ceiling=0.86, inplace=True)

    with memory_step("mastering.soft_clip"):
        np.copyto(scratch, x)
        x = soft_clip_oversampled(x, sr, p).astype(np.float32, copy=False)
        x = gain_stage(x, peak_ceiling=0.85, inplace=True)

    with memory_step("mastering.limiter"):
        mastering_limiter(x, sr, p, out=x)
        x = gain_stage(x, peak_ceiling=0.84, inplace=True)
        gc.collect()

    with memory_step("mastering.transient_reconstruct"):
        x = transient_reconstruct(scratch, x, sr, p.transient_restore).astype(np.float32, copy=False)
        x = gain_stage(x, peak_ceiling=0.83, inplace=True)

    with memory_step("mastering.loudness_normalize"):
        x = gradual_loudness_normalize(x, sr, p).astype(np.float32, copy=False)
        x = gain_stage(
            x,
            peak_ceiling=float(10 ** (p.true_peak_ceiling_db / 20.0)) * 0.98,
            inplace=True,
        )

    return as_f32(x)


def master_file(
    input_path: str,
    output_path: str,
    params: SafeDSPParams,
    analysis: dict[str, Any] | None = None,
) -> None:
    with memory_step("mastering.load_audio"):
        y, sr = sf.read(input_path, always_2d=True, dtype="float32")
        y = y.T.astype(np.float32)
        if y.shape[0] > 2:
            y = y[:2]
        stereo = _to_stereo(y[0]) if y.shape[0] == 1 else y

    with memory_step("mastering.build_plan"):
        duration = float(stereo.shape[1] / sr)
        plan = build_mastering_plan(params, analysis, duration, sr)
        gc.collect()

    out = render_master(stereo, sr, plan)
    del stereo, plan
    gc.collect()
    with memory_step("mastering.write_output"):
        sf.write(output_path, out.T, sr, subtype="PCM_24")
