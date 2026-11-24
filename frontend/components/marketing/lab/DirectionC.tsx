import Link from "next/link";
import { ACCESS_HREF, STYLE_FAMILIES } from "@/lib/landing/content";
import s from "./DirectionC.module.css";

// Direction C: Instrument-grade minimal. Anodised-aluminium greys on an 8px
// grid. The only colour on the page lives in the meters.

const SEGMENTS = 28;
// dBFS label per segment band, top to bottom
const LADDER_LABELS = ["0", "−3", "−6", "−12", "−18", "−24", "−36"];

function Ladder({ level, label }: { level: number; label: string }) {
  return (
    <div className={s.ladder}>
      <div className={s.segments}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const fromBottom = SEGMENTS - i;
          const zone = fromBottom > SEGMENTS - 3 ? "clip" : fromBottom > SEGMENTS - 8 ? "warn" : "ok";
          const lit = fromBottom <= level;
          return (
            <span
              key={i}
              className={s.seg}
              data-zone={zone}
              data-lit={lit || undefined}
              style={lit ? { animationDelay: `${(fromBottom - 1) * 28}ms` } : undefined}
            />
          );
        })}
      </div>
      <span className={s.ladderLabel}>{label}</span>
    </div>
  );
}

export function DirectionC() {
  return (
    <div className={s.root}>
      <section className={s.hero} aria-labelledby="c-h1">
        <div className={s.wrap}>
          <div className={s.heroText}>
            <h1 id="c-h1" className={s.h1}>
              Release-ready masters for Indian music
            </h1>
            <p className={s.lede}>
              Kord listens to your track, chooses the processing, and keeps every setting inside limits set for
              classical, devotional, film, dance or indie. You get files ready for Spotify, Apple Music and broadcast.
            </p>
            <div className={s.actions}>
              <Link href={ACCESS_HREF} className={s.btnPrimary}>
                Request early access
              </Link>
              <a href="#c-styles" className={s.btnSecondary}>
                Hear the difference
              </a>
            </div>
          </div>

          <figure className={s.panel} aria-label="Loudness meter at the Spotify target">
            <div className={s.panelBar}>
              <span>Output</span>
              <span className={s.panelStyle}>Film and playback</span>
            </div>
            <div className={s.panelBody}>
              <div className={s.meters}>
                <div className={s.scaleCol} aria-hidden="true">
                  {LADDER_LABELS.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </div>
                <Ladder level={23} label="L" />
                <Ladder level={22} label="R" />
              </div>
              <dl className={s.readouts}>
                <div className={s.readBig}>
                  <dt>Integrated</dt>
                  <dd>
                    −14.0<small>LUFS</small>
                  </dd>
                </div>
                <div>
                  <dt>True peak ceiling</dt>
                  <dd>
                    −1.0<small>dBTP</small>
                  </dd>
                </div>
                <div>
                  <dt>Style window</dt>
                  <dd>
                    −12 to −10<small>LUFS</small>
                  </dd>
                </div>
              </dl>
            </div>
          </figure>
        </div>
      </section>

      <section id="c-styles" className={s.styles} aria-labelledby="c-h2">
        <div className={s.wrap}>
          <h2 id="c-h2" className={s.h2}>
            Five styles, five sets of limits
          </h2>
          <p className={s.sub}>
            The AI picks the processing. These limits decide how far it is allowed to go, and they are fixed in code
            for every style.
          </p>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">Style</th>
                  <th scope="col">Loudness window</th>
                  <th scope="col">Max ratio</th>
                  <th scope="col">Attack floor</th>
                  <th scope="col">Release floor</th>
                  <th scope="col">Protects</th>
                </tr>
              </thead>
              <tbody>
                {STYLE_FAMILIES.map((f) => {
                  const lo = ((f.lufs[0] + 18) / 12) * 100;
                  const hi = ((f.lufs[1] + 18) / 12) * 100;
                  return (
                    <tr key={f.key}>
                      <th scope="row">{f.name}</th>
                      <td data-label="Loudness window">
                        <span className={s.win}>
                          <span className={s.winBar} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                        </span>
                        <span className={s.num}>
                          {f.lufs[0]} to {f.lufs[1]} LUFS
                        </span>
                      </td>
                      <td data-label="Max ratio" className={s.num}>
                        {f.maxRatio ? `${f.maxRatio}:1` : "No extra cap"}
                      </td>
                      <td data-label="Attack floor" className={s.num}>
                        {f.minAttackMs} ms
                      </td>
                      <td data-label="Release floor" className={s.num}>
                        {f.minReleaseMs} ms
                      </td>
                      <td data-label="Protects">{f.protects}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
