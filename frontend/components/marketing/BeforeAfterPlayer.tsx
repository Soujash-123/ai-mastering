"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type WaveSurfer from "wavesurfer.js";
import type { AudioPair } from "@/lib/landing/audio-pairs";
import { resolve as resolveColor } from "@/lib/colors";
import s from "./landing.module.css";

type Side = "before" | "after";

type Engine = {
  ctx: AudioContext;
  media: Record<Side, HTMLAudioElement>;
  gain: Record<Side, GainNode>;
  ws: Record<Side, WaveSurfer>;
  rms: Partial<Record<Side, number>>;
};

const SIDES: Side[] = ["before", "after"];

function rmsOf(buf: AudioBuffer): number {
  let sum = 0;
  let count = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    // Every 4th sample is plenty for a level estimate and keeps phones fast.
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] * d[i];
      count++;
    }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function mb(bytes: number) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Before/after player. Nothing heavy loads until the visitor presses play:
 * then wavesurfer.js is imported, both files are fetched and decoded, and
 * the two tracks play in lockstep. A/B only swaps two gain nodes, so the
 * switch is instant and lands at the same position. "Match loudness"
 * turns the louder track down to the RMS level of the quieter one.
 */
export function BeforeAfterPlayer({ pairs }: { pairs: AudioPair[] }) {
  const [index, setIndex] = useState(0);
  const [side, setSide] = useState<Side>("after");
  const [matched, setMatched] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const engine = useRef<Engine | null>(null);
  const containers = useRef<Record<Side, HTMLDivElement | null>>({ before: null, after: null });
  const sideRef = useRef(side);
  const matchedRef = useRef(matched);

  const pair = pairs[index];

  const applyGains = useCallback((ramp = 0.012) => {
    const e = engine.current;
    if (!e) return;
    const { before, after } = e.rms;
    let comp: Record<Side, number> = { before: 1, after: 1 };
    if (matchedRef.current && before && after) {
      comp = before > after ? { before: after / before, after: 1 } : { before: 1, after: before / after };
    }
    const now = e.ctx.currentTime;
    for (const sd of SIDES) {
      const target = sd === sideRef.current ? comp[sd] : 0;
      e.gain[sd].gain.cancelScheduledValues(now);
      e.gain[sd].gain.setTargetAtTime(target, now, ramp);
    }
  }, []);

  const teardown = useCallback(() => {
    const e = engine.current;
    engine.current = null;
    if (!e) return;
    for (const sd of SIDES) {
      e.media[sd].pause();
      e.ws[sd].destroy();
      e.media[sd].removeAttribute("src");
      e.media[sd].load();
    }
    void e.ctx.close();
  }, []);

  useEffect(() => teardown, [teardown]);

  // The AudioContext is created by the caller inside the click handler, before
  // any await, so mobile browsers treat it as started by the user.
  const load = useCallback(async (ctx: AudioContext) => {
    if (!pair) return null;
    setStatus("loading");
    try {
      const { default: WS } = await import("wavesurfer.js");
      const media = {} as Engine["media"];
      const gain = {} as Engine["gain"];
      const ws = {} as Engine["ws"];
      const e: Engine = { ctx, media, gain, ws, rms: {} };

      let decoded = 0;
      const ready = new Promise<void>((resolve, reject) => {
        for (const sd of SIDES) {
          const el = new Audio();
          el.preload = "auto";
          el.src = sd === "before" ? pair.before : pair.after;
          media[sd] = el;
          const g = ctx.createGain();
          g.gain.value = 0;
          ctx.createMediaElementSource(el).connect(g).connect(ctx.destination);
          gain[sd] = g;
          const w = WS.create({
            container: containers.current[sd]!,
            media: el,
            height: 72,
            waveColor: resolveColor(sd === "after" ? "rgb(var(--k-paper-soft))" : "rgb(var(--k-mid))"),
            progressColor: resolveColor(sd === "after" ? "rgb(var(--k-accent))" : "rgb(var(--k-paper))"),
            cursorColor: resolveColor("rgb(var(--k-accent))"),
            cursorWidth: 2,
            barWidth: 2,
            barGap: 1,
            normalize: false,
            dragToSeek: true,
          });
          w.on("decode", (d) => {
            const buf = w.getDecodedData();
            if (buf) e.rms[sd] = rmsOf(buf);
            if (sd === "after") setDuration(d);
            if (++decoded === 2) resolve();
          });
          w.on("error", reject);
          w.on("interaction", (t) => {
            for (const other of SIDES) if (other !== sd) media[other].currentTime = t;
          });
          ws[sd] = w;
        }
      });

      engine.current = e;
      await ready;
      media.after.addEventListener("timeupdate", () => {
        const active = media[sideRef.current];
        const idle = media[sideRef.current === "after" ? "before" : "after"];
        setTime(active.currentTime);
        if (!idle.paused && Math.abs(idle.currentTime - active.currentTime) > 0.04) {
          idle.currentTime = active.currentTime;
        }
      });
      media.after.addEventListener("ended", () => {
        media.before.pause();
        setPlaying(false);
      });
      applyGains(0.001);
      setStatus("ready");
      return e;
    } catch {
      teardown();
      setStatus("error");
      return null;
    }
  }, [pair, applyGains, teardown]);

  const togglePlay = useCallback(async () => {
    let e = engine.current;
    if (!e) {
      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      void ctx.resume();
      e = await load(ctx);
    }
    if (!e) return;
    if (playing) {
      e.media.before.pause();
      e.media.after.pause();
      setPlaying(false);
      return;
    }
    try {
      await e.ctx.resume();
      e.media.before.currentTime = e.media.after.currentTime;
      await Promise.all([e.media.before.play(), e.media.after.play()]);
      setPlaying(true);
    } catch {
      // Some phones refuse playback that starts after a long load; the files
      // are ready now, so the next press plays straight away.
      e.media.before.pause();
      e.media.after.pause();
      setPlaying(false);
    }
  }, [load, playing]);

  const choose = (sd: Side) => {
    sideRef.current = sd;
    setSide(sd);
    const e = engine.current;
    if (e) {
      const from = e.media[sd === "after" ? "before" : "after"];
      if (Math.abs(e.media[sd].currentTime - from.currentTime) > 0.04) e.media[sd].currentTime = from.currentTime;
    }
    applyGains();
  };

  const toggleMatch = (v: boolean) => {
    matchedRef.current = v;
    setMatched(v);
    applyGains();
  };

  const selectPair = (i: number) => {
    if (i === index) return;
    teardown();
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setStatus("idle");
    setIndex(i);
  };

  const busy = status === "loading";

  return (
    <div className={s.player}>
      <div className={s.playerBar}>
        <div role="group" aria-label="Example tracks" className={s.tabs}>
          {pairs.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              aria-pressed={i === index}
              className={s.tab}
              disabled={busy}
              onClick={() => selectPair(i)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className={s.controls}>
          <button type="button" className={s.playBtn} onClick={togglePlay} disabled={busy} aria-pressed={playing}>
            {busy ? "Loading" : playing ? "Pause" : "Play"}
          </button>
          <div className={s.ab} role="group" aria-label="Version">
            <button type="button" aria-pressed={side === "before"} onClick={() => choose("before")}>
              Before
            </button>
            <button type="button" aria-pressed={side === "after"} onClick={() => choose("after")}>
              After
            </button>
          </div>
          <label className={s.match}>
            <input type="checkbox" checked={matched} onChange={(ev) => toggleMatch(ev.target.checked)} />
            Match loudness
          </label>
        </div>
      </div>

      <div className={s.tracks}>
        {SIDES.map((sd) => (
          <div key={`${pair.slug}-${sd}`} className={s.track} data-active={side === sd}>
            <span className={s.trackLabel}>{sd === "before" ? "Before" : "After"}</span>
            <div
              className={s.trackWave}
              ref={(el) => {
                containers.current[sd] = el;
              }}
            />
          </div>
        ))}
      </div>

      <div className={s.playerFoot} aria-live="polite">
        <span>
          {status === "error"
            ? "This example could not be loaded. Check your connection and press play again."
            : status === "idle"
              ? `${pair.style} style. Press play to load both versions (${mb(pair.bytes)}).`
              : `${pair.style} style.${matched ? " Levels matched approximately, so you hear the processing, not just the volume." : ""}`}
        </span>
        <span className={s.mono}>
          {fmt(time)} / {duration ? fmt(duration) : "–:––"}
        </span>
      </div>
    </div>
  );
}
