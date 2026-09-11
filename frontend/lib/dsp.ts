import type { JobResult } from "./api";

export type DSPParamMeta = {
  key: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  fmt?: (v: number) => string;
};

export type DSPGroup = {
  id: string;
  label: string;
  accent: string;
  params: DSPParamMeta[];
};

const db = (v: number) => `${v.toFixed(1)} dB`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const ratio = (v: number) => `1 : ${v.toFixed(2)}`;
const ms = (v: number) => `${Math.round(v)} ms`;
const lufs = (v: number) => `${v.toFixed(1)} LUFS`;
const tpceil = (v: number) => `${v.toFixed(2)} dBTP`;

export const DSP_GROUPS: DSPGroup[] = [
  {
    id: "tonal",
    label: "Tonal Balance",
    accent: "#22d3ee",
    params: [
      { key: "low_shelf_db", label: "Low Shelf", hint: "Warmth / body at 90 Hz", min: -3, max: 3, step: 0.1, fmt: db },
      { key: "mid_peak_db", label: "Mid Presence", hint: "Clarity at 2.5 kHz", min: -4, max: 4, step: 0.1, fmt: db },
      { key: "high_shelf_db", label: "High Shelf", hint: "Air & brilliance at 9.5 kHz", min: -4, max: 4, step: 0.1, fmt: db },
      { key: "dynamic_eq_strength", label: "Dynamic EQ", hint: "Auto tonal correction depth", min: 0, max: 1, step: 0.01, fmt: pct },
    ],
  },
  {
    id: "dynamics",
    label: "Dynamics",
    accent: "#a3e635",
    params: [
      { key: "low_ratio", label: "Low Ratio", hint: "Low-band compression", min: 1, max: 3, step: 0.05, fmt: ratio },
      { key: "mid_ratio", label: "Mid Ratio", hint: "Mid-band compression", min: 1, max: 4, step: 0.05, fmt: ratio },
      { key: "high_ratio", label: "High Ratio", hint: "High-band compression", min: 1, max: 3.5, step: 0.05, fmt: ratio },
      { key: "transient_blend", label: "Transient Blend", hint: "Dry vs compressed mix", min: 0.15, max: 0.9, step: 0.01, fmt: pct },
      { key: "transient_restore", label: "Transient Restore", hint: "Rebuild punch after the chain", min: 0, max: 0.5, step: 0.01, fmt: pct },
      { key: "mb_attack_ms", label: "Attack", hint: "Compressor attack time", min: 3, max: 80, step: 1, fmt: ms },
      { key: "mb_release_ms", label: "Release", hint: "Compressor release time", min: 40, max: 400, step: 1, fmt: ms },
    ],
  },
  {
    id: "color",
    label: "Color & Width",
    accent: "#f472b6",
    params: [
      { key: "saturation_amount", label: "Saturation", hint: "Harmonic coloring amount", min: 0, max: 0.45, step: 0.01, fmt: pct },
      { key: "exciter_amount", label: "Air Exciter", hint: "Psychoacoustic high shimmer", min: 0, max: 0.35, step: 0.01, fmt: pct },
      { key: "harmonic_low", label: "Low Harmonics", hint: "Tape-style low harmonics", min: 0, max: 0.42, step: 0.01, fmt: pct },
      { key: "harmonic_mid", label: "Mid Harmonics", hint: "Harmonic density in mids", min: 0, max: 0.42, step: 0.01, fmt: pct },
      { key: "harmonic_high", label: "High Harmonics", hint: "Tube-style high harmonics", min: 0, max: 0.32, step: 0.01, fmt: pct },
      { key: "stereo_width_factor", label: "Width", hint: "Overall stereo width", min: 0.9, max: 1.2, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
      { key: "width_air", label: "Width (Air)", hint: "High-frequency width", min: 0.9, max: 1.2, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
      { key: "width_body", label: "Width (Body)", hint: "Side energy width", min: 0.9, max: 1.15, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    ],
  },
  {
    id: "loudness",
    label: "Loudness",
    accent: "#a78bfa",
    params: [
      { key: "target_lufs", label: "Target Loudness", hint: "Integrated LUFS target", min: -18, max: -7, step: 0.5, fmt: lufs },
      { key: "true_peak_ceiling_db", label: "True Peak Ceiling", hint: "Maximum peak level", min: -3, max: -0.3, step: 0.1, fmt: tpceil },
      { key: "limiter_drive", label: "Limiter Drive", hint: "Limiter aggressiveness", min: 0.15, max: 0.6, step: 0.01, fmt: pct },
      { key: "clip_drive", label: "Soft Clip Drive", hint: "Clipping warmth before the limiter", min: 0, max: 0.25, step: 0.01, fmt: pct },
      { key: "perceptual_density", label: "Perceptual Density", hint: "Perceived loudness fill", min: 0, max: 0.25, step: 0.01, fmt: pct },
    ],
  },
];

export const DSP_PARAM_KEYS = DSP_GROUPS.flatMap((g) => g.params.map((p) => p.key));

export function emptyOverrides(): Record<string, number> {
  return Object.fromEntries(DSP_PARAM_KEYS.map((k) => [k, NaN]));
}

export function extractBaseParams(data: JobResult | null): Record<string, number> {
  const src = (data?.dsp_params as Record<string, number> | null | undefined) ?? {};
  const out: Record<string, number> = {};
  for (const key of DSP_PARAM_KEYS) {
    const v = src[key];
    out[key] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  // Fill sensible defaults for params AI didn't set (e.g. legacy jobs)
  const fallbacks: Record<string, number> = {
    low_shelf_db: 0, mid_peak_db: 0, high_shelf_db: 0, dynamic_eq_strength: 0.4,
    low_ratio: 2, mid_ratio: 2.2, high_ratio: 1.8, saturation_amount: 0.2,
    stereo_width_factor: 1.04, transient_blend: 0.6, exciter_amount: 0.15,
    resonance_suppression: 0.2, perceptual_density: 0.12, transient_restore: 0.2,
    limiter_drive: 0.35, harmonic_low: 0.25, harmonic_mid: 0.28, harmonic_high: 0.18,
    width_air: 1.0, width_body: 1.0, mb_attack_ms: 12, mb_release_ms: 90,
    clip_drive: 0.15, target_lufs: -14, true_peak_ceiling_db: -1,
  };
  for (const key of DSP_PARAM_KEYS) {
    if (out[key] === 0 && (key in fallbacks) && src[key] === undefined) {
      out[key] = fallbacks[key];
    }
  }
  return out;
}

export function clampToBounds(key: string, value: number): number {
  for (const group of DSP_GROUPS) {
    const meta = group.params.find((p) => p.key === key);
    if (meta) return Math.min(meta.max, Math.max(meta.min, value));
  }
  return value;
}

export function paramMeta(key: string): DSPParamMeta | null {
  for (const group of DSP_GROUPS) {
    const meta = group.params.find((p) => p.key === key);
    if (meta) return meta;
  }
  return null;
}

export function formatParamValue(key: string, value: number): string {
  const meta = paramMeta(key);
  if (!meta || !Number.isFinite(value)) return "—";
  return meta.fmt ? meta.fmt(value) : value.toFixed(2);
}

export function paramIsBase(key: string, params: Record<string, number>, base: Record<string, number>): boolean {
  const a = params[key];
  const b = base[key];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const meta = paramMeta(key);
  const tolerance = meta ? meta.step / 2 : 1e-6;
  return Math.abs(a - b) <= tolerance;
}