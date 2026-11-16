/* Shared formulas — keep in sync with backend/studio/render.py. */
import type { Region } from "./types";

export const CONTROL_RATE_HZ = 100;
export const LIMITER_ISP_MARGIN_DB = 0.3;

export const compThresholdDb = (amount: number) => -6 - 24 * amount;
export const compMakeupDb = (amount: number, ratio: number) =>
  -compThresholdDb(amount) * (1 - 1 / ratio) * 0.35;
export const warmthK = (drive: number) => 1 + 2 * drive;
export const limiterCeilingLin = (ceilingDb: number) =>
  Math.pow(10, (ceilingDb - LIMITER_ISP_MARGIN_DB) / 20);
export const dbToGain = (db: number) => Math.pow(10, db / 20);

/** WaveShaper curve over input pre-scaled by 0.5 (so ±2 maps into ±1). */
export function warmthCurve(drive: number, size = 4096): Float32Array<ArrayBuffer> {
  const k = warmthK(drive);
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  for (let i = 0; i < size; i++) {
    const u = (i / (size - 1)) * 2 - 1; // [-1, 1]
    curve[i] = Math.tanh(k * 2 * u) / k;
  }
  return curve;
}

function regionWeight(t: number, start: number, end: number, fadeSec: number): number {
  if (t < start || t > end) return 0;
  const fade = Math.max(1e-3, Math.min(fadeSec, (end - start) / 2));
  const up = Math.min(1, Math.max(0, (t - start) / fade));
  const down = Math.min(1, Math.max(0, (end - t) / fade));
  return Math.min(up, down);
}

export type RegionCurves = { gain_db: Float32Array; bass_db: Float32Array; air_db: Float32Array };

/** dB curves sampled at CONTROL_RATE_HZ (same as studio/render.py:region_curves). */
export function regionCurves(regions: Region[], durationSec: number): RegionCurves {
  const n = Math.max(2, Math.ceil(durationSec * CONTROL_RATE_HZ) + 1);
  const out: RegionCurves = {
    gain_db: new Float32Array(n),
    bass_db: new Float32Array(n),
    air_db: new Float32Array(n),
  };
  for (const r of regions) {
    const i0 = Math.max(0, Math.floor(r.start_sec * CONTROL_RATE_HZ));
    const i1 = Math.min(n - 1, Math.ceil(r.end_sec * CONTROL_RATE_HZ));
    for (let i = i0; i <= i1; i++) {
      const w = regionWeight(i / CONTROL_RATE_HZ, r.start_sec, r.end_sec, r.fade_ms / 1000);
      if (w === 0) continue;
      out.gain_db[i] += w * r.gain_db;
      out.bass_db[i] += w * r.bass_db;
      out.air_db[i] += w * r.air_db;
    }
  }
  return out;
}

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${cs}`;
}

export function fmtParam(value: number, unit: string): string {
  if (unit === "%") return `${Math.round(value * 100)}%`;
  if (unit === "dB") return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
  if (unit === "dBTP") return `${value.toFixed(1)} dBTP`;
  if (unit === "ms") return `${Math.round(value)} ms`;
  if (unit === "Hz") return value <= 0 ? "Off" : `${Math.round(value)} Hz`;
  if (unit === ":1") return `${value.toFixed(1)}:1`;
  return `${value}`;
}
