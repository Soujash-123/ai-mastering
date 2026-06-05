"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { wsUrl } from "@/lib/api";

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
    label: "Analysis",
    sub: "Spectral · Dynamics · Space",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.5 7.5h2M11.5 7.5h2M4.4 4.4l1.4 1.4M9.2 9.2l1.4 1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "reasoning",
    label: "AI Strategy",
    sub: "Intent · Chain design",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 1.5a5 5 0 015 5c0 2.4-1.7 4.4-4 4.9v1.6H6.5v-1.6a5 5 0 01-4-4.9 5 5 0 015-5z" stroke="currentColor" strokeWidth="1.3" />
        <path d="M6 13.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "mastering",
    label: "DSP Master",
    sub: "EQ · Compression · Limit",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2 11V7M5 11V4M8 11V6M11 11V3M13 11V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "exporting",
    label: "Finalize",
    sub: "FLAC master · Simulations",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M3 9.5v3h9v-3M7.5 2.5v7M5 7l2.5 2.5L10 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const STEP_DESCRIPTIONS: Record<string, { title: string; body: string; tip: string }> = {
  queued: {
    title: "Waiting in the mastering queue",
    body: "All five mastering workers are busy right now. Your job will start automatically as soon as a slot opens — no action needed.",
    tip: "Queue position updates in real time. Longer tracks need more processing time.",
  },
  analyzing: {
    title: "Analyzing your mix",
    body: "Measuring frequency balance, loudness, dynamics, stereo width, and harmonic character to build a custom mastering blueprint.",
    tip: "Every decision in the chain starts from this analysis — not from presets.",
  },
  reasoning: {
    title: "Designing the mastering strategy",
    body: "The AI is reading your analysis and creative intent to plan EQ, compression, saturation, and spatial moves unique to this track.",
    tip: "Strategy is validated and clamped by a safety layer before any DSP runs.",
  },
  mastering: {
    title: "Rendering the master",
    body: "Your adaptive DSP chain is running — EQ, multiband compression, saturation, stereo enhancement, and transparent limiting.",
    tip: "Processing time scales with track length — longer songs take proportionally longer.",
  },
  exporting: {
    title: "Packaging your deliverables",
    body: "Encoding the final FLAC master and building streaming/device playback previews you can audition on the results page.",
    tip: "You get one mastered FLAC download plus listen-only platform simulations.",
  },
  failed: {
    title: "Mastering could not complete",
    body: "Something went wrong during processing. Check the message below and try uploading again.",
    tip: "Tracks must be under 5 minutes. WAV and FLAC only.",
  },
};

function SpectrumAnalyzer({ active }: { active: boolean }) {
  const bars = Array.from({ length: 48 }, (_, i) => ({
    h: Math.min(88, 12 + Math.abs(Math.sin(i * 0.41 + 0.4)) * 42 + Math.abs(Math.cos(i * 0.77)) * 30),
    dur: 0.55 + Math.abs(Math.sin(i * 0.58)) * 0.95,
    del: i * 0.032,
  }));

  return (
    <div className="relative h-48 overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-950/70">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(110,231,255,0.08),transparent_65%)]" />
      {["+12", "0", "−12", "−24", "−36"].map((l, i) => (
        <div key={l} className="pointer-events-none absolute left-3 font-mono text-[7px] text-mist-200/22" style={{ top: `${4 + (i / 4) * 78}%` }}>
          {l}
        </div>
      ))}
      <div className="absolute inset-y-0 left-9 right-3 flex items-end gap-[2px] pb-6 pt-4">
        {bars.map((bar, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${bar.h}%`,
              maxWidth: 8,
              transformOrigin: "bottom",
              background: `linear-gradient(to top, hsl(${188 + (i / bars.length) * 95}, 78%, 48%), hsl(${188 + (i / bars.length) * 95}, 85%, 68%))`,
              opacity: active ? 0.85 : 0.35,
              animationName: active ? "spectrum-bar" : "none",
              animationDuration: `${bar.dur}s`,
              animationDelay: `${bar.del}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDirection: "alternate",
            }}
          />
        ))}
      </div>
      <div className="absolute bottom-2 left-9 right-3 flex justify-between">
        {["20", "100", "500", "2k", "8k", "20k"].map((l) => (
          <span key={l} className="font-mono text-[7px] text-mist-200/18">{l}</span>
        ))}
      </div>
    </div>
  );
}

function fmtTime(s: number) {
  const total = Math.max(0, Math.floor(s));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative mx-auto h-28 w-28">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#progressGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
        <defs>
          <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6ee7ff" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-extrabold text-white">{pct}%</span>
        <span className="text-[8px] uppercase tracking-widest text-mist-200/35">done</span>
      </div>
    </div>
  );
}

