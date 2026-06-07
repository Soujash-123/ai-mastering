"""Premium adaptive mastering chain: float64 DSP, gain staging, distortion-safe loudness."""

from __future__ import annotations

from typing import Any

import numpy as np
import soundfile as sf

from mastering.dsp_params import MasteringDSPPlan, SafeDSPParams
from mastering.dsp_utils import as_f32, as_f64, gain_stage
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


def _to_stereo(y: np.ndarray) -> np.ndarray:
    if y.ndim == 1:
        return np.stack([y, y], axis=0).astype(np.float32)
    return y.astype(np.float32)


def _dither_export(y: np.ndarray) -> np.ndarray:
    d = (np.random.randn(*y.shape) + np.random.randn(*y.shape)) * (1.0 / (2**16))
    return (y + d * 0.25).astype(np.float32)


def render_master(stereo: np.ndarray, sr: int, plan: MasteringDSPPlan) -> np.ndarray:
    """
    Loudness architecture (gradual crest reduction, no emergency limiting):
    tone → resonance → low-end stabilize → dynamics → gentle harmonics → stereo
    → light density → soft clip → limiter → transient restore → gradual LUFS
    """
    p = plan.params
    sr_f = float(sr)
    x = as_f64(stereo)

    # 1. Tonal EQ (zero-phase mastering mode)
    sos: list[np.ndarray] = [
        low_shelf_sos(90.0, p.low_shelf_db, sr_f),
        peaking_sos(2500.0, p.mid_peak_db, sr_f, q=1.0),
        high_shelf_sos(9500.0, p.high_shelf_db, sr_f),
    ]
    x = np.stack(
        [sos_chain_filter(x[0], sos, zero_phase=True), sos_chain_filter(x[1], sos, zero_phase=True)],
        axis=0,
    )
    x = gain_stage(x, peak_ceiling=0.94)

    # 2. Dynamic EQ + resonance
    x = intelligent_dynamic_eq(x, sr, p).astype(np.float64)
    x = dynamic_resonance_suppress(x, sr, p.resonance_suppression).astype(np.float64)
    x = gain_stage(x, peak_ceiling=0.93)

    # 3. Low-end stabilization (before loudness)
    x = stabilize_low_end(x, sr, plan)
    x = gain_stage(x, peak_ceiling=0.92, rms_ceiling=0.28)

    # 4. Multiband compression (musical glue)
    dry_pre_dyn = x.copy()
    compressed = multiband_compress(x, sr, plan)
    x = p.transient_blend * dry_pre_dyn + (1.0 - p.transient_blend) * compressed
    x = gain_stage(x, peak_ceiling=0.91, min_crest_db=8.0)

    # 5. Early gentle perceptual density (spectral only)
    x = perceptual_loudness_optimize(x, sr, p)
    x = gain_stage(x, peak_ceiling=0.90)

    # 6. Multi-band harmonic engine (oversampled, subs protected)
    x = analog_harmonic_engine(x, sr, plan)
    x = gain_stage(x, peak_ceiling=0.88)

    # 7. Light psychoacoustic exciter
    x = psychoacoustic_exciter(x, sr, plan).astype(np.float64)
    x = gain_stage(x, peak_ceiling=0.87)

    # 8. Frequency-dependent stereo
    x = immersive_stereo(x, sr, plan).astype(np.float64)
    x = gain_stage(x, peak_ceiling=0.86)

    # 9. Soft clip (8x OS) — gradual crest reduction
    pre_limit = x.copy()
    x = soft_clip_oversampled(x, sr, p)
    x = gain_stage(x, peak_ceiling=0.85)

    # 10. Mastering limiter (transparent, ISP-safe)
    limited = mastering_limiter(x, sr, p)
    x = gain_stage(limited, peak_ceiling=0.84)

    # 11. Transient reconstruction (punch after limiting)
    x = transient_reconstruct(pre_limit, x, sr, p.transient_restore).astype(np.float64)
    x = gain_stage(x, peak_ceiling=0.83)

    # 12. Gradual LUFS normalization (small steps + limiter between)
    x = gradual_loudness_normalize(x, sr, p)
    x = gain_stage(x, peak_ceiling=float(10 ** (p.true_peak_ceiling_db / 20.0)) * 0.98)

    return as_f32(x)


def master_file(
    input_path: str,
    output_path: str,
    params: SafeDSPParams,
    analysis: dict[str, Any] | None = None,
) -> None:
    y, sr = sf.read(input_path, always_2d=True)
    y = y.T.astype(np.float32)
    if y.shape[0] > 2:
        y = y[:2]
    stereo = _to_stereo(y[0]) if y.shape[0] == 1 else y

    duration = float(stereo.shape[1] / sr)
    plan = build_mastering_plan(params, analysis, duration, sr)
    out = render_master(stereo, sr, plan)
    out = _dither_export(out)
    sf.write(output_path, out.T, sr, subtype="PCM_24")
