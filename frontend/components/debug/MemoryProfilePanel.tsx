"use client";

import { useMemo } from "react";
import type { MemoryStepReport } from "@/lib/api";

function formatStepLabel(name: string): string {
  return name
    .replace(/^analysis\./, "")
    .replace(/^mastering\./, "")
    .replace(/_/g, " ")
    .replace(/\./g, " › ");
}

function groupForStep(name: string): string {
  if (name.startsWith("analysis.")) return "Analysis";
  if (name.startsWith("mastering.")) return "Mastering DSP";
  if (name === "analysis") return "Pipeline";
  if (name === "mastering") return "Pipeline";
  if (name === "export_all" || name === "export_variants" || name === "streaming_simulation") return "Export";
  if (name === "llm_strategy" || name === "dsp_safety_mapping") return "AI Strategy";
  return "Pipeline";
}

type Props = {
  steps: MemoryStepReport[];
};

export function MemoryProfilePanel({ steps }: Props) {
  const { peakMb, grouped, maxDelta } = useMemo(() => {
    if (steps.length === 0) {
      return { peakMb: 0, grouped: [] as { group: string; items: MemoryStepReport[] }[], maxDelta: 1 };
    }
    const peak = Math.max(...steps.map((s) => s.rss_peak_mb));
    const maxD = Math.max(...steps.map((s) => Math.abs(s.delta_mb)), 1);
    const order = ["Pipeline", "Analysis", "AI Strategy", "Mastering DSP", "Export"];
    const buckets = new Map<string, MemoryStepReport[]>();
    for (const step of steps) {
      const group = groupForStep(step.name);
      const list = buckets.get(group) ?? [];
      list.push(step);
      buckets.set(group, list);
    }
    const groupedList = order
      .filter((g) => buckets.has(g))
      .map((group) => ({ group, items: buckets.get(group)! }));
    return { peakMb: peak, grouped: groupedList, maxDelta: maxD };
  }, [steps]);

  if (steps.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">Process Memory</p>
        <p className="mt-3 text-xs text-mist-200/45">Memory profiling data is not available for this job.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">Process Memory</p>
          <p className="mt-1 text-xs text-mist-200/50">RSS per backend step after mastering completed</p>
        </div>
        <div className="rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2 text-right">
          <p className="text-[8px] uppercase tracking-wider text-accent/60">Peak RSS</p>
          <p className="font-mono text-lg font-bold text-accent">{peakMb.toFixed(1)} MiB</p>
        </div>
      </div>

      <div className="space-y-5">
        {grouped.map(({ group, items }) => (
          <div key={group}>
            <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-mist-200/32">{group}</p>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <div className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-2 border-b border-white/[0.06] bg-ink-950/40 px-3 py-2 text-[8px] font-bold uppercase tracking-wider text-mist-200/30">
                <span>Step</span>
                <span className="text-right">End</span>
                <span className="text-right">Delta</span>
                <span className="text-right">Peak</span>
              </div>
              {items.map((step) => {
                const deltaPct = Math.min(100, (Math.abs(step.delta_mb) / maxDelta) * 100);
                const deltaPositive = step.delta_mb >= 0;
                return (
                  <div
                    key={step.name}
                    className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] items-center gap-2 border-b border-white/[0.04] px-3 py-2.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-mist-200/75" title={step.name}>
                        {formatStepLabel(step.name)}
                      </p>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${deltaPct}%`,
                            background: deltaPositive
                              ? "linear-gradient(90deg, rgba(110,231,255,0.35), rgba(110,231,255,0.85))"
                              : "linear-gradient(90deg, rgba(167,139,250,0.35), rgba(167,139,250,0.85))",
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-right font-mono text-[10px] text-mist-200/60">{step.rss_end_mb.toFixed(1)}</span>
                    <span
                      className={`text-right font-mono text-[10px] font-semibold ${
                        step.delta_mb > 10 ? "text-accent" : step.delta_mb < -5 ? "text-violet/80" : "text-mist-200/55"
                      }`}
                    >
                      {step.delta_mb >= 0 ? "+" : ""}
                      {step.delta_mb.toFixed(1)}
                    </span>
                    <span className="text-right font-mono text-[10px] text-mist-200/45">{step.rss_peak_mb.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