export default function ProcessingPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [status, setStatus] = useState("queued");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Connecting…");
  const [elapsed, setElapsed] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const startTime = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl(`/ws/jobs/${jobId}`));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "progress") {
          setStatus(msg.status);
          setProgress(msg.progress ?? 0);
          setMessage(msg.message ?? "");
          if (typeof msg.eta_seconds === "number") setEtaSeconds(msg.eta_seconds);
          if (typeof msg.duration_sec === "number") setDurationSec(msg.duration_sec);
        } else if (msg.type === "result") {
          try { sessionStorage.setItem(`kord_result_${jobId}`, JSON.stringify(msg)); } catch { /* quota */ }
          router.push(`/result/${jobId}`);
        } else if (msg.type === "failed") {
          setStatus("failed");
          setMessage(msg.message || "Processing failed");
        }
      } catch { /* malformed */ }
    };
    ws.onerror = () => setMessage("Connection error — please refresh.");
    return () => { ws.close(); };
  }, [jobId, router]);

  const currentStep = STATUS_STEP[status] ?? -1;
  const pct = Math.round(progress * 100);
  const isQueued = status === "queued";
  const isFailed = status === "failed";
  const isActive = !isQueued && !isFailed && status !== "completed";
  const desc = STEP_DESCRIPTIONS[isFailed ? "failed" : status] ?? STEP_DESCRIPTIONS.queued;
  const total = etaSeconds ?? 90;
  const remaining = Math.max(0, total - elapsed);

  const copyId = () => {
    void navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="flex flex-col gap-6 py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent/70">Processing</p>
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">
            {isFailed ? (
              <>Mastering <span className="text-rose-400">failed</span></>
            ) : isQueued ? (
              <>In the <span className="text-gold">queue</span></>
            ) : (
              <>Mastering <span className="text-violet">in progress</span></>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-mist-200/35">{jobId}</span>
              <button type="button" onClick={copyId} className="rounded p-0.5 text-mist-200/28 transition hover:text-mist-200/65">
                {copied ? "✓" : "⎘"}
              </button>
            </div>
            {durationSec != null && (
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] text-mist-200/50">
                Track: {fmtTime(durationSec)}
              </span>
            )}
          </div>
        </div>
        <Link
          href="/"
          className="flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-mist-200/55 transition hover:bg-white/[0.07] hover:text-mist-200"
        >
          ← Back to Studio
        </Link>
      </div>

      {/* Queue / failed banners */}
      {isQueued && (
        <div className="flex items-start gap-4 rounded-2xl border border-gold/25 bg-gold/[0.06] px-5 py-4">
          <span className="relative mt-1 flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/50 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-gold" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gold">Queued — waiting for a worker slot</p>
            <p className="mt-1 text-xs text-mist-200/55">
              Up to 5 masters run in parallel. Yours starts automatically when a slot opens.
            </p>
          </div>
        </div>
      )}

      {isFailed && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.08] px-5 py-4">
          <p className="text-sm font-semibold text-rose-300">Processing failed</p>
          <p className="mt-1 text-xs text-mist-200/60">{message}</p>
          <Link href="/" className="mt-3 inline-block text-xs font-semibold text-accent underline">
            Upload a new track
          </Link>
        </div>
      )}

      {/* Pipeline */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-6">
        <div className="relative flex items-start justify-between gap-2">
          <div className="pointer-events-none absolute left-[10%] right-[10%] top-5 hidden h-px bg-white/[0.08] sm:block" />
          {STEPS.map((step, i) => {
            const done = currentStep > i;
            const active = currentStep === i;
            return (
              <div key={step.id} className="relative z-10 flex flex-1 flex-col items-center gap-2 text-center">
                <div className="relative flex h-11 w-11 items-center justify-center">
                  {active && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-violet/30" />}
                  <div
                    className={[
                      "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-500",
                      done ? "border-accent/50 bg-accent/15 text-accent"
                        : active ? "border-violet/55 bg-violet/18 text-violet shadow-[0_0_24px_rgba(167,139,250,0.3)]"
                        : "border-white/10 bg-ink-900/80 text-mist-200/25",
                    ].join(" ")}
                  >
                    {done ? "✓" : active ? step.icon : <span className="text-[10px] font-bold">{i + 1}</span>}
                  </div>
                </div>
                <div>
                  <p className={`text-[10px] font-semibold ${done ? "text-accent/80" : active ? "text-white" : "text-mist-200/25"}`}>
                    {step.label}
                  </p>
                  <p className={`text-[9px] ${active ? "text-mist-200/45" : "text-mist-200/18"}`}>{step.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {!isFailed && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-900/50 px-4 py-3">
            <span className="relative flex h-2 w-2 shrink-0">
              {isQueued ? (
                <span className="inline-flex h-2 w-2 rounded-full bg-gold" />
              ) : (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet/55 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-violet" />
                </>
              )}
            </span>
            <p className="text-[11px] text-mist-200/65">{message}</p>
          </div>
        )}
      </div>

      {/* Main grid */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/40">Signal Monitor</p>
              <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider ${isActive ? "bg-accent/15 text-accent" : "bg-white/5 text-mist-200/30"}`}>
                {isActive ? "Live" : isQueued ? "Standby" : "—"}
              </span>
            </div>
            <SpectrumAnalyzer active={isActive} />
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/40">What&apos;s happening</p>
            <p className="mt-2 text-base font-semibold text-white">{desc.title}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-mist-200/55">{desc.body}</p>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-accent/15 bg-accent/[0.04] px-3 py-2.5">
              <span className="text-accent">◆</span>
              <p className="text-[10px] leading-relaxed text-mist-200/50">{desc.tip}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-center">
            <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/40">Progress</p>
            <ProgressRing pct={pct} />
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { label: "Elapsed", value: fmtTime(elapsed) },
                { label: "Est. left", value: etaSeconds != null ? fmtTime(remaining) : "—" },
                { label: "Stage", value: status },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/[0.05] bg-ink-950/40 p-2.5">
                  <p className="text-[7px] uppercase tracking-wider text-mist-200/28">{s.label}</p>
                  <p className={`mt-1 text-sm font-bold capitalize ${s.label === "Stage" ? "text-violet" : "font-mono text-white"}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>
            {etaSeconds != null && (
              <p className="mt-3 text-[9px] text-mist-200/35">
                Estimated total time: ~{fmtTime(etaSeconds)} (based on track length)
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.015] px-5 py-3 text-[10px] text-mist-200/35">
        <span>🔒 Your audio is processed securely and cleaned up automatically</span>
        <span className="hidden sm:inline">Max track length: 5 min</span>
      </div>
    </main>
  );
}
