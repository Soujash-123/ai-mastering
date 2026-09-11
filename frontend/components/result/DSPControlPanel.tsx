"use client";

import { useState } from "react";
import { DSP_GROUPS, formatParamValue, paramIsBase } from "@/lib/dsp";

export type PreviewMode = "window" | "full";

export interface DSPControlPanelProps {
  params: Record<string, number>;
  baseParams: Record<string, number>;
  onParamChange: (key: string, value: number) => void;
  onReset: () => void;
  rendering: boolean;
  finalizing: boolean;
  stats: { lufs: number | null; peak_db: number | null } | null;
  error: string | null;
  previewMode: PreviewMode;
  onPreviewModeChange: (mode: PreviewMode) => void;
  onFinalize: () => void;
  finalized: boolean;
  disabled?: boolean;
}

function Slider({
  slKey,
  label,
  hint,
  value,
  min,
  max,
  step,
  accent,
  onCommit,
  isBase,
  onReset,
}: {
  slKey: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accent: string;
  onCommit: (v: number) => void;
  isBase: boolean;
  onReset: () => void;
}) {
  const finite = Number.isFinite(value);
  const val = clampToBounds(finite ? value : (min + max) / 2, min, max);
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold text-white/85 truncate">{label}</span>
          {!isBase && (
            <button
              type="button"
              onClick={onReset}
              title={`Reset ${label} to AI master`}
              className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-cyan-400/70 hover:text-cyan-300 transition-colors"
            >
              reset
            </button>
          )}
        </div>
        <span
          className="shrink-0 font-mono text-[11px] font-bold px-2 py-0.5 rounded-md border"
          style={{ color: accent, borderColor: `${accent}40`, background: `${accent}0d` }}
        >
          {formatParamValue(slKey, finite ? value : Number.NaN)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => onCommit(parseFloat(e.target.value))}
        className="w-full h-1.5 cursor-pointer"
        style={{ accentColor: accent }}
      />
      <div className="flex justify-between mt-1 gap-2">
        <span className="text-[9px] text-white/25">{min}</span>
        <span className="text-[9px] text-white/35 truncate">{hint}</span>
        <span className="text-[9px] text-white/25">{max}</span>
      </div>
    </div>
  );
}

export function DSPControlPanel({
  params,
  baseParams,
  onParamChange,
  onReset,
  rendering,
  finalizing,
  stats,
  error,
  previewMode,
  onPreviewModeChange,
  onFinalize,
  finalized,
  disabled,
}: DSPControlPanelProps) {
  const [dirty, setDirty] = useState(false);

  const handleChange = (key: string, value: number) => {
    setDirty(true);
    onParamChange(key, value);
  };

  const handleReset = (key: string, fallback: number) => {
    handleChange(key, baseParams[key] ?? fallback);
  };

  return (
    <div className="relative rounded-3xl border border-cyan-400/15 bg-[#09090b]/80 backdrop-blur-xl shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_32px_60px_rgba(0,0,0,0.5)] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-cyan-400/[0.02] to-transparent" />

      <div className="p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-cyan-400">
              DSP Control Panel
            </h2>
            <p className="text-[11px] text-white/40 mt-1">
              Tune the mastering chain. The preview updates live — render your final master when it sounds right.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {rendering && (
              <div className="flex items-center gap-2 text-[11px] text-cyan-200/70">
                <div className="h-3 w-3 animate-spin rounded-full border border-white/15 border-t-cyan-400" />
                Rendering preview…
              </div>
            )}
            {finalized && !dirty && (
              <span className="px-2.5 py-1 rounded-full border border-lime-400/40 bg-lime-400/10 text-[9px] font-bold uppercase tracking-widest text-lime-400">
                Final master rendered
              </span>
            )}
            <button
              type="button"
              onClick={onReset}
              disabled={disabled}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-white/60 hover:text-white hover:border-white/25 transition-all disabled:opacity-40"
            >
              Reset to AI Master
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Integrated LUFS", val: stats?.lufs != null ? stats.lufs.toFixed(1) : "—" },
            { label: "True Peak", val: stats?.peak_db != null ? `${stats.peak_db.toFixed(2)} dB` : "—" },
            { label: "Mode", val: previewMode === "full" ? "Whole song" : "Preview window" },
            { label: "State", val: rendering ? "Rendering" : finalizing ? "Finalizing" : "Preview" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-cyan-400/10 bg-black/40 px-4 py-3 text-center">
              <div className="font-mono text-lg font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-lime-400">{s.val}</div>
              <div className="text-[8px] uppercase tracking-[0.15em] text-cyan-200/40 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3">
            <p className="text-xs text-rose-300">{error}</p>
          </div>
        )}

        {/* Groups */}
        <div className="grid md:grid-cols-2 gap-x-10 gap-y-8 mb-8">
          {DSP_GROUPS.map((group) => (
            <div key={group.id}>
              <div className="flex items-center gap-2 mb-5">
                <span className="w-2 h-2 rounded-full" style={{ background: group.accent, boxShadow: `0 0 8px ${group.accent}` }} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: group.accent }}>
                  {group.label}
                </h3>
              </div>
              <div className="flex flex-col gap-5">
                {group.params.map((meta) => (
                  <Slider
                    key={meta.key}
                    slKey={meta.key}
                    label={meta.label}
                    hint={meta.hint}
                    value={Number.isFinite(params[meta.key]) ? params[meta.key] : Number.NaN}
                    min={meta.min}
                    max={meta.max}
                    step={meta.step}
                    accent={group.accent}
                    onCommit={(v) => handleChange(meta.key, v)}
                    isBase={paramIsBase(meta.key, params, baseParams)}
                    onReset={() => handleReset(meta.key, meta.min)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-white/[0.06] pt-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
              Preview scope
            </span>
            <div className="flex items-center rounded-xl border border-cyan-400/20 overflow-hidden">
              <button
                type="button"
                onClick={() => onPreviewModeChange("window")}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  previewMode === "window"
                    ? "bg-cyan-400/20 text-cyan-300"
                    : "bg-transparent text-white/40 hover:text-white/70"
                }`}
              >
                Fast Window
              </button>
              <button
                type="button"
                onClick={() => onPreviewModeChange("full")}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  previewMode === "full"
                    ? "bg-cyan-400/20 text-cyan-300"
                    : "bg-transparent text-white/40 hover:text-white/70"
                }`}
              >
                Whole Song
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDirty(false);
              onFinalize();
            }}
            disabled={disabled || rendering || finalizing}
            className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-[#09090b] bg-gradient-to-r from-cyan-400 to-lime-400 rounded-xl hover:brightness-110 shadow-[0_0_24px_rgba(34,211,238,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {finalizing ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#09090b]/30 border-t-[#09090b]" />
                Rendering final master…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 10l5-4-5-4v8zM8 10l5-4-5-4v8z" fill="currentColor" />
                </svg>
                Render Final Master
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function clampToBounds(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}