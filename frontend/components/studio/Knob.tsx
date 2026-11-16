"use client";

import { useCallback, useRef } from "react";
import { fmtParam } from "@/lib/studio/dsp";
import type { ParamSpec } from "@/lib/studio/types";

const SWEEP = 270; // degrees
const START = -135;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} ${sweep} ${b.x} ${b.y}`;
}

export type KnobProps = {
  spec: ParamSpec;
  value: number;
  onChange: (v: number) => void;
  onBegin?: () => void;
  accent?: string;
  size?: number;
  disabled?: boolean;
  label?: string;
};

/** Rotary knob: vertical drag (Shift = fine), wheel, arrow keys, double-click resets. */
export function Knob({ spec, value, onChange, onBegin, accent = "#22d3ee", size = 56, disabled, label }: KnobProps) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const range = spec.max - spec.min;
  const norm = Math.min(1, Math.max(0, (value - spec.min) / range));
  const defNorm = Math.min(1, Math.max(0, (spec.default - spec.min) / range));

  const quantize = useCallback(
    (v: number) => {
      const q = Math.round((v - spec.min) / spec.step) * spec.step + spec.min;
      return Math.min(spec.max, Math.max(spec.min, Number(q.toFixed(4))));
    },
    [spec],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
    onBegin?.();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const px = e.shiftKey ? 600 : 160; // pixels for full range
    const dv = ((drag.current.y - e.clientY) / px) * range;
    const next = quantize(drag.current.v + dv);
    if (next !== value) onChange(next);
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    onBegin?.();
    onChange(quantize(value + (e.deltaY < 0 ? 1 : -1) * spec.step * (e.shiftKey ? 1 : 4)));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    onBegin?.();
    onChange(quantize(value + dir * spec.step * (e.shiftKey ? 10 : 1)));
  };

  const r = size / 2 - 5;
  const c = size / 2;
  const angle = START + norm * SWEEP;
  const defAngle = START + defNorm * SWEEP;
  const tip = polar(c, c, r - 9, angle);
  const from = Math.min(angle, defAngle);
  const to = Math.max(angle, defAngle);

  return (
    <div className={`flex flex-col items-center gap-1 select-none ${disabled ? "opacity-40" : ""}`}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label ?? spec.label}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuenow={value}
        aria-valuetext={fmtParam(value, spec.unit)}
        title={`${spec.hint ? `${spec.hint} — ` : ""}drag, scroll or use arrow keys · double-click to reset`}
        className="relative cursor-ns-resize rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 touch-none"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          if (disabled) return;
          onBegin?.();
          onChange(spec.default);
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <path d={arc(c, c, r, START, START + SWEEP)} stroke="rgba(255,255,255,0.08)" strokeWidth={4} fill="none" strokeLinecap="round" />
          {to - from > 0.5 && (
            <path d={arc(c, c, r, from, to)} stroke={accent} strokeWidth={4} fill="none" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${accent}66)` }} />
          )}
          <circle cx={c} cy={c} r={r - 6} fill="#16161b" stroke="rgba(255,255,255,0.08)" />
          <line x1={c} y1={c} x2={tip.x} y2={tip.y} stroke="#e6eaf5" strokeWidth={2.5} strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-[10px] font-semibold text-white/70 leading-none">{label ?? spec.label}</span>
      <span className="text-[10px] tabular-nums leading-none" style={{ color: accent }}>
        {fmtParam(value, spec.unit)}
      </span>
    </div>
  );
}
