import { HERO_PEAKS } from "@/lib/landing/hero-peaks";
import s from "./landing.module.css";

// VU face: label -> needle angle. 0 VU sits about two thirds across, as on a
// real meter. Empty labels are ticks only, to keep the 0 VU region readable.
const VU_TICKS: [string, number, boolean][] = [
  ["20", -48, false],
  ["10", -30, false],
  ["7", -20, false],
  ["5", -12, false],
  ["3", -3, false],
  ["", 3, false],
  ["1", 9, false],
  ["0", 16, true],
  ["", 25, true],
  ["2", 34, true],
  ["3", 44, true],
];

function polar(deg: number, r: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: +(150 + r * Math.cos(a)).toFixed(2), y: +(168 + r * Math.sin(a)).toFixed(2) };
}

function arc(from: number, to: number, r: number) {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
}

export function VuMeter() {
  return (
    <figure className={s.meter}>
      <svg viewBox="0 0 300 180" className={s.vu} role="img" aria-label="VU meter settling at 0 VU">
        <path d={arc(-50, 16, 118)} className={s.vuArc} />
        <path d={arc(16, 46, 118)} className={s.vuRed} />
        {VU_TICKS.map(([label, deg, red], i) => {
          const o = polar(deg, 118);
          const inner = polar(deg, 105);
          const t = polar(deg, 133);
          return (
            <g key={i}>
              <line x1={inner.x} y1={inner.y} x2={o.x} y2={o.y} className={red ? s.tickRed : s.tick} />
              {label && (
                <text x={t.x} y={t.y} className={red ? s.tickLabelRed : s.tickLabel} textAnchor="middle">
                  {label}
                </text>
              )}
            </g>
          );
        })}
        <text x="150" y="118" textAnchor="middle" className={s.vuMark}>
          VU
        </text>
        <g className={s.needle}>
          <line x1="150" y1="168" x2="150" y2="42" />
        </g>
        <rect x="118" y="160" width="64" height="20" className={s.vuHub} />
      </svg>
      <dl className={s.readouts}>
        <div>
          <dt>Spotify version</dt>
          <dd className={s.mono}>
            −14.0<small>LUFS</small>
          </dd>
        </div>
        <div>
          <dt>Peak ceiling</dt>
          <dd className={s.mono}>
            −1.0<small>dBTP</small>
          </dd>
        </div>
      </dl>
    </figure>
  );
}

const W = 960;
const H = 200;
const PLAYED = 0.38;

export function HeroWaveform() {
  const n = HERO_PEAKS.length;
  const step = W / n;
  const bar = +(step * 0.62).toFixed(2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.wave} aria-hidden="true">
      {HERO_PEAKS.map((p, i) => {
        const h = Math.max(2, p * (H - 8));
        return (
          <rect
            key={i}
            x={+(i * step).toFixed(2)}
            y={+((H - h) / 2).toFixed(2)}
            width={bar}
            height={+h.toFixed(2)}
            className={i / n < PLAYED ? s.played : s.unplayed}
          />
        );
      })}
    </svg>
  );
}
