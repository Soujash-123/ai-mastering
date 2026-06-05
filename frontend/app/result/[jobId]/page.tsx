"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MasteringIntensityBars } from "@/components/mastering/MasteringIntensityBars";
import { StreamingSimulator } from "@/components/preview/StreamingSimulator";
import { apiUrl, deleteJob, fetchResult, type JobResult } from "@/lib/api";

async function drawWaveform(canvas: HTMLCanvasElement, audioUrl: string, color: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const res = await fetch(audioUrl);
  const buf = await res.arrayBuffer();
  const ac = new AudioContext();
  const audio = await ac.decodeAudioData(buf.slice(0));
  await ac.close();
  const ch0 = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(ch0.length / canvas.width));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mid = canvas.height / 2;
  for (let x = 0; x < canvas.width; x++) {
    let min = 1, max = -1;
    const start = x * step;
    const end = Math.min(ch0.length, start + step);
    for (let i = start; i < end; i++) {
      const s = ch0[i];
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const prog = x / canvas.width;
    const hue = 185 + prog * 110;
    ctx.strokeStyle = color === "gradient" ? `hsla(${hue}, 80%, 65%, 0.85)` : color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, (1 + min) * mid);
    ctx.lineTo(x, (1 + max) * mid);
    ctx.stroke();
  }
}

const ANALYSIS_CARDS: { key: string; label: string; icon: string; color: string; featured?: boolean }[] = [
  { key: "mix_assessment", label: "Sound Character", icon: "waveform", color: "#6ee7ff" },
  { key: "emotional_assessment", label: "Emotional Quality", icon: "heart", color: "#f0b429" },
  { key: "translation_assessment", label: "Translation", icon: "radio", color: "#a78bfa" },
  { key: "dynamic_assessment", label: "Dynamics", icon: "bars", color: "#6ee7ff" },
  { key: "spatial_assessment", label: "Spatial Imaging", icon: "expand", color: "#a78bfa" },
  { key: "final_summary", label: "Final Verdict", icon: "star", color: "#f0b429", featured: true },
];

