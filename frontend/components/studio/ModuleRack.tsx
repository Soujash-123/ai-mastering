"use client";

import { Knob } from "./Knob";
import { fmtTime } from "@/lib/studio/dsp";
import type { ModuleState, Region, StudioSpec } from "@/lib/studio/types";

export const MODULE_ACCENTS: Record<string, string> = {
  eq: "#22d3ee",
  comp: "#a3e635",
  warmth: "#fb923c",
  width: "#a78bfa",
  output: "#f472b6",
};

const MODULE_BLURB: Record<string, string> = {
  eq: "Shape the tone",
  comp: "Glue it together",
  warmth: "Analog color",
  width: "Stereo image",
  output: "Final loudness",
};

function Power({ on, onClick, accent }: { on: boolean; onClick: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={on ? "Turn off" : "Turn on"}
      className="flex h-6 w-6 items-center justify-center rounded-full border transition"
      style={{
        borderColor: on ? `${accent}99` : "rgba(255,255,255,0.12)",
        color: on ? accent : "rgba(255,255,255,0.3)",
        boxShadow: on ? `0 0 10px ${accent}55` : "none",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M6 1v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M3.2 3.2a4 4 0 1 0 5.6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export type ModuleRackProps = {
  spec: StudioSpec;
  modules: Record<string, ModuleState>;
  onParam: (module: string, param: string, value: number) => void;
  onToggle: (module: string) => void;
  onBegin: () => void;
  region: Region | null;
  onRegion: (patch: Partial<Region>) => void;
  onDeleteRegion: () => void;
  onLoopRegion: () => void;
  looping: boolean;
};

export function ModuleRack({ spec, modules, onParam, onToggle, onBegin, region, onRegion, onDeleteRegion, onLoopRegion, looping }: ModuleRackProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {region && (
        <div className="flex min-w-[300px] flex-col rounded-2xl border border-emerald-300/40 bg-emerald-300/[0.05] p-3 shadow-[0_0_24px_rgba(52,211,153,0.08)]">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-emerald-300/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">Region</span>
            <input
              value={region.label}
              placeholder="Name this part…"
              onFocus={onBegin}
              onChange={(e) => onRegion({ label: e.target.value.slice(0, 60) })}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white outline-none focus:border-emerald-300/50"
            />
            <button type="button" onClick={onLoopRegion} title="Loop this region" className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${looping ? "border-amber-300/60 bg-amber-300/15 text-amber-200" : "border-white/10 text-white/60 hover:text-white"}`}>
              Loop
            </button>
            <button type="button" onClick={onDeleteRegion} title="Delete region (Del)" className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-rose-300/80 transition hover:border-rose-300/50 hover:text-rose-200">
              Delete
            </button>
          </div>
          <p className="mb-2 text-[10px] tabular-nums text-white/40">
            {fmtTime(region.start_sec)} – {fmtTime(region.end_sec)}
          </p>
          <div className="flex flex-1 items-center justify-around gap-2">
            {(["gain_db", "bass_db", "air_db", "fade_ms"] as const).map((k) => (
              <Knob key={k} spec={spec.region[k]} value={region[k]} accent="#34d399" onBegin={onBegin} onChange={(v) => onRegion({ [k]: v })} size={50} />
            ))}
          </div>
        </div>
      )}

      {Object.entries(spec.modules).map(([key, mspec]) => {
        const state = modules[key];
        if (!state) return null;
        const accent = MODULE_ACCENTS[key] ?? "#22d3ee";
        const on = !!state.enabled;
        return (
          <div
            key={key}
            className="flex min-w-[180px] flex-col rounded-2xl border bg-[#0f0f13]/90 p-3 transition"
            style={{ borderColor: on ? `${accent}33` : "rgba(255,255,255,0.06)" }}
          >
            <div className="mb-3 flex items-center gap-2">
              <Power
                on={on}
                accent={accent}
                onClick={() => {
                  onBegin();
                  onToggle(key);
                }}
              />
              <div className="min-w-0">
                <p className={`truncate text-[12px] font-bold ${on ? "text-white" : "text-white/45"}`}>{mspec.label}</p>
                <p className="text-[9px] text-white/35">{MODULE_BLURB[key]}</p>
              </div>
            </div>
            <div className={`grid flex-1 items-center gap-x-3 gap-y-2 ${Object.keys(mspec.params).length > 2 ? "grid-cols-2" : "grid-cols-2"}`}>
              {Object.entries(mspec.params).map(([pk, pspec]) => (
                <Knob
                  key={pk}
                  spec={pspec}
                  value={Number(state[pk] ?? pspec.default)}
                  accent={on ? accent : "#64748b"}
                  size={48}
                  onBegin={onBegin}
                  onChange={(v) => onParam(key, pk, v)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
