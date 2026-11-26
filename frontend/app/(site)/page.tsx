import type { Metadata } from "next";
import { BeforeAfterPlayer } from "@/components/marketing/BeforeAfterPlayer";
import { HeroWaveform, VuMeter } from "@/components/marketing/HeroArt";
import { SiteFooter, SiteHeader } from "@/components/marketing/SiteChrome";
import { StudioCta } from "@/components/marketing/StudioCta";
import s from "@/components/marketing/landing.module.css";
import { availableAudioPairs } from "@/lib/landing/audio-pairs";
import { APP_TITLE, SITE_URL, STYLE_FAMILIES } from "@/lib/landing/content";
import { FAQS } from "@/lib/landing/faq";

export const dynamic = "force-static";

const TITLE = APP_TITLE;
// Keep under 160 characters (search snippets cut off after that).
const DESCRIPTION =
  "Release-ready AI mastering for Indian music: classical, devotional, film, dance and indie. Upload a WAV or phone recording for Spotify and Apple Music.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Kord Studio",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const STEPS = [
  {
    title: "Upload",
    text: "Send a WAV, FLAC or AIFF, or a phone recording. Kord converts it to 24-bit audio and notes whether it came from a compressed format.",
  },
  {
    title: "Analysis",
    text: "Kord measures loudness, dynamics, tonal balance and stereo width, and estimates the genre and mood of the track.",
  },
  {
    title: "AI decides the direction",
    text: "A language model reads those measurements, never the audio itself, and describes what the master needs: more warmth, less harshness, how loud.",
  },
  {
    title: "Safety layer sets the numbers",
    text: "Fixed rules turn that description into real settings and keep each one inside the limits of your chosen style. The AI cannot override them.",
    key: true,
  },
  {
    title: "Release-ready files",
    text: "You get a lossless master plus versions levelled for Spotify, Apple Music, club play and broadcast.",
  },
];

