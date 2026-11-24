import Link from "next/link";
import { ACCESS_HREF, STYLE_FAMILIES } from "@/lib/landing/content";
import s from "./DirectionA.module.css";

// Direction A: Analog studio. Warm console faceplate, lamp-lit VU meter,
// editorial serif for words, mono only for measured numbers.

// VU scale: value -> needle angle (deg). Spacing follows a real VU face,
// where 0 VU sits about two thirds of the way across.
// Empty label = tick only (keeps the crowded 0 VU region readable).
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
  return { x: 150 + r * Math.cos(a), y: 168 + r * Math.sin(a) };
}

function VuMeter() {
  return (
    <svg viewBox="0 0 300 190" className={s.vu} role="img" aria-label="VU meter settling just above 0 VU">
      <rect x="0" y="0" width="300" height="190" rx="6" className={s.vuFace} />
      {/* red zone arc */}
      <path
        d={(() => {
          const a = polar(16, 118);
          const b = polar(46, 118);
          return `M ${a.x} ${a.y} A 118 118 0 0 1 ${b.x} ${b.y}`;
        })()}
        className={s.vuRed}
      />
      <path
        d={(() => {
          const a = polar(-50, 118);
          const b = polar(16, 118);
          return `M ${a.x} ${a.y} A 118 118 0 0 1 ${b.x} ${b.y}`;
        })()}
        className={s.vuArc}
      />
      {VU_TICKS.map(([label, deg, red], i) => {
        const o = polar(deg, 118);
        const inner = polar(deg, 106);
        const t = polar(deg, 132);
        return (
          <g key={i}>
            <line x1={inner.x} y1={inner.y} x2={o.x} y2={o.y} className={red ? s.tickRed : s.tick} />
            <text x={t.x} y={t.y} className={red ? s.tickLabelRed : s.tickLabel} textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}
      <text x="150" y="120" textAnchor="middle" className={s.vuMark}>
        VU
      </text>
      <g className={s.needle}>
        <line x1="150" y1="168" x2="150" y2="40" />
      </g>
      <rect x="110" y="158" width="80" height="32" className={s.vuHub} />
    </svg>
  );
}

export function DirectionA() {
  return (
    <div className={s.root}>
      <section className={s.hero} aria-labelledby="a-h1">
        <div className={s.wrap}>
          <div className={s.heroText}>
            <h1 id="a-h1" className={s.h1}>
              Release-ready masters for Indian music.
            </h1>
            <p className={s.lede}>
              Kord masters classical, devotional, film, dance and indie tracks the way each one is meant to sound. Upload
              a WAV or a phone recording and get files ready for Spotify and Apple Music.
            </p>
            <div className={s.actions}>
              <Link href={ACCESS_HREF} className={s.btnPrimary}>
                Request early access
              </Link>
              <a href="#a-styles" className={s.btnSecondary}>
                Hear the difference
              </a>
            </div>
          </div>

          <div className={s.faceplate}>
            <span className={s.screw} data-pos="tl" />
            <span className={s.screw} data-pos="tr" />
            <span className={s.screw} data-pos="bl" />
            <span className={s.screw} data-pos="br" />
            <VuMeter />
            <dl className={s.readouts}>
              <div>
                <dt>Spotify master</dt>
                <dd>
                  −14.0 <abbr title="loudness units relative to full scale">LUFS</abbr>
                </dd>
              </div>
              <div>
                <dt>Peak ceiling</dt>
                <dd>
                  −1.0 <abbr title="decibels true peak">dBTP</abbr>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section id="a-styles" className={s.styles} aria-labelledby="a-h2">
        <div className={s.wrap}>
          <h2 id="a-h2" className={s.h2}>
            Five mastering styles, each set for a different kind of Indian music
          </h2>
          <p className={s.sub}>
            Each style sets its own loudness window and limits on compression, so a bhajan is never pushed as hard as
            a dance track.
          </p>
          <ul className={s.strips}>
            {STYLE_FAMILIES.map((f) => {
              const lo = ((f.lufs[0] + 18) / 12) * 100;
              const hi = ((f.lufs[1] + 18) / 12) * 100;
              return (
                <li key={f.key} className={s.strip}>
                  <span className={s.tape}>{f.name}</span>
                  <div
                    className={s.fader}
                    style={{ ["--lo" as string]: `${lo}%`, ["--hi" as string]: `${hi}%` }}
                    aria-label={`Loudness window ${f.lufs[0]} to ${f.lufs[1]} LUFS`}
                    role="img"
                  >
                    <span className={s.faderWindow} />
                    <span className={s.faderCap} />
                  </div>
                  <p className={s.lufs}>
                    {f.lufs[0]} to {f.lufs[1]} LUFS
                  </p>
                  <p className={s.stripText}>{f.line}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
