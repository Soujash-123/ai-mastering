import { HERO_PEAKS } from "@/lib/landing/hero-peaks";
import s from "./auth.module.css";

const W = 960;
const H = 160;
const PLAYED = 0.38;

function Waveform() {
  const n = HERO_PEAKS.length;
  const step = W / n;
  const bar = +(step * 0.62).toFixed(2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={160} aria-hidden="true">
      {HERO_PEAKS.map((p, i) => {
        const h = Math.max(2, p * (H - 6));
        return (
          <rect
            key={i}
            x={+(i * step).toFixed(2)}
            y={+((H - h) / 2).toFixed(2)}
            width={bar}
            height={+h.toFixed(2)}
            style={{ fill: i / n < PLAYED ? "rgb(var(--k-second))" : "rgb(var(--k-ink))" }}
          />
        );
      })}
    </svg>
  );
}

/** Two-panel frame shared by login, signup and access-request. */
export function AuthFrame({
  title,
  line,
  children,
}: {
  title: string;
  line: string;
  children: React.ReactNode;
}) {
  return (
    <div className={s.frame}>
      <section className={s.poster} aria-label="Kord">
        <div>
          <p className={s.posterTitle}>{title}</p>
          <p className={s.posterLine}>{line}</p>
        </div>
        <Waveform />
      </section>
      <div className={s.panel}>
        <div className={s.panelInner}>{children}</div>
      </div>
    </div>
  );
}
