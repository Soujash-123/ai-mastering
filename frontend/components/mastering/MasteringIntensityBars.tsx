"use client";
import { alpha } from "@/lib/colors";

function pickNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

type Props = {
  intent: Record<string, unknown> | null | undefined;
};

const BAR_META = [
  {
    label: "Warmth",
    desc: "Adds subtle warmth and body to the low-mids.",
    icon: "🔥",
    from: "rgb(var(--k-accent))",
    to: "rgb(var(--k-alert-hi))",
  },
  {
    label: "Brightness",
    desc: "Brings clarity and air without harshness.",
    icon: "✨",
    from: "rgb(var(--k-accent))",
    to: "rgb(var(--k-second))",
  },
  {
    label: "Punch Preservation",
    desc: "Maintains transient impact and groove.",
    icon: "⚡",
    from: "rgb(var(--k-second))",
    to: "rgb(var(--k-accent))",
  },
  {
    label: "Stereo Width",
    desc: "Enhances image width and spatial depth.",
    icon: "↔",
    from: "rgb(var(--k-accent))",
    to: "rgb(var(--k-second))",
  },
];

export function MasteringIntensityBars({ intent }: Props) {
  if (!intent || typeof intent !== "object") return null;

  const eq = intent.eq_strategy as Record<string, unknown> | undefined;
  const comp = intent.compression_strategy as Record<string, unknown> | undefined;
  const spat = intent.spatial_strategy as Record<string, unknown> | undefined;

  const values = [
    pickNum(eq?.warmth_intensity),
    pickNum(eq?.brightness_intensity),
    pickNum(comp?.punch_preservation),
    pickNum(spat?.stereo_width_amount),
  ];

  const hasAny = values.some((v) => v != null);
  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {BAR_META.map((meta, i) => {
        const value = values[i];
        if (value == null) return null;
        const pct = (Math.min(10, Math.max(0, value)) / 10) * 100;

        return (
          <div key={meta.label} className="space-y-2">
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs"
                style={{
                  background: `linear-gradient(135deg, ${alpha(meta.from, 0.13)}, ${alpha(meta.to, 0.09)})`,
                  border: `1px solid ${alpha(meta.from, 0.16)}`,
                }}
              >
                {meta.icon}
              </div>
              {/* Label + desc */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-white">{meta.label}</p>
                  <span
                    className="shrink-0 font-mono text-sm font-bold"
                    style={{ color: meta.from }}
                  >
                    {value.toFixed(1)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-mist-200/42">{meta.desc}</p>
                {/* Bar */}
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${meta.from}, ${meta.to})`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Perceptual scale note */}
      <p className="mt-3 pt-3 border-t border-white/[0.05] text-[11px] text-mist-200/28 leading-relaxed">
        Perceptual Scale 0–10 &nbsp;•&nbsp; All adjustments are made transparently to maximize impact while preserving your mix.
      </p>
    </div>
  );
}
