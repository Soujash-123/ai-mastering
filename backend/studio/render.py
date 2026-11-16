"""Server renderer for a Studio Session (the Commit path).

Mirrors the live Web Audio graph in frontend/lib/studio/engine.ts stage by
stage, using the same formulas so what the user previewed is what they get:

  regions (gain + bass/air shelves, 100 Hz control curves)
  → Tone EQ (RBJ biquads — same cookbook as Web Audio's BiquadFilterNode)
  → Glue compressor (same per-sample envelope recurrence as the AudioWorklet)
  → Warmth (tanh(k·x)/k, k = 1 + 2·drive)
  → Stereo width (M/S, optional bass-mono high-pass on the side channel)
  → Output gain → lookahead brickwall limiter (same algorithm as the
    AudioWorklet) → oversampled true-peak safety trim (server only).
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

from mastering.chain import playback_wav_path
from mastering.envelope import envelope_follower
from mastering.oversample import true_peak
from mastering.rbj import high_shelf_sos, low_shelf_sos, peaking_sos, sos_chain_filter
from studio.session import DSP_CONSTANTS, normalize_session

CONTROL_RATE_HZ = 100.0
_BLOCK = 512
C = DSP_CONSTANTS


# --- shared formulas (keep in sync with frontend/lib/studio/dsp.ts) ----------

def comp_threshold_db(amount: float) -> float:
    return -6.0 - 24.0 * float(amount)


def comp_makeup_db(amount: float, ratio: float) -> float:
    return -comp_threshold_db(amount) * (1.0 - 1.0 / float(ratio)) * 0.35


def warmth_k(drive: float) -> float:
    return 1.0 + 2.0 * float(drive)


def region_weight(t: np.ndarray, start: float, end: float, fade_sec: float) -> np.ndarray:
    """Trapezoid: ramps up over `fade` after start, down over `fade` before end."""
    fade = max(1e-3, min(fade_sec, (end - start) / 2.0))
    up = np.clip((t - start) / fade, 0.0, 1.0)
    down = np.clip((end - t) / fade, 0.0, 1.0)
    w = np.minimum(up, down)
    w[(t < start) | (t > end)] = 0.0
    return w


def region_curves(regions: list[dict[str, Any]], duration_sec: float, rate: float = CONTROL_RATE_HZ) -> dict[str, np.ndarray]:
    """dB curves sampled at `rate` Hz (gain/bass/air summed over regions)."""
    n = max(2, int(math.ceil(duration_sec * rate)) + 1)
    t = np.arange(n, dtype=np.float64) / rate
    out = {k: np.zeros(n, dtype=np.float64) for k in ("gain_db", "bass_db", "air_db")}
    for r in regions:
        w = region_weight(t, float(r["start_sec"]), float(r["end_sec"]), float(r["fade_ms"]) / 1000.0)
        for k in out:
            out[k] += w * float(r[k])
    return out


LIMITER_LOOKAHEAD_MS = 5.0
LIMITER_ISP_MARGIN_DB = 0.3  # sample-peak ceiling sits below the true-peak ceiling


def limiter_ceiling_lin(ceiling_db: float) -> float:
    return float(10.0 ** ((ceiling_db - LIMITER_ISP_MARGIN_DB) / 20.0))


def brickwall_limit(x: np.ndarray, sr: int, ceiling_db: float, release_ms: float) -> np.ndarray:
    """Lookahead brickwall limiter, output delayed-compensated (no latency in the file).

    gain_req[n] = min(1, ceil / peak[n]); sliding min over 2L then a length-L box
    average gives a smooth attack that is fully down before the peak arrives;
    release follows a one-pole recurrence on the gain reduction.
    """
    ceil = limiter_ceiling_lin(ceiling_db)
    L = max(1, int(LIMITER_LOOKAHEAD_MS * 1e-3 * sr))
    peak = np.maximum(np.abs(x[0]), np.abs(x[1]))
    req = np.minimum(1.0, ceil / np.maximum(peak, 1e-12))
    # Window covering [n-L, n+L] around each sample, then smooth over L.
    gmin = minimum_filter1d(req, size=2 * L + 1, mode="nearest")
    gbox = uniform_filter1d(gmin, size=L, mode="nearest")
    gbox = np.minimum(gbox, req)  # the box average must never exceed what a peak needs
    gr = 1.0 - gbox
    gr_rel = envelope_follower(gr, sr, attack_ms=0.1, release_ms=release_ms).astype(np.float64)
    gain = 1.0 - np.maximum(gr_rel, gr)
    return x * gain[None, :]


def highpass_sos(fc: float, sr: float, q: float = 1.0 / math.sqrt(2.0)) -> np.ndarray:
    w0 = 2 * math.pi * fc / sr
    cos_w0, sin_w0 = math.cos(w0), math.sin(w0)
    alpha = sin_w0 / (2 * q)
    b0 = (1 + cos_w0) / 2
    b1 = -(1 + cos_w0)
    a0, a1, a2 = 1 + alpha, -2 * cos_w0, 1 - alpha
    return np.array([[b0 / a0, b1 / a0, b0 / a0, 1.0, a1 / a0, a2 / a0]])


def comp_gain_db(env_db: np.ndarray, threshold_db: float, ratio: float, knee_db: float) -> np.ndarray:
    over = env_db - threshold_db
    slope = 1.0 / ratio - 1.0
    gr = np.where(
        2.0 * over < -knee_db,
        0.0,
        np.where(
            2.0 * np.abs(over) <= knee_db,
            slope * (over + knee_db / 2.0) ** 2 / (2.0 * knee_db),
            slope * over,
        ),
    )
    return gr


# --- stages ------------------------------------------------------------------

def _apply_regions(x: np.ndarray, sr: int, regions: list[dict[str, Any]]) -> np.ndarray:
    if not regions:
        return x
    n = x.shape[1]
    dur = n / sr
    curves = region_curves(regions, dur)
    t_ctl = np.arange(len(curves["gain_db"])) / CONTROL_RATE_HZ
    t = np.arange(n) / sr

    y = x
    # Time-varying shelves: coefficients per 512-sample block, filter state carried
    # across blocks; runs of identical settings are filtered in one call.
    for key, design, fc in (
        ("bass_db", low_shelf_sos, C["region_bass_hz"]),
        ("air_db", high_shelf_sos, C["region_air_hz"]),
    ):
        curve = curves[key]
        if not np.any(np.abs(curve) > 1e-4):
            continue
        block_t = (np.arange(0, n, _BLOCK) + _BLOCK / 2) / sr
        block_db = np.round(np.interp(block_t, t_ctl, curve), 2)
        out = np.empty_like(y)
        zi = np.zeros((2, 1, 2))
        i = 0
        nb = len(block_db)
        while i < nb:
            j = i
            while j + 1 < nb and block_db[j + 1] == block_db[i]:
                j += 1
            s0, s1 = i * _BLOCK, min(n, (j + 1) * _BLOCK)
            gain = float(block_db[i])
            if abs(gain) < 1e-4:
                out[:, s0:s1] = y[:, s0:s1]
            else:
                sos = design(fc, gain, sr)
                for ch in range(2):
                    out[ch, s0:s1], zi[ch] = signal.sosfilt(sos, y[ch, s0:s1], zi=zi[ch])
            i = j + 1
        y = out

    gain_db = np.interp(t, t_ctl, curves["gain_db"])
    if np.any(np.abs(gain_db) > 1e-4):
        y = y * (10.0 ** (gain_db / 20.0))[None, :]
    return y


def _apply_eq(x: np.ndarray, sr: int, eq: dict[str, Any]) -> np.ndarray:
    sos: list[np.ndarray] = []
    if abs(eq["bass_db"]) > 1e-4:
        sos.append(low_shelf_sos(C["eq_bass_hz"], eq["bass_db"], sr))
    if abs(eq["mud_db"]) > 1e-4:
        sos.append(peaking_sos(C["eq_mud_hz"], eq["mud_db"], sr, C["eq_mud_q"]))
    if abs(eq["presence_db"]) > 1e-4:
        sos.append(peaking_sos(C["eq_presence_hz"], eq["presence_db"], sr, C["eq_presence_q"]))
    if abs(eq["air_db"]) > 1e-4:
        sos.append(high_shelf_sos(C["eq_air_hz"], eq["air_db"], sr))
    if not sos:
        return x
    return np.stack([sos_chain_filter(x[ch], sos) for ch in range(2)])


def _apply_comp(x: np.ndarray, sr: int, comp: dict[str, Any]) -> np.ndarray:
    det = np.maximum(np.abs(x[0]), np.abs(x[1]))
    env = envelope_follower(det, sr, comp["attack_ms"], comp["release_ms"]).astype(np.float64)
    env_db = 20.0 * np.log10(env + 1e-9)
    thr = comp_threshold_db(comp["amount"])
    gr = comp_gain_db(env_db, thr, comp["ratio"], C["comp_knee_db"])
    g = 10.0 ** ((gr + comp_makeup_db(comp["amount"], comp["ratio"])) / 20.0)
    mix = comp["mix"]
    return x * ((1.0 - mix) + mix * g)[None, :]


def _apply_warmth(x: np.ndarray, warmth: dict[str, Any]) -> np.ndarray:
    k = warmth_k(warmth["drive"])
    wet = np.tanh(k * np.clip(x, -2.0, 2.0)) / k
    mix = warmth["mix"]
    return (1.0 - mix) * x + mix * wet


def _apply_width(x: np.ndarray, sr: int, width: dict[str, Any]) -> np.ndarray:
    mid = 0.5 * (x[0] + x[1])
    side = 0.5 * (x[0] - x[1])
    if width["bass_mono_hz"] > 0.0:
        side = signal.sosfilt(highpass_sos(width["bass_mono_hz"], sr), side)
    side = side * width["width"]
    return np.stack([mid + side, mid - side])


def render_session(stereo: np.ndarray, sr: int, session: dict[str, Any]) -> np.ndarray:
    """stereo: (2, n). Returns float32 (2, n) limited to the session ceiling."""
    s = normalize_session(session, stereo.shape[1] / sr)
    m = s["modules"]
    y = np.asarray(stereo, dtype=np.float64)
    y = _apply_regions(y, sr, s["regions"])
    if m["eq"]["enabled"]:
        y = _apply_eq(y, sr, m["eq"])
    if m["comp"]["enabled"]:
        y = _apply_comp(y, sr, m["comp"])
    if m["warmth"]["enabled"]:
        y = _apply_warmth(y, m["warmth"])
    if m["width"]["enabled"]:
        y = _apply_width(y, sr, m["width"])
    ceiling_db = -1.0
    if m["output"]["enabled"]:
        y = y * 10.0 ** (m["output"]["gain_db"] / 20.0)
        ceiling_db = m["output"]["ceiling_db"]
    y = brickwall_limit(y, sr, ceiling_db, C["limiter_release_ms"])
    # Inter-sample safety: tiny global trim only if oversampled peaks still exceed.
    tp_ceiling = 10.0 ** (ceiling_db / 20.0)
    tp = true_peak(y.astype(np.float32), factor=8)
    if tp > tp_ceiling:
        y = y * (tp_ceiling / tp)
    return y.astype(np.float32)


def render_session_file(src: Path, dst: Path, session: dict[str, Any]) -> None:
    """Render `src` (the AI master) through the session into `dst` + playback copy."""
    y, sr = sf.read(str(src), always_2d=True, dtype="float32")
    if y.shape[1] == 1:
        y = np.repeat(y, 2, axis=1)
    out = render_session(y[:, :2].T, int(sr), session)
    tmp = dst.with_name(f".{dst.name}.tmp.wav")
    sf.write(str(tmp), out.T, sr, subtype="PCM_24")
    tmp.replace(dst)
    sf.write(str(playback_wav_path(dst)), out.T, sr, subtype="PCM_16")