function AnalysisIcon({ type, color }: { type: string; color: string }) {
  const s = { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none" };
  if (type === "waveform") return <svg {...s}><path d="M1 7h2M4 4h1v6H4M7 2h1v10H7M10 5h1v4h-1M13 7h0.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" /></svg>;
  if (type === "heart") return <svg {...s}><path d="M7 12S2 8.5 2 5.5a2.5 2.5 0 015-0 2.5 2.5 0 015 0C12 8.5 7 12 7 12z" stroke={color} strokeWidth="1.2" /></svg>;
  if (type === "radio") return <svg {...s}><circle cx="7" cy="7" r="2" stroke={color} strokeWidth="1.2" /><path d="M4.2 9.8a4 4 0 010-5.6M9.8 4.2a4 4 0 010 5.6" stroke={color} strokeWidth="1.2" strokeLinecap="round" /></svg>;
  if (type === "bars") return <svg {...s}><path d="M2 11V6M5 11V3M8 11V5M11 11V8" stroke={color} strokeWidth="1.3" strokeLinecap="round" /></svg>;
  if (type === "expand") return <svg {...s}><path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (type === "star") return <svg {...s}><path d="M7 1.5l1.4 4.3H13l-3.7 2.7 1.4 4.3L7 10.2l-3.7 2.6 1.4-4.3L1 5.8h4.6z" stroke={color} strokeWidth="1.1" strokeLinejoin="round" /></svg>;
  return null;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function ResultPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [data, setData] = useState<JobResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [masterBars, setMasterBars] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const masterExport = useMemo(() => data?.exports?.[0] ?? null, [data]);

  const urls = useMemo(() => {
    if (!data) return null;
    const master = masterExport
      ? apiUrl(masterExport.download_url)
      : apiUrl(data.master_wav_url);
    return { in: apiUrl(data.input_url), master };
  }, [data, masterExport]);

  useEffect(() => {
    const cached = sessionStorage.getItem(`kord_result_${jobId}`);
    if (cached) {
      try {
        setData(JSON.parse(cached) as JobResult);
        return;
      } catch { /* fall through */ }
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchResult(jobId);
        if (cancelled) return;
        if (!r) { setErr("Result not ready yet. Stay on the processing page."); return; }
        setData(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load result");
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  useEffect(() => {
    const cleanup = () => {
      sessionStorage.removeItem(`kord_result_${jobId}`);
      void deleteJob(jobId);
    };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, [jobId]);

  useEffect(() => {
    if (!urls) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(urls.master);
        const arrBuf = await res.arrayBuffer();
        const ac = new AudioContext();
        const decoded = await ac.decodeAudioData(arrBuf);
        await ac.close();
        if (cancelled) return;
        const ch0 = decoded.getChannelData(0);
        const NUM_BARS = 64;
        const segLen = Math.max(1, Math.floor(ch0.length / NUM_BARS));
        let globalMax = 0;
        const rawBars: number[] = [];
        for (let i = 0; i < NUM_BARS; i++) {
          let peak = 0;
          const s = i * segLen;
          const e = Math.min(ch0.length, s + segLen);
          for (let j = s; j < e; j++) {
            const abs = Math.abs(ch0[j]);
            if (abs > peak) peak = abs;
          }
          rawBars.push(peak);
          if (peak > globalMax) globalMax = peak;
        }
        if (!cancelled) setMasterBars(rawBars.map((v) => (globalMax > 0 ? v / globalMax : 0.3)));
      } catch { /* non-critical */ }
      if (!cancelled && beforeRef.current)
        await drawWaveform(beforeRef.current, urls.in, "rgba(255,75,75,0.72)");
    })();
    return () => { cancelled = true; };
  }, [urls]);

  const copyJobId = () => {
    void navigator.clipboard.writeText(jobId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const togglePlay = async () => {
    if (!masterAudioRef.current) return;
    try {
      if (masterAudioRef.current.paused) {
        await masterAudioRef.current.play();
        setIsPlaying(true);
      } else {
        masterAudioRef.current.pause();
        setIsPlaying(false);
      }
    } catch { /* ignore */ }
  };

  if (err) {
    return (
      <main className="py-10 space-y-4">
        <p className="text-sm text-rose-300">{err}</p>
        <Link className="text-sm text-accent underline" href={`/processing/${jobId}`}>Back to processing</Link>
      </main>
    );
  }

  if (!data || !urls) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-mist-200/55">
          <div className="h-4 w-4 animate-spin rounded-full border border-white/10 border-t-accent" />
          Loading your master…
        </div>
      </main>
    );
  }

  const analysis = data.analysis as Record<string, unknown>;
  const safeIntent = data.safe_intent as Record<string, unknown>;
  const intLufs = analysis?.integrated_lufs != null ? `${Number(analysis.integrated_lufs).toFixed(1)} LUFS` : "—";
  const tgtLufs = (safeIntent?.loudness_strategy as Record<string, unknown>)?.target_lufs != null
    ? `${Number((safeIntent.loudness_strategy as Record<string, unknown>).target_lufs).toFixed(1)} LUFS`
    : "—";
  const masterFormat = (masterExport?.format ?? "flac").toUpperCase();
  const downloadName = `kord_master.${masterExport?.format ?? "flac"}`;

  return (
    <main className="flex flex-col gap-7 py-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-accent/20 bg-gradient-to-br from-accent/[0.08] via-white/[0.02] to-violet/[0.06] p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_#6ee7ff]" />
              Master complete
            </span>
            <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
              Your master is <span className="text-glow text-accent">ready</span>
            </h1>
            <p className="max-w-lg text-sm text-mist-200/55">
              One lossless {masterFormat} deliverable, plus streaming and device previews below.
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-mist-200/35">{jobId}</span>
              <button type="button" onClick={copyJobId} className="text-[10px] text-mist-200/30 hover:text-accent">
                {copiedId ? "Copied" : "Copy ID"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={urls.master}
              download={downloadName}
              className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-accent to-cyan-400 px-6 py-3 text-sm font-bold text-ink-950 shadow-[0_0_32px_rgba(110,231,255,0.35)] transition hover:shadow-[0_0_48px_rgba(110,231,255,0.5)]"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v6M7 8l-2.5-2.5M7 8l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2.5 11h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Download Master ({masterFormat})
            </a>
            <Link
              href="/"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-mist-200/65 transition hover:bg-white/[0.07] hover:text-white"
            >
              New upload
            </Link>
          </div>
        </div>
      </div>

      {/* Master player */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-mist-200/38">Final Master</p>
            <p className="text-lg font-bold text-white">Listen &amp; review</p>
          </div>
          <div className="flex gap-5">
            {[
              { label: "Input LUFS", value: intLufs },
              { label: "Target", value: tgtLufs },
              { label: "Format", value: masterFormat },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-[8px] uppercase tracking-wider text-mist-200/30">{s.label}</p>
                <p className="mt-0.5 font-mono text-xs font-bold text-white/80">{s.value}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowComparison((v) => !v)}
            className={[
              "rounded-xl border px-3 py-1.5 text-[11px] font-medium transition",
              showComparison
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-white/10 bg-white/[0.03] text-mist-200/50 hover:text-white",
            ].join(" ")}
          >
            {showComparison ? "Hide" : "Show"} A/B compare
          </button>
        </div>

        <div
          className="relative flex h-36 items-end gap-[2px] overflow-hidden px-5 pb-4 pt-3"
          style={{ background: "linear-gradient(180deg, rgba(110,231,255,0.03) 0%, rgba(7,9,15,0.6) 100%)" }}
        >
          {(masterBars.length > 0 ? masterBars : Array.from({ length: 64 }, () => 0.25)).map((amp, i) => {
            const hue = 185 + (i / 64) * 50;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${Math.max(8, Math.round(amp * 100))}%`,
                  background: `hsla(${hue}, 90%, 58%, 0.88)`,
                  transformOrigin: "bottom",
                  animationName: isPlaying ? "spectrum-bar" : "none",
                  animationDuration: `${(0.5 + Math.sin(i * 0.55) * 0.25).toFixed(2)}s`,
                  animationDelay: `${(i * 0.018).toFixed(3)}s`,
                  animationTimingFunction: "ease-in-out",
                  animationIterationCount: "infinite",
                  animationDirection: "alternate",
                }}
              />
            );
          })}
          {duration > 0 && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/25"
              style={{ left: `${(currentTime / duration) * 100}%`, boxShadow: "0 0 8px rgba(110,231,255,0.6)" }}
            />
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-accent transition hover:bg-accent/25"
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
          <span className="w-10 font-mono text-[10px] text-mist-200/50">{fmtTime(currentTime)}</span>
          <div
            className="relative h-2 flex-1 cursor-pointer rounded-full bg-white/[0.08]"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const t = ((e.clientX - rect.left) / rect.width) * (duration || 0);
              setCurrentTime(t);
              if (masterAudioRef.current) masterAudioRef.current.currentTime = t;
            }}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-violet"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          <span className="w-10 text-right font-mono text-[10px] text-mist-200/30">{fmtTime(duration)}</span>
        </div>
        <audio
          ref={masterAudioRef}
          src={urls.master}
          className="hidden"
          onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />
      </div>

      {showComparison && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">Before / After</p>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-white/[0.06] bg-ink-950/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-mist-200/45">Original mix</p>
              <canvas ref={beforeRef} width={900} height={72} className="w-full rounded-lg bg-ink-950/60" />
              <audio className="w-full" controls src={urls.in} controlsList="nodownload" />
            </div>
            <div className="space-y-3 rounded-xl border border-accent/15 bg-accent/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-accent/70">Mastered</p>
              <canvas
                width={900}
                height={72}
                className="w-full rounded-lg bg-ink-950/60"
                ref={(el) => { if (el && urls) void drawWaveform(el, urls.master, "gradient"); }}
              />
              <audio className="w-full" controls src={urls.master} controlsList="nodownload" />
            </div>
          </div>
        </div>
      )}

      {/* Streaming simulator — preview only */}
      {(data.streaming_previews?.length ?? 0) > 0 && (
        <StreamingSimulator previews={data.streaming_previews!} notes={data.streaming_notes} />
      )}

      {/* Analysis grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">Mastering Analysis</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ANALYSIS_CARDS.map(({ key, label, icon, color, featured }) => {
              const value = (data.report as Record<string, unknown>)[key] as string | undefined;
              if (!value) return null;
              return (
                <div
                  key={key}
                  className={[
                    "rounded-xl border p-4",
                    featured ? "border-gold/25 bg-gold/[0.05] sm:col-span-2" : "border-white/[0.06] bg-ink-900/40",
                  ].join(" ")}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
                      <AnalysisIcon type={icon} color={color} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${color}cc` }}>{label}</p>
                  </div>
                  <p className="text-[11px] leading-relaxed text-mist-200/60">{value}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">DSP Intent</p>
          <MasteringIntensityBars intent={data.safe_intent} />
        </div>
      </div>

      <p className="text-center text-[10px] text-mist-200/22 tracking-widest">
        KORD Precision Mastering Engine · One master. No presets.
      </p>
    </main>
  );
}
