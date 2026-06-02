"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchResult, fetchStatus } from "@/lib/api";

// Status → step index
const STATUS_STEP: Record<string, number> = {
  queued: -1,
  analyzing: 0,
  reasoning: 1,
  mastering: 2,
  exporting: 3,
  completed: 4,
  failed: -2,
};

const STEPS = [
  {
    id: "analyzing",
    label: "Deep Analysis",
    sub: "Spectral · Dynamic · Spatial",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.5 7.5h2M11.5 7.5h2M4.4 4.4l1.4 1.4M9.2 9.2l1.4 1.4M4.4 10.6l1.4-1.4M9.2 5.8l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "reasoning",
    label: "AI Strategy",
    sub: "Intent · Chain Design",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 1.5a5 5 0 015 5c0 2.4-1.7 4.4-4 4.9v1.6H6.5v-1.6a5 5 0 01-4-4.9 5 5 0 015-5z" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6 13.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "mastering",
    label: "DSP Mastering",
    sub: "EQ · Compression · Limiting",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2 11V7M5 11V4M8 11V6M11 11V3M13 11V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "exporting",
    label: "Export Renders",
    sub: "WAV · FLAC · Streaming",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M3 9.5v3h9v-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 2.5v7M5 7l2.5 2.5L10 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const STEP_DESCRIPTIONS: Record<string, { title: string; body: string; tip: string }> = {
  queued: {
    title: "Waiting in queue",
    body: "Your track is queued and will begin processing momentarily. KORD builds a completely custom mastering chain for every track — no templates, no presets.",
    tip: "KORD processes each track independently — no presets, no shortcuts.",
  },
  analyzing: {
    title: "Analyzing your mix",
    body: "Running a deep spectral and dynamic analysis — measuring frequency balance, dynamic range, transient behavior, stereo width, and harmonic character. This data forms the blueprint for your custom chain.",
    tip: "A thorough analysis leads to better mastering decisions. Every frequency is measured.",
  },
  reasoning: {
    title: "Crafting the AI strategy",
    body: "GPT-4 is interpreting your analysis data and creative intent to design a precise, adaptive mastering plan — deciding EQ curves, compression ratios, saturation, and stereo enhancement values unique to your track.",
    tip: "KORD's AI reasons about your track the way a mastering engineer would, then goes further.",
  },
  mastering: {
    title: "Applying the DSP chain",
    body: "Your custom adaptive DSP chain is running — linear-phase EQ, multiband compression, harmonic saturation, transient shaping, stereo enhancement, and final transparent limiting — all calibrated to your track.",
    tip: "Every processing decision is derived from analysis, not presets. This is why results vary track to track.",
  },
  exporting: {
    title: "Rendering streaming exports",
    body: "KORD is rendering platform-optimized exports with format-specific loudness normalization, bit-depth conversion, and streaming encoding for Spotify, Apple Music, YouTube, and more.",
    tip: "Each platform has different loudness targets. KORD accounts for all of them automatically.",
  },
};

// Animated CSS spectrum analyzer bars
function SpectrumAnalyzer() {
  const bars = Array.from({ length: 46 }, (_, i) => ({
    h: Math.min(82, 14 + Math.abs(Math.sin(i * 0.43 + 0.5)) * 38 + Math.abs(Math.sin(i * 0.91)) * 28),
    dur: 0.65 + Math.abs(Math.sin(i * 0.63)) * 0.9,
    del: i * 0.035,
  }));

  return (
    <div className="relative h-44 overflow-hidden rounded-xl bg-ink-950/60">
      {/* dB labels */}
      {["+12", "0", "–12", "–24", "–36", "–48"].map((l, i) => (
        <div key={l} className="pointer-events-none absolute left-2 font-mono text-[7px] text-mist-200/25" style={{ top: `${2 + (i / 5) * 82}%` }}>
          {l}
        </div>
      ))}
      {/* Bars */}
      <div className="absolute inset-y-0 left-8 right-2 flex items-end gap-[1px] pb-5">
        {bars.map((bar, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[1px]"
            style={{
              height: `${bar.h}%`,
              maxWidth: 7,
              transformOrigin: "bottom",
              background: `hsl(${180 + (i / bars.length) * 130}, 80%, 62%)`,
              opacity: 0.6,
              animationName: "spectrum-bar",
              animationDuration: `${bar.dur}s`,
              animationDelay: `${bar.del}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDirection: "alternate",
            }}
          />
        ))}
      </div>
      {/* Hz labels */}
      <div className="absolute bottom-1 left-8 right-2 flex justify-between">
        {["20", "50", "100", "500", "1k", "5k", "20k"].map((l) => (
          <span key={l} className="font-mono text-[7px] text-mist-200/20">{l}</span>
        ))}
      </div>
    </div>
  );
}

function fmtTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function ProcessingPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("queued");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Starting…");
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const startTime = useRef(Date.now());

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll status
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const s = await fetchStatus(jobId);
        if (!active) return;
        setStatus(s.status);
        setProgress(s.progress ?? 0);
        setMessage(s.message ?? "");
        if (s.status === "completed") {
          await fetchResult(jobId);
          router.push(`/result/${jobId}`);
        } else if (s.status !== "failed") {
          timer = setTimeout(poll, 2000);
        }
      } catch {
        if (active) timer = setTimeout(poll, 4000);
      }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [jobId, router]);

  const currentStep = STATUS_STEP[status] ?? -1;
  const pct = Math.round(progress * 100);
  const desc = STEP_DESCRIPTIONS[status] ?? STEP_DESCRIPTIONS.queued;
  const remaining = Math.max(0, 90 - elapsed);

  const copyId = () => {
    void navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="flex flex-col gap-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent/70">Processing</p>
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">
            Mastering <span className="text-violet">in progress</span>
          </h1>
          <div className="flex items-center gap-2 pt-0.5">
            <span className="font-mono text-[11px] text-mist-200/35">{jobId}</span>
            <button type="button" onClick={copyId} className="rounded p-0.5 text-mist-200/28 transition hover:text-mist-200/65">
              {copied ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-accent">
                  <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1" />
                  <path d="M3 3V2a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-mist-200/55 transition hover:bg-white/[0.07] hover:text-mist-200"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Studio
        </button>
      </div>

      {/* Step pipeline */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <div className="flex items-start justify-between gap-1">
          {STEPS.map((step, i) => {
            const done = currentStep > i;
            const active = currentStep === i;
            return (
              <div key={step.id} className="flex flex-1 flex-col items-center gap-2.5 text-center">
                <div className="relative flex h-12 w-12 items-center justify-center">
                  {active && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-violet/25" />}
                  <div className={[
                    "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-500",
                    done ? "border-accent/50 bg-accent/15 text-accent"
                      : active ? "border-violet/55 bg-violet/18 text-violet shadow-[0_0_20px_rgba(167,139,250,0.28)]"
                      : "border-white/10 bg-white/[0.04] text-mist-200/28",
                  ].join(" ")}>
                    {done ? (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M3 6.5l3 3 4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : active ? step.icon : (
                      <span className="text-[10px] font-bold">{i + 1}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className={`text-[10px] font-semibold leading-tight ${done ? "text-accent/75" : active ? "text-white" : "text-mist-200/28"}`}>
                    {step.label}
                  </p>
                  <p className={`text-[9px] ${active ? "text-mist-200/50" : "text-mist-200/20"}`}>{step.sub}</p>
                </div>
              </div>
            );
          })}
        </div>
        {/* Live message */}
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 px-4 py-3">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet/55 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet" />
          </span>
          <p className="text-[11px] text-mist-200/65">{message}</p>
        </div>
      </div>

      {/* Two-column lower section */}
      <div className="grid gap-5 lg:grid-cols-5">
        {/* Spectrum + stats */}
        <div className="flex flex-col gap-4 lg:col-span-3">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/40">Real-Time Analysis</p>
              <span className="font-mono text-[8px] text-mist-200/22">LIVE</span>
            </div>
            <SpectrumAnalyzer />
            {/* Stats */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { label: "LUFS (I)" },
                { label: "True Peak" },
                { label: "Dyn. Range" },
                { label: "Width" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/[0.05] bg-ink-950/50 p-2.5 text-center">
                  <p className="text-[7px] uppercase tracking-wider text-mist-200/28">{s.label}</p>
                  <p className="mt-1 font-mono text-base font-bold text-mist-200/35">--</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[8px] uppercase tracking-[0.2em] text-mist-200/18">Analysis Insights</p>
          </div>
        </div>

        {/* Progress + description */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Progress card */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-4 flex items-start justify-between">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/40">Overall Progress</p>
              <span className="font-mono text-2xl font-extrabold text-white">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent to-violet transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Elapsed", value: fmtTime(elapsed), mono: true, color: "text-white" },
                { label: "Est. Left", value: fmtTime(remaining), mono: true, color: "text-mist-200/55" },
                { label: "Stage", value: status, mono: false, color: "text-violet capitalize" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[7px] uppercase tracking-wider text-mist-200/28">{s.label}</p>
                  <p className={`mt-0.5 text-sm font-bold ${s.color} ${s.mono ? "font-mono" : ""}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* What's happening card */}
          <div className="flex flex-1 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/40">What&apos;s Happening Now?</p>
            <p className="mt-2 text-sm font-semibold text-white">{desc.title}</p>
            <p className="mt-2 flex-1 text-[11px] leading-relaxed text-mist-200/52">{desc.body}</p>
            {/* Decorative waveform */}
            <div className="my-4 flex h-10 items-center justify-center gap-[2px]">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[2px] rounded-full"
                  style={{
                    height: `${28 + Math.abs(Math.sin(i * 0.6)) * 62}%`,
                    background: `hsl(${180 + (i / 30) * 120}, 80%, 60%)`,
                    opacity: 0.4,
                    transformOrigin: "center",
                    animationName: "spectrum-bar",
                    animationDuration: `${0.55 + Math.abs(Math.sin(i * 0.4)) * 0.85}s`,
                    animationDelay: `${i * 0.04}s`,
                    animationTimingFunction: "ease-in-out",
                    animationIterationCount: "infinite",
                    animationDirection: "alternate",
                  }}
                />
              ))}
            </div>
            {/* Pro tip */}
            <div className="flex items-start gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
              <span className="text-sm">💡</span>
              <p className="text-[10px] leading-relaxed text-mist-200/42">{desc.tip}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom trust bar */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.015] px-5 py-3">
        <div className="flex items-center gap-2 text-[10px] text-mist-200/35">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-accent/45">
            <path d="M5.5 1L10 3v4A4.5 4.5 0 015.5 10 4.5 4.5 0 011 7V3l4.5-2z" stroke="currentColor" strokeWidth="1.1" />
          </svg>
          Your audio is safe with us
        </div>
        <div className="flex items-center gap-2 text-[10px] text-mist-200/35">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-mist-200/35">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.1" />
            <path d="M5.5 5v3M5.5 3.5v.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Need help?
        </div>
      </div>
    </main>
  );
}


