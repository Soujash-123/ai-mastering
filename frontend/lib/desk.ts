// Creative mastering desk: seven channels, -5..+5.
// Applied desk = STYLE_DESK_START[style] + the artist's tweaks (clamped).
// The style start applies for everyone; tweaks are EARLY_ACCESS/ADMIN only.
// Backend mirror: backend/mastering/creative.py (keep the two in sync).

import { STYLE_FAMILIES } from "@/lib/landing/content";

export const DESK_MIN = -5;
export const DESK_MAX = 5;

export type DeskKey = "low" | "mids" | "air" | "punch" | "warmth" | "width" | "loudness";
export type Desk = Record<DeskKey, number>;
export type DeskTweaks = Partial<Desk>;

export type DeskChannel = {
  key: DeskKey;
  label: string;
  hint: string;
  /** Human readout of what this value does to the master. */
  readout: (v: number, style: string) => string;
};

const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(digits)}`;

const LUFS: Record<string, [number, number]> = Object.fromEntries(
  STYLE_FAMILIES.map((f) => [f.key, f.lufs as [number, number]]),
);

/** Target LUFS for a loudness channel value (mirrors creative.apply_creative). */
export function loudnessTarget(v: number, style: string): number | null {
  const win = LUFS[style];
  if (!win || v === 0) return null;
  const [lo, hi] = win;
  return lo + ((hi - lo) * (v - DESK_MIN)) / (DESK_MAX - DESK_MIN);
}

export const DESK_CHANNELS: DeskChannel[] = [
  { key: "low", label: "Low end", hint: "Weight and body", readout: (v) => `${signed(v * 0.3)} dB` },
  { key: "mids", label: "Vocal", hint: "Presence in the middle", readout: (v) => `${signed(v * 0.3)} dB` },
  { key: "air", label: "Air", hint: "Shine up top", readout: (v) => `${signed(v * 0.3)} dB` },
  { key: "punch", label: "Punch", hint: "Snap of drums and strokes", readout: (v) => (v === 0 ? "Kord" : `${signed(v, 0)} step${Math.abs(v) === 1 ? "" : "s"}`) },
  { key: "warmth", label: "Warmth", hint: "Gentle saturation", readout: (v) => (v === 0 ? "Kord" : `${signed(v, 0)} step${Math.abs(v) === 1 ? "" : "s"}`) },
  { key: "width", label: "Width", hint: "Stereo spread", readout: (v) => (v === 0 ? "Kord" : `${signed(v * 1.2, 1)}%`) },
  {
    key: "loudness",
    label: "Loudness",
    hint: "Within the style's safe range",
    readout: (v, style) => {
      const t = loudnessTarget(v, style);
      if (t != null) return `${t.toFixed(1)} LUFS`;
      return v === 0 ? "Kord" : `${signed(v * 0.4)} LUFS`;
    },
  },
];

export const NEUTRAL_DESK: Desk = { low: 0, mids: 0, air: 0, punch: 0, warmth: 0, width: 0, loudness: 0 };

/** Where each style puts the desk before the artist touches it. */
export const STYLE_DESK_START: Record<string, DeskTweaks> = {
  auto: {},
  indian_classical: { loudness: -3, punch: -1, warmth: -1, width: -1 },
  devotional: { warmth: 2, air: -1 },
  film_melodic: { mids: 2, air: 1 },
  bollywood_dance: { loudness: 4, low: 2, punch: 2 },
  fusion_indie: { punch: 1 },
};

const clampDesk = (v: number) => Math.max(DESK_MIN, Math.min(DESK_MAX, Math.round(v)));

export function effectiveDesk(style: string, tweaks: DeskTweaks): Desk {
  const start = STYLE_DESK_START[style] ?? {};
  const out = { ...NEUTRAL_DESK };
  (Object.keys(out) as DeskKey[]).forEach((k) => {
    out[k] = clampDesk((start[k] ?? 0) + (tweaks[k] ?? 0));
  });
  return out;
}

/** Tweak needed so the effective value for `key` becomes `value`. */
export function tweakFor(style: string, key: DeskKey, value: number): number {
  return clampDesk(value) - (STYLE_DESK_START[style]?.[key] ?? 0);
}

export function hasTweaks(tweaks: DeskTweaks): boolean {
  return Object.values(tweaks).some((v) => v && v !== 0);
}

/** EQ curve of the desk's three EQ channels (dB) at frequency f. Display only. */
export function deskEqAt(desk: Desk, f: number): number {
  const low = desk.low * 0.3;
  const mid = desk.mids * 0.3;
  const high = desk.air * 0.3;
  const lowShelf = low / (1 + (f / 90) ** 2);
  const highShelf = high / (1 + (9500 / f) ** 2);
  const oct = Math.log2(f / 2500);
  const peak = mid * Math.exp(-(oct * oct) / (2 * 0.9 * 0.9));
  return lowShelf + peak + highShelf;
}
