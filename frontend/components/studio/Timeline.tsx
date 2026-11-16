"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/studio/dsp";
import type { Region } from "@/lib/studio/types";

type Drag =
  | { kind: "seek-or-create"; x0: number; t0: number; moved: boolean }
  | { kind: "move"; id: string; t0: number; start: number; end: number }
  | { kind: "resize"; id: string; edge: "start" | "end" };

export type TimelineProps = {
  peaks: number[];
  duration: number;
  sections: { section: string; start_sec: number; end_sec: number }[];
  regions: Region[];
  selectedId: string | null;
  getTime: () => number;
  onSeek: (t: number) => void;
  onSelect: (id: string | null) => void;
  onCreateRegion: (start: number, end: number) => void;
  onRegionChange: (id: string, patch: Partial<Region>) => void;
  onBeginEdit: () => void;
  loop: { start: number; end: number } | null;
};

const SECTION_COLORS: Record<string, string> = {
  intro: "#64748b",
  verse: "#22d3ee",
  pre: "#a78bfa",
  chorus: "#f472b6",
  hook: "#f472b6",
  bridge: "#facc15",
  drop: "#fb7185",
  outro: "#64748b",
};

function sectionColor(name: string) {
  const key = Object.keys(SECTION_COLORS).find((k) => name.toLowerCase().startsWith(k));
  return key ? SECTION_COLORS[key] : "#94a3b8";
}

