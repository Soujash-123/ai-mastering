"use client";

import { DESK_CHANNELS, type Desk, type DeskKey } from "@/lib/desk";
import s from "./live-desk.module.css";

/** Sent once (per version) over /ws/jobs/{id} as {type: "live_view", ...}. */
export type LiveView = {
  version: number;
  duration: number;
  peaks: number[];
  sections: { label: string; start: number; end: number; comp?: number; sat?: number; width?: number; exciter?: number }[];
  params?: Record<string, number>;
  desk?: Desk;
  tweaks?: Partial<Desk> | null;
  style?: string;
};

type SectionKey = "comp" | "sat" | "width" | "exciter";

type Module = {
  stage: string; // backend memory_step name
  name: string;
  /** Section-dependent amount, if this stage varies by section. */
  section?: { key: SectionKey; label: string };
  values: (p: Record<string, number>) => [string, string][];
};

const pct = (v?: number) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const db = (v?: number) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`);
const ratio = (v?: number) => (v == null ? "—" : `${v.toFixed(1)}:1`);

const MODULES: Module[] = [
  { stage: "mastering.tonal_eq", name: "EQ", values: (p) => [["Low", db(p.low_shelf_db)], ["Mid", db(p.mid_peak_db)], ["High", db(p.high_shelf_db)]] },
  { stage: "mastering.dynamic_eq_resonance", name: "Dynamic EQ", values: (p) => [["Strength", pct(p.dynamic_eq_strength)], ["Harshness", pct(p.resonance_suppression)]] },
  { stage: "mastering.low_end", name: "Low end", values: (p) => [["Mono sub", pct(p.sub_mono_strength)]] },
  {
    stage: "mastering.multiband_compress",
    name: "Compression",
    section: { key: "comp", label: "compression" },
    values: (p) => [["Low", ratio(p.low_ratio)], ["Mid", ratio(p.mid_ratio)], ["High", ratio(p.high_ratio)], ["Attack", `${Math.round(p.mb_attack_ms ?? 0)} ms`], ["Release", `${Math.round(p.mb_release_ms ?? 0)} ms`]],
  },
  { stage: "mastering.perceptual_density", name: "Density", values: (p) => [["Fill", pct(p.perceptual_density)]] },
  {
    stage: "mastering.harmonic_engine",
    name: "Harmonics",
    section: { key: "sat", label: "saturation" },
    values: (p) => [["Saturation", pct(p.saturation_amount)], ["Low", pct(p.harmonic_low)], ["Mid", pct(p.harmonic_mid)], ["High", pct(p.harmonic_high)]],
  },
  { stage: "mastering.exciter", name: "Exciter", section: { key: "exciter", label: "exciter" }, values: (p) => [["Air", pct(p.exciter_amount)]] },
  { stage: "mastering.stereo", name: "Stereo", section: { key: "width", label: "width" }, values: (p) => [["Width", p.stereo_width_factor == null ? "—" : `×${p.stereo_width_factor.toFixed(2)}`]] },
  { stage: "mastering.soft_clip", name: "Soft clip", values: (p) => [["Drive", pct(p.clip_drive)]] },
  { stage: "mastering.limiter", name: "Limiter", values: (p) => [["Drive", pct(p.limiter_drive)], ["Ceiling", p.true_peak_ceiling_db == null ? "—" : `${p.true_peak_ceiling_db.toFixed(1)} dBTP`]] },
  { stage: "mastering.transient_reconstruct", name: "Transients", values: (p) => [["Blend", pct(p.transient_blend)], ["Restore", pct(p.transient_restore)]] },
  { stage: "mastering.loudness_normalize", name: "Loudness", values: (p) => [["Target", p.target_lufs == null ? "—" : `${p.target_lufs.toFixed(1)} LUFS`]] },
];

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Which pipeline moment we are in, from backend stage + status. */
function locate(stage: string, status: string): { active: number; allDone: boolean; label: string } {
  if (status === "exporting" || status === "completed" || stage === "mastering.write_output" || stage.startsWith("export")) {
    return { active: -1, allDone: true, label: "Writing your files" };
  }
  const i = MODULES.findIndex((m) => m.stage === stage);
  if (i >= 0) return { active: i, allDone: false, label: MODULES[i].name };
  if (stage === "mastering.load_audio" || stage === "mastering.build_plan" || stage === "mastering") {
    return { active: -1, allDone: false, label: "Loading your song into the chain" };
  }
  if (stage === "llm_strategy" || stage === "dsp_safety_mapping") return { active: -1, allDone: false, label: "Planning the chain" };
  return { active: -1, allDone: false, label: "Listening to your song" };
}

/**
 * Read-only live view of the DSP chain. Everything shown is real data from the
 * backend: the waveform and sections from analysis, the stage the engine is in
 * right now, the values each module uses, and the per-section amounts the
 * render applies. Every stage runs over the whole song; section-dependent
 * stages apply different amounts per section, drawn over each section.
 */
export function LiveDesk({ view, stage, status }: { view: LiveView; stage: string; status: string }) {
  const { active, allDone, label } = locate(stage, status);
  const mod = active >= 0 ? MODULES[active] : null;
  const params = view.params;
  const dur = view.duration || view.sections.at(-1)?.end || 1;
  const sectionKey = mod?.section?.key;

  const amounts = sectionKey ? view.sections.map((sec) => sec[sectionKey] ?? 1) : [];
  const minA = Math.min(0.8, ...amounts);
  const maxA = Math.max(1.25, ...amounts);

  const deskChips = view.desk
    ? DESK_CHANNELS.filter((c) => view.desk && view.desk[c.key] !== 0).map((c) => ({
        key: c.key as DeskKey,
        text: `${c.label} ${view.desk![c.key] > 0 ? "+" : ""}${view.desk![c.key]}`,
        yours: !!view.tweaks && (view.tweaks[c.key] ?? 0) !== 0,
      }))
    : [];

  return (
    <section className={s.wrap} aria-labelledby="live-title">
      <div className={s.head}>
        <h2 id="live-title" className={s.h2}>What Kord is doing to your song</h2>
        <p className={s.now} aria-live="polite">
          Now: <strong>{label}</strong>
        </p>
      </div>

      <div className={s.timeline}>
        <div className={s.wave} data-active={mod ? true : undefined} data-done={allDone || undefined} aria-hidden="true">
          {view.peaks.map((p, i) => (
            <span key={i} className={s.bar} style={{ height: `${Math.max(4, p * 100)}%` }} />
          ))}
        </div>
        {view.sections.length > 0 && (
          <div className={s.sections}>
            {view.sections.map((sec, i) => {
              const left = (sec.start / dur) * 100;
              const width = ((sec.end - sec.start) / dur) * 100;
              const a = sectionKey ? sec[sectionKey] : undefined;
              const h = a != null ? ((a - minA) / (maxA - minA)) * 100 : 0;
              return (
                <div key={`${sec.label}-${i}`} className={s.section} style={{ left: `${left}%`, width: `${width}%` }}>
                  {a != null && (
                    <>
                      <span className={s.amount} style={{ height: `calc((100% - 2.6rem) * ${Math.max(0.06, h / 100)})` }} />
                      {width > 11 && <span className={`${s.amountValue} ${s.mono}`}>×{a.toFixed(2)}</span>}
                    </>
                  )}
                  {width > 8 && <span className={s.sectionLabel}>{sec.label.replace("_", " ")}</span>}
                </div>
              );
            })}
          </div>
        )}
        <div className={`${s.axis} ${s.mono}`} aria-hidden="true">
          <span>0:00</span>
          <span>{fmt(dur)}</span>
        </div>
        <p className={s.caption}>
          {mod?.section ? (
            <>
              <strong>{mod.name}</strong> runs over the whole song, with a different amount of {mod.section.label} in
              each section (bars above).
            </>
          ) : mod ? (
            <>
              <strong>{mod.name}</strong> is applied evenly across the whole song.
            </>
          ) : allDone ? (
            <>Every stage has run over your song. Kord is writing the master and the files for each platform.</>
          ) : (
            <>Kord found {view.sections.length || "the"} sections in your song. The chain starts once the plan is ready.</>
          )}
        </p>
      </div>

      <div className={s.rack}>
        {MODULES.map((m, i) => {
          const state = allDone || (active >= 0 && i < active) ? "done" : i === active ? "active" : "waiting";
          return (
            <div key={m.stage} className={s.module} data-state={state}>
              <div className={s.moduleHead}>
                <span className={s.moduleName}>{m.name}</span>
                <span className={s.moduleState}>{state === "done" ? "Done" : state === "active" ? "Working" : ""}</span>
              </div>
              {params ? (
                <dl className={s.values}>
                  {m.values(params).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd className={s.mono}>{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className={s.values}>Waiting for the plan</p>
              )}
            </div>
          );
        })}
      </div>

      {deskChips.length > 0 && (
        <p className={s.desk}>
          <strong>Desk:</strong>{" "}
          {deskChips.map((c) => (
            <span key={c.key} className={s.chip} data-yours={c.yours || undefined}>
              {c.text}
            </span>
          ))}
          {deskChips.some((c) => c.yours) ? " Highlighted moves are yours; the rest come from the style." : " Set by the style you picked."}
        </p>
      )}
    </section>
  );
}
