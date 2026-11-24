import Link from "next/link";
import { ACCESS_HREF, STYLE_FAMILIES } from "@/lib/landing/content";
import { HERO_PEAKS } from "@/lib/landing/hero-peaks";
import s from "./DirectionB.module.css";

// Direction B: Indian editorial. Two inks on paper, the way hand-painted
// cinema boards and letterpress labels work: a turmeric field, ink black and
// one rani pink. Condensed heavy display, a real waveform as the hero image.

const W = 960;
const H = 220;
const PLAYED = 0.38;

function Waveform() {
  const n = HERO_PEAKS.length;
  const step = W / n;
  const bar = step * 0.62;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={s.wave} aria-hidden="true">
      {HERO_PEAKS.map((p, i) => {
        const h = Math.max(2, p * (H - 8));
        return (
          <rect
            key={i}
            x={i * step}
            y={(H - h) / 2}
            width={bar}
            height={h}
            className={i / n < PLAYED ? s.played : s.unplayed}
          />
        );
      })}
      <rect x={W * PLAYED - 1} y="0" width="3" height={H} className={s.playhead} />
    </svg>
  );
}

export function DirectionB() {
  return (
    <div className={s.root}>
      <section className={s.hero} aria-labelledby="b-h1">
        <div className={s.wrap}>
          <h1 id="b-h1" className={s.h1}>
            Release-ready masters for Indian music
          </h1>
          <div className={s.heroFoot}>
            <p className={s.lede}>
              Classical, devotional, film, dance and indie, each mastered the way it is meant to sound. Send a WAV or a
              phone recording; get back files ready for Spotify (−14 LUFS) and Apple Music (−16 LUFS).
            </p>
            <div className={s.actions}>
              <Link href={ACCESS_HREF} className={s.btnPrimary}>
                Request early access
              </Link>
              <a href="#b-styles" className={s.btnSecondary}>
                Hear the difference
              </a>
            </div>
          </div>
        </div>
        <Waveform />
      </section>

      <section id="b-styles" className={s.styles} aria-labelledby="b-h2">
        <div className={s.wrap}>
          <div className={s.stylesHead}>
            <h2 id="b-h2" className={s.h2}>
              A bhajan is not mastered like a Punjabi dance track
            </h2>
            <p className={s.sub}>
              Pick the style closest to your song. Each one sets its own loudness window and how hard the compressor
              may work.
            </p>
          </div>

          <div className={s.scale} aria-hidden="true">
            {[-18, -15, -12, -9, -6].map((v) => (
              <span key={v} style={{ left: `${((v + 18) / 12) * 100}%` }}>
                {v}
              </span>
            ))}
          </div>
          <ul className={s.rows}>
            {STYLE_FAMILIES.map((f) => {
              const lo = ((f.lufs[0] + 18) / 12) * 100;
              const hi = ((f.lufs[1] + 18) / 12) * 100;
              return (
                <li key={f.key} className={s.row}>
                  <h3 className={s.name}>{f.name}</h3>
                  <p className={s.line}>{f.line}</p>
                  <div className={s.range}>
                    <div className={s.track}>
                      <span className={s.window} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                    </div>
                    <span className={s.rangeLabel}>
                      {f.lufs[0]} to {f.lufs[1]} LUFS
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
