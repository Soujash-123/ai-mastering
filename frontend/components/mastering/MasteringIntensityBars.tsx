"use client";

/** Renders 0–10 mastering-scale bars when numeric values exist on safe_intent. */

function pickNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

type Props = {
  intent: Record<string, unknown> | null | undefined;
};

export function MasteringIntensityBars({ intent }: Props) {
  if (!intent || typeof intent !== "object") return null;

  const eq = intent.eq_strategy as Record<string, unknown> | undefined;
  const comp = intent.compression_strategy as Record<string, unknown> | undefined;
  const spat = intent.spatial_strategy as Record<string, unknown> | undefined;

  const rows: { label: string; value: number }[] = [];
  const w = pickNum(eq?.warmth_intensity);
  if (w != null) rows.push({ label: "Warmth", value: w });
  const b = pickNum(eq?.brightness_intensity);
  if (b != null) rows.push({ label: "Brightness", value: b });
  const p = pickNum(comp?.punch_preservation);
  if (p != null) rows.push({ label: "Punch preservation", value: p });
  const sw = pickNum(spat?.stereo_width_amount);
  if (sw != null) rows.push({ label: "Stereo width", value: sw });

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <p className="text-xs text-mist-200/90">
        Perceptual controls use a <span className="text-mist-100">0–10 mastering scale</span> (5 ≈ balanced).
        LUFS, dB, milliseconds, and compression ratio stay in real audio units.
      </p>
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-xs text-mist-200">
            <span>{r.label}</span>
            <span className="text-mist-100">{r.value.toFixed(1)} / 10</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.1}
            value={Math.min(10, Math.max(0, r.value))}
            readOnly
            disabled
            className="mt-1 h-1.5 w-full cursor-default accent-accent"
            aria-label={`${r.label} intensity`}
          />
        </div>
      ))}
    </div>
  );
}