function JsonLd() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Kord Studio",
      applicationCategory: "AudioApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: DESCRIPTION,
      publisher: { "@type": "Organization", name: "Syntalix LLP" },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Syntalix LLP",
      url: SITE_URL,
      brand: { "@type": "Brand", name: "Kord" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
  return (
    <script
      type="application/ld+json"
      // Static, build-time JSON from our own constants.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

function lufsPct(v: number) {
  return ((v + 18) / 12) * 100;
}

export default function LandingPage() {
  const pairs = availableAudioPairs();
  const hasListen = pairs.length > 0;

  return (
    <>
      <JsonLd />
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <SiteHeader listen={hasListen} />

      <main id="main">
        {/* Hero */}
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.wrap}>
            <div className={s.heroGrid}>
              <div>
                <h1 id="hero-title" className={s.h1}>
                  Release-ready masters for Indian music
                </h1>
                <div className={s.heroFoot}>
                  <p className={s.lede}>
                    Classical, devotional, film, dance and indie, each mastered the way it is meant to sound. Send a WAV
                    or a phone recording; get back files ready for Spotify and Apple Music.
                  </p>
                </div>
                <div className={s.actions} style={{ marginTop: "1.75rem" }}>
                  <StudioCta className={s.btn} />
                  {hasListen && (
                    <a href="#listen" className={s.btnGhost}>
                      Hear the difference
                    </a>
                  )}
                </div>
              </div>
              <VuMeter />
            </div>
          </div>
          <HeroWaveform />
        </section>

        {/* Before / after: only rendered when at least one example exists (lib/landing/audio-pairs.ts). */}
        {hasListen && (
          <section id="listen" className={`${s.section} ${s.onInk}`} aria-labelledby="listen-title">
            <div className={s.wrap}>
              <div className={s.sectionHead}>
                <h2 id="listen-title" className={s.h2}>
                  Hear the same song before and after Kord
                </h2>
                <p className={s.sub}>
                  Switch between the two at any moment and playback stays in the same place. Match loudness to judge
                  the sound itself, not just the volume.
                </p>
              </div>
              <BeforeAfterPlayer pairs={pairs} />
            </div>
          </section>
        )}

        {/* Styles */}
        <section id="styles" className={s.section} aria-labelledby="styles-title">
          <div className={s.wrap}>
            <div className={`${s.sectionHead} ${s.stacked}`}>
              <h2 id="styles-title" className={s.h2}>
                A bhajan is not mastered like a Punjabi dance track
              </h2>
              <p className={s.sub}>
                Pick the style closest to your song. Each one has its own loudness window and its own limits on how
                hard the compressor may work, fixed in code.
              </p>
            </div>
            <p className={s.mobileScale}>Each bar sits on a scale from −18 LUFS (quieter) to −6 LUFS (louder).</p>
            <table className={s.table}>
              <caption className="sr-only">Mastering styles and their limits</caption>
              <thead>
                <tr>
                  <th scope="col" className={s.colStyle}>
                    Style
                  </th>
                  <th scope="col" className={s.colWin}>
                    Loudness window (LUFS)
                    <span className={`${s.axis} ${s.mono}`} aria-hidden="true">
                      {[-18, -14, -10, -6].map((v) => (
                        <span key={v} style={{ left: `${lufsPct(v)}%` }}>
                          {v}
                        </span>
                      ))}
                    </span>
                  </th>
                  <th scope="col">Max ratio</th>
                  <th scope="col">Attack at least</th>
                  <th scope="col">Release at least</th>
                </tr>
              </thead>
              <tbody>
                {STYLE_FAMILIES.map((f) => (
                  <tr key={f.key}>
                    <th scope="row">
                      <span className={s.styleName}>{f.name}</span>
                      <span className={s.styleLine}>{f.line}</span>
                    </th>
                    <td data-label="Loudness">
                      <span>
                        <span className={s.win} aria-hidden="true">
                          <span
                            className={s.winBar}
                            style={{ left: `${lufsPct(f.lufs[0])}%`, width: `${lufsPct(f.lufs[1]) - lufsPct(f.lufs[0])}%` }}
                          />
                        </span>
                        <span className={`${s.mono} ${s.cellNum}`}>
                          {f.lufs[0]} to {f.lufs[1]}
                        </span>
                      </span>
                    </td>
                    <td data-label="Max ratio" className={`${s.mono} ${s.cellNum}`}>
                      {f.maxRatio ? `${f.maxRatio}:1` : "No cap"}
                    </td>
                    <td data-label="Attack at least" className={`${s.mono} ${s.cellNum}`}>
                      {f.minAttackMs} ms
                    </td>
                    <td data-label="Release at least" className={`${s.mono} ${s.cellNum}`}>
                      {f.minReleaseMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={s.tableNote}>
              Max ratio is how hard the compressor may squeeze the loudest moments. Attack and release are how quickly
              it reacts and lets go; longer times keep strokes and drones natural.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className={`${s.section} ${s.onInk}`} aria-labelledby="how-title">
          <div className={s.wrap}>
            <div className={s.sectionHead}>
              <h2 id="how-title" className={s.h2}>
                From upload to release files in five steps
              </h2>
              <p className={s.sub}>
                The AI makes the musical decisions. A fixed set of rules makes sure none of them can damage your track.
              </p>
            </div>
            <ol className={s.chain}>
              {STEPS.map((st) => (
                <li key={st.title} className={s.step} data-key={st.key ? "true" : undefined}>
                  <h3 className={s.stepTitle}>{st.title}</h3>
                  <p className={s.stepText}>{st.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Blind test */}
        <section className={`${s.section} ${s.onRani}`} aria-labelledby="test-title">
          <div className={s.wrap}>
            <h2 id="test-title" className={s.statement}>
              In an informal blind listening test, five working producers preferred Kord&rsquo;s masters over four
              popular AI mastering services.
            </h2>
            {/* TODO(soujash): add the blind-test details to the method note: date, which tracks/genres, and whether
                the masters were loudness-matched. Do not name the other services. */}
            <p className={s.method}>
              How it was run: each producer heard the same songs mastered by all five services, without knowing which
              service made which master, and ranked them.
            </p>
          </div>
        </section>

        {/* Early access */}
        <section className={s.section} aria-labelledby="access-title">
          <div className={`${s.wrap} ${s.access}`}>
            <h2 id="access-title" className={s.h2}>
              Kord is in early access, and we onboard every artist ourselves
            </h2>
            <div className={s.accessText}>
              <p>
                Tell us a little about your music. We get in touch personally to set up your account, so Kord works
                well for your songs from the first upload.
              </p>
              <p>We read every request ourselves and reply within 48 hours.</p>
              <StudioCta className={s.btn} />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`${s.section} ${s.ruled}`} aria-labelledby="faq-title">
          <div className={s.wrap}>
            <h2 id="faq-title" className={s.h2}>
              Questions artists ask us
            </h2>
            <div className={s.faqList}>
              {FAQS.map((f) => (
                <details key={f.q} className={s.faqItem}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={`${s.section} ${s.onTurmeric}`} aria-labelledby="close-title">
          <div className={`${s.wrap} ${s.close}`}>
            <h2 id="close-title" className={s.closeTitle}>
              Your next release, mastered for how it should sound
            </h2>
            <StudioCta className={s.btn} />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
