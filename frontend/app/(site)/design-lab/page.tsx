import type { Metadata } from "next";
import { Anek_Latin, Archivo, IBM_Plex_Mono, JetBrains_Mono, Newsreader } from "next/font/google";
import { DirectionA } from "@/components/marketing/lab/DirectionA";
import { DirectionB } from "@/components/marketing/lab/DirectionB";
import { DirectionC } from "@/components/marketing/lab/DirectionC";
import s from "./lab.module.css";

// Internal review page: three directions for the public landing page.
// Delete this route once a direction is chosen and shipped.

const newsreader = Newsreader({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--f-news",
  adjustFontFallback: false,
  fallback: ["Georgia", "serif"],
  display: "swap",
});
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--f-jbm", display: "swap" });
const anek = Anek_Latin({ subsets: ["latin"], axes: ["wdth"], variable: "--f-anek", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--f-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-plexmono", display: "swap" });

export const metadata: Metadata = {
  title: "Design lab | Kord",
  robots: { index: false, follow: false },
};

export const dynamic = "force-static";

const DIRECTIONS = [
  {
    id: "a",
    name: "Analog studio",
    note: "Warm console faceplate, a lamp-lit VU meter whose needle settles once on load, Newsreader for words and JetBrains Mono only for measured numbers. Styles shown as channel strips with tape labels and a fader marking each loudness window.",
    Comp: DirectionA,
  },
  {
    id: "b",
    name: "Indian editorial",
    note: "Two inks on paper, borrowed from hand-painted cinema boards and letterpress labels: a turmeric field, ink black, one rani pink. Anek Latin condensed at poster size, and the hero image is a real waveform (peaks from a local test upload). Styles as printed rows on a shared LUFS axis.",
    Comp: DirectionB,
  },
  {
    id: "c",
    name: "Instrument-grade",
    note: "Anodised-aluminium greys on an 8px grid; the only colour is in the meters, which light up once on load. Archivo semi-expanded with IBM Plex Mono for readouts. Styles shown as the real parameter table from the safety layer.",
    Comp: DirectionC,
  },
];

export default function DesignLabPage() {
  return (
    <div className={`${newsreader.variable} ${jetbrains.variable} ${anek.variable} ${archivo.variable} ${plexMono.variable}`}>
      <header className={s.bar}>
        <p className={s.barTitle}>Kord landing: design lab</p>
        <nav aria-label="Directions" className={s.barNav}>
          {DIRECTIONS.map((d) => (
            <a key={d.id} href={`#dir-${d.id}`}>
              {d.id.toUpperCase()} {d.name}
            </a>
          ))}
        </nav>
      </header>
      <main>
        {DIRECTIONS.map(({ id, name, note, Comp }) => (
          <article key={id} id={`dir-${id}`} className={s.direction} aria-label={`Direction ${id.toUpperCase()}: ${name}`}>
            <div className={s.label}>
              <p>
                <strong>
                  Direction {id.toUpperCase()}: {name}.
                </strong>{" "}
                {note}
              </p>
            </div>
            <Comp />
          </article>
        ))}
      </main>
    </div>
  );
}