export function Timeline(props: TimelineProps) {
  const { peaks, duration, sections, regions, selectedId, getTime, onSeek, onSelect, onCreateRegion, onRegionChange, onBeginEdit, loop } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [width, setWidth] = useState(0);

  const xToT = useCallback(
    (clientX: number) => {
      const rect = wrapRef.current!.getBoundingClientRect();
      return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
    },
    [duration],
  );
  const pct = (t: number) => `${(t / duration) * 100}%`;

  // Resize observer → redraw
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const h = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(h * dpr);
    const g = canvas.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, width, h);
    const mid = h / 2;
    const n = peaks.length || 1;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(34,211,238,0.85)");
    grad.addColorStop(0.5, "rgba(167,139,250,0.75)");
    grad.addColorStop(1, "rgba(34,211,238,0.85)");
    g.fillStyle = grad;
    for (let x = 0; x < width; x++) {
      const i0 = Math.floor((x / width) * n);
      const i1 = Math.max(i0 + 1, Math.floor(((x + 1) / width) * n));
      let p = 0;
      for (let i = i0; i < i1 && i < n; i++) p = Math.max(p, peaks[i]);
      const amp = Math.max(1, p * (mid - 4));
      g.fillRect(x, mid - amp, 1, amp * 2);
    }
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(0, mid, width, 1);
  }, [peaks, width]);

  // Playhead (no React re-render per frame)
  useEffect(() => {
    let raf = 0;
    const loopFn = () => {
      const t = getTime();
      if (headRef.current) headRef.current.style.left = pct(t);
      if (timeRef.current) timeRef.current.textContent = fmtTime(t);
      raf = requestAnimationFrame(loopFn);
    };
    raf = requestAnimationFrame(loopFn);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getTime, duration]);

  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const t = xToT(e.clientX);
    drag.current = { kind: "seek-or-create", x0: e.clientX, t0: t, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const t = xToT(e.clientX);
    if (d.kind === "seek-or-create") {
      if (!d.moved && Math.abs(e.clientX - d.x0) > 4) d.moved = true;
      if (d.moved) setDraft({ start: Math.min(d.t0, t), end: Math.max(d.t0, t) });
    } else if (d.kind === "move") {
      const len = d.end - d.start;
      const start = Math.min(Math.max(0, d.start + (t - d.t0)), duration - len);
      onRegionChange(d.id, { start_sec: round(start), end_sec: round(start + len) });
    } else if (d.kind === "resize") {
      const r = regions.find((x) => x.id === d.id);
      if (!r) return;
      if (d.edge === "start") onRegionChange(d.id, { start_sec: round(Math.min(t, r.end_sec - 0.25)) });
      else onRegionChange(d.id, { end_sec: round(Math.max(t, r.start_sec + 0.25)) });
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "seek-or-create") {
      if (d.moved && draft && draft.end - draft.start >= 0.25) onCreateRegion(round(draft.start), round(draft.end));
      else {
        onSelect(null);
        onSeek(d.t0);
      }
      setDraft(null);
    }
  };

  const startRegionDrag = (e: React.PointerEvent, r: Region, kind: "move" | "start" | "end") => {
    e.stopPropagation();
    if (e.button !== 0) return;
    (wrapRef.current as Element).setPointerCapture(e.pointerId);
    onSelect(r.id);
    onBeginEdit();
    drag.current = kind === "move" ? { kind: "move", id: r.id, t0: xToT(e.clientX), start: r.start_sec, end: r.end_sec } : { kind: "resize", id: r.id, edge: kind };
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Section lane */}
      <div className="relative h-5">
        {sections.map((s, i) => (
          <button
            type="button"
            key={`${s.section}-${i}`}
            onClick={() => onSeek(s.start_sec)}
            title={`${s.section} · ${fmtTime(s.start_sec)}–${fmtTime(s.end_sec)} (click to jump)`}
            className="absolute top-0 h-5 truncate rounded-[5px] px-1.5 text-left text-[9px] font-bold uppercase tracking-wider transition hover:brightness-125"
            style={{
              left: pct(s.start_sec),
              width: `calc(${pct(Math.max(0, s.end_sec - s.start_sec))} - 2px)`,
              background: `${sectionColor(s.section)}1f`,
              color: sectionColor(s.section),
              borderLeft: `2px solid ${sectionColor(s.section)}`,
            }}
          >
            {s.section}
          </button>
        ))}
      </div>

      {/* Waveform + regions */}
      <div
        ref={wrapRef}
        className="relative h-40 cursor-crosshair overflow-hidden rounded-xl border border-white/[0.06] bg-black/40 touch-none"
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {loop && (
          <div className="pointer-events-none absolute inset-y-0 bg-amber-300/[0.06] border-x border-amber-300/40" style={{ left: pct(loop.start), width: pct(loop.end - loop.start) }} />
        )}

        {regions.map((r) => {
          const sel = r.id === selectedId;
          const tone = r.gain_db >= 0 ? "52,211,153" : "251,113,133";
          return (
            <div
              key={r.id}
              className="absolute inset-y-0 cursor-grab active:cursor-grabbing"
              style={{
                left: pct(r.start_sec),
                width: pct(r.end_sec - r.start_sec),
                background: `rgba(${tone},${sel ? 0.2 : 0.11})`,
                boxShadow: sel ? `inset 0 0 0 1.5px rgba(${tone},0.9)` : `inset 0 0 0 1px rgba(${tone},0.35)`,
              }}
              onPointerDown={(e) => startRegionDrag(e, r, "move")}
              title="Drag to move · edges to resize"
            >
              <div className="absolute left-0 inset-y-0 w-2 cursor-ew-resize hover:bg-white/20" onPointerDown={(e) => startRegionDrag(e, r, "start")} />
              <div className="absolute right-0 inset-y-0 w-2 cursor-ew-resize hover:bg-white/20" onPointerDown={(e) => startRegionDrag(e, r, "end")} />
              <div className="pointer-events-none absolute left-2 top-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white/90">
                {r.label || "Region"}
                <span style={{ color: `rgb(${tone})` }}>{r.gain_db > 0 ? "+" : ""}{r.gain_db.toFixed(1)} dB</span>
              </div>
            </div>
          );
        })}

        {draft && (
          <div className="pointer-events-none absolute inset-y-0 border-x border-emerald-300/70 bg-emerald-300/15" style={{ left: pct(draft.start), width: pct(draft.end - draft.start) }} />
        )}

        <div ref={headRef} className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" style={{ left: 0 }}>
          <div className="absolute -top-0.5 -left-[5px] h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-white" />
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/35">
        <span ref={timeRef} className="tabular-nums text-white/70">0:00.0</span>
        <span>Click to seek · drag on the waveform to create a region · drag a region to move it</span>
        <span className="tabular-nums">{fmtTime(duration)}</span>
      </div>
    </div>
  );
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}
