"use client";

import { useMemo } from "react";
import {
  DESK_CHANNELS,
  DESK_MAX,
  DESK_MIN,
  STYLE_DESK_START,
  deskEqAt,
  hasTweaks,
  loudnessTarget,
  type Desk,
  type DeskKey,
  type DeskTweaks,
} from "@/lib/desk";
import { STYLE_FAMILIES } from "@/lib/landing/content";
import s from "./mastering-desk.module.css";

const W = 600;
const H = 110;
const F_MIN = 20;
const F_MAX = 20000;
const DB_RANGE = 2; // ±2 dB fills the height; desk EQ moves are at most ±1.5 dB

const xOf = (f: number) => (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * W;
const yOf = (db: number) => H / 2 - (db / DB_RANGE) * (H / 2 - 6);

function EqCurve({ desk }: { desk: Desk }) {
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const f = F_MIN * (F_MAX / F_MIN) ** (i / 120);
      pts.push(`${xOf(f).toFixed(1)},${yOf(deskEqAt(desk, f)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [desk]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.curve} role="img"
      aria-label={`EQ move from the desk: low end ${(desk.low * 0.3).toFixed(1)} dB, vocal ${(desk.mids * 0.3).toFixed(1)} dB, air ${(desk.air * 0.3).toFixed(1)} dB`}
    >
      {[100, 1000, 10000].map((f) => (
        <line key={f} x1={xOf(f)} x2={xOf(f)} y1={0} y2={H} className={s.grid} />
      ))}
      <line x1={0} x2={W} y1={yOf(0)} y2={yOf(0)} className={s.zero} />
      <polygon points={`0,${yOf(0)} ${path} ${W},${yOf(0)}`} className={s.fill} />
      <polyline points={path} className={s.line} />
      {[
        [100, "100"],
        [1000, "1k"],
        [10000, "10k"],
      ].map(([f, l]) => (
        <text key={l} x={xOf(Number(f)) + 4} y={H - 4} className={s.freq}>
          {l} Hz
        </text>
      ))}
    </svg>
  );
}

function LoudnessMeter({ desk, style }: { desk: Desk; style: string }) {
  const fam = STYLE_FAMILIES.find((f) => f.key === style);
  const scaleLo = -18;
  const scaleHi = -6;
  const pct = (lufs: number) => ((scaleHi - lufs) / (scaleHi - scaleLo)) * 100;
  const target = loudnessTarget(desk.loudness, style);
  return (
    <div className={s.meter}>
      <span className={s.meterLabel}>Loudness</span>
      <div className={s.meterTrack} aria-hidden="true">
        {fam && (
          <span className={s.meterWindow} style={{ top: `${pct(fam.lufs[1])}%`, height: `${pct(fam.lufs[0]) - pct(fam.lufs[1])}%` }} />
        )}
        {target != null && <span className={s.meterMark} style={{ top: `${pct(target)}%` }} />}
      </div>
      <span className={s.meterValue}>
        {target != null ? `${target.toFixed(1)}` : fam ? `${fam.lufs[0]}…${fam.lufs[1]}` : "Kord"}
      </span>
    </div>
  );
}

/**
 * The creative desk. Each channel shows the applied value (style start + the
 * artist's tweak). Editing is for Early Access and Admin; everyone else sees
 * the desk follow the chosen style.
 */
export function MasteringDesk({
  style,
  desk,
  tweaks,
  editable,
  disabled,
  onChange,
  onReset,
  onUnlock,
}: {
  style: string;
  desk: Desk;
  tweaks: DeskTweaks;
  editable: boolean;
  disabled?: boolean;
  onChange: (key: DeskKey, value: number) => void;
  onReset: () => void;
  onUnlock: () => void;
}) {
  const start = STYLE_DESK_START[style] ?? {};
  const tweaked = hasTweaks(tweaks);
  const pos = (v: number) => ((DESK_MAX - v) / (DESK_MAX - DESK_MIN)) * 100;

  return (
    <section className={`${s.desk} ${editable ? "" : s.locked}`} aria-labelledby="desk-title">
      <div className={s.head}>
        <div>
          <h3 id="desk-title" className={s.title}>Mastering desk</h3>
          <p className={s.note}>
            {editable
              ? "The style sets where the faders start. Push them to taste; Kord still keeps every move inside safe limits."
              : "The style sets these faders and they are applied to your master. Shaping them yourself comes with Early Access."}
          </p>
        </div>
        <div className={s.headActions}>
          {editable ? (
            <button type="button" className={s.textBtn} onClick={onReset} disabled={!tweaked || disabled}>
              Reset to style
            </button>
          ) : (
            <button type="button" className={s.lockBtn} onClick={onUnlock}>
              Shape with Early Access
            </button>
          )}
        </div>
      </div>

      <div className={s.top}>
        <div className={s.curveWrap}>
          <span className={s.curveLabel}>EQ move from the desk</span>
          <EqCurve desk={desk} />
        </div>
        <LoudnessMeter desk={desk} style={style} />
      </div>

      <div className={s.strips}>
        {DESK_CHANNELS.map((ch) => {
          const v = desk[ch.key];
          const isTweaked = (tweaks[ch.key] ?? 0) !== 0;
          const top = pos(v);
          const zero = pos(0);
          const readout = ch.readout(v, style);
          return (
            <div key={ch.key} className={s.strip} data-tweaked={isTweaked || undefined}>
              <span className={s.chLabel} id={`desk-${ch.key}`}>{ch.label}</span>
              <span className={s.chHint}>{ch.hint}</span>
              <div className={s.track}>
                <span className={s.rail} />
                <span className={s.ticks} aria-hidden="true">
                  {Array.from({ length: 11 }, (_, i) => (
                    <span key={i} data-zero={i === 5 || undefined} />
                  ))}
                </span>
                <span className={s.level} style={{ top: `${Math.min(top, zero)}%`, height: `${Math.abs(top - zero)}%` }} />
                <span className={s.cap} style={{ top: `${top}%` }} />
                <input
                  type="range"
                  className={s.input}
                  min={DESK_MIN}
                  max={DESK_MAX}
                  step={1}
                  value={v}
                  disabled={!editable || disabled}
                  aria-labelledby={`desk-${ch.key}`}
                  aria-valuetext={`${v > 0 ? "+" : ""}${v}, ${readout}${(start[ch.key] ?? 0) !== 0 ? `, style starts at ${start[ch.key]}` : ""}`}
                  onChange={(e) => onChange(ch.key, Number(e.target.value))}
                />
              </div>
              <span className={s.readout}>{readout}</span>
            </div>
          );
        })}
      </div>

      <p className={s.foot}>
        These are nudges on top of Kord&apos;s own plan for your track, not a full manual EQ. The safety layer still caps
        every value for the style you picked.
      </p>
    </section>
  );
}
