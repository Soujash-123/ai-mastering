import React from "react";
import Link from "next/link";
import { MasteringIntensityBars } from "@/components/mastering/MasteringIntensityBars";
import { type JobResult, apiUrl } from "@/lib/api";

export const ANALYSIS_CARDS: { key: string; label: string; icon: string; color: string; featured?: boolean }[] = [
  { key: "mix_assessment", label: "Sound Character", icon: "waveform", color: "#6ee7ff" },
  { key: "emotional_assessment", label: "Emotional Quality", icon: "heart", color: "#f0b429" },
  { key: "translation_assessment", label: "Translation", icon: "radio", color: "#a78bfa" },
  { key: "dynamic_assessment", label: "Dynamics", icon: "bars", color: "#6ee7ff" },
  { key: "spatial_assessment", label: "Spatial Imaging", icon: "expand", color: "#a78bfa" },
  { key: "final_summary", label: "Final Verdict", icon: "star", color: "#f0b429", featured: true },
];

export function AnalysisIcon({ type, color }: { type: string; color: string }) {
  const s = { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none" };
  if (type === "waveform") return <svg {...s}><path d="M1 7h2M4 4h1v6H4M7 2h1v10H7M10 5h1v4h-1M13 7h0.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" /></svg>;
  if (type === "heart") return <svg {...s}><path d="M7 12S2 8.5 2 5.5a2.5 2.5 0 015-0 2.5 2.5 0 015 0C12 8.5 7 12 7 12z" stroke={color} strokeWidth="1.2" /></svg>;
  if (type === "radio") return <svg {...s}><circle cx="7" cy="7" r="2" stroke={color} strokeWidth="1.2" /><path d="M4.2 9.8a4 4 0 010-5.6M9.8 4.2a4 4 0 010 5.6" stroke={color} strokeWidth="1.2" strokeLinecap="round" /></svg>;
  if (type === "bars") return <svg {...s}><path d="M2 11V6M5 11V3M8 11V5M11 11V8" stroke={color} strokeWidth="1.3" strokeLinecap="round" /></svg>;
  if (type === "expand") return <svg {...s}><path d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (type === "star") return <svg {...s}><path d="M7 1.5l1.4 4.3H13l-3.7 2.7 1.4 4.3L7 10.2l-3.7 2.6 1.4-4.3L1 5.8h4.6z" stroke={color} strokeWidth="1.1" strokeLinejoin="round" /></svg>;
  return null;
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export interface ResultProps {
  jobId: string;
  data: JobResult;
  urls: { in: string; out: string };
  tierCfg: { canPlaySimulations: boolean };
  masterBars: number[];
  isPlaying: boolean;
  showComparison: boolean;
  currentTime: number;
  duration: number;
  copiedId: boolean;
  onCopyId: () => void;
  onTogglePlay: () => void;
  onToggleComparison: () => void;
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void;
  beforeRef: React.RefObject<HTMLCanvasElement>;
  masterAudioRef: React.RefObject<HTMLAudioElement>;
  onAudioEnded: () => void;
  onAudioError?: () => void;
  onAudioTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  onAudioLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => void;
  drawWaveform: (canvas: HTMLCanvasElement, url: string, color: string) => void;
  drawPeaks?: (canvas: HTMLCanvasElement, peaks: number[], color: string) => void;
  waveformPeaks?: number[];
  downloadUrl?: string | null;
  liveTargetLufs?: string | null;
  controlPanel?: React.ReactNode;
  isFinalized?: boolean;
}

export function ResultAurora({
  jobId, data, urls, tierCfg, masterBars, isPlaying, showComparison,
  currentTime, duration, copiedId, onCopyId, onTogglePlay, onToggleComparison,
  onSeek, beforeRef, masterAudioRef, onAudioEnded, onAudioTimeUpdate, onAudioLoadedMetadata,
  drawWaveform
}: ResultProps) {
  const analysis = data.analysis as Record<string, unknown>;
  const safeIntent = data.safe_intent as Record<string, unknown>;
  const intLufs = analysis?.integrated_lufs != null ? `${Number(analysis.integrated_lufs).toFixed(1)} LUFS` : "—";
  const tgtLufs = (safeIntent?.loudness_strategy as Record<string, unknown>)?.target_lufs != null ? `${Number((safeIntent.loudness_strategy as Record<string, unknown>).target_lufs).toFixed(1)} LUFS` : "—";

  return (
    <main className="flex flex-col gap-6 py-8">
      {/* Top 2-col section */}
      <div className="grid gap-5 lg:grid-cols-5">
        {/* Left: report header + actions */}
        <div className="flex flex-col justify-between gap-5 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent/70">Mastering Report</p>
              <h1 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
                Your master is{" "}
                <span className="text-glow text-accent">ready.</span>
              </h1>
              <div className="flex items-center gap-2 pt-0.5">
                <span className="font-mono text-[11px] text-mist-200/35">{jobId}</span>
                <button type="button" onClick={onCopyId} className="rounded p-0.5 text-mist-200/28 transition hover:text-mist-200/65">
                  {copiedId ? (
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
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-mist-200/55 transition hover:bg-white/[0.07] hover:text-mist-200"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M7 2L4 5.5 7 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              New upload
            </Link>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {/* Download — all tiers */}
            <a
              href={urls.out}
              download
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-accent/80 px-5 py-2.5 text-sm font-bold text-ink-950 shadow-[0_0_24px_rgba(110,231,255,0.28)] transition hover:shadow-[0_0_36px_rgba(110,231,255,0.45)]"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 2v6M6.5 8l-2.5-2.5M6.5 8l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 10.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
              </svg>
              Download Master
            </a>

            {/* Comparison toggle — Early Access only */}
            {tierCfg.canPlaySimulations ? (
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-4 py-2.5">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-mist-200/45">
                  <path d="M6.5 2v9M3 5.5H1M12 5.5h-2M3 7.5H1M12 7.5h-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <span className="text-sm text-mist-200/60">Compare</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showComparison}
                  onClick={onToggleComparison}
                  className="relative ml-1 h-5 w-9 rounded-full border transition-all duration-300"
                  style={{
                    background: showComparison ? "rgba(110,231,255,0.2)" : "rgba(255,255,255,0.07)",
                    borderColor: showComparison ? "rgba(110,231,255,0.50)" : "rgba(255,255,255,0.18)",
                  }}
                >
                  <span
                    className="absolute top-0.5 block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300"
                    style={{ left: "2px", transform: showComparison ? "translateX(16px)" : "translateX(0)" }}
                  />
                </button>
              </div>
            ) : (
              <div
                title="Available for Early Access users"
                className="flex cursor-not-allowed items-center gap-2.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-2.5 opacity-40"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-mist-200/30">
                  <path d="M6.5 2v9M3 5.5H1M12 5.5h-2M3 7.5H1M12 7.5h-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <span className="text-sm text-mist-200/30">Compare</span>
                <span className="ml-1 rounded-full border border-violet/30 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-violet/60">EA</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Final Master card */}
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-mist-200/38">Final Master</p>
                <p className="text-sm font-semibold text-white">Master</p>
              </div>
              <div className="flex gap-4 text-center">
                {[
                  { label: "Loudness", value: intLufs },
                  { label: "Integrated", value: tgtLufs },
                  { label: "Resolution", value: "24-bit" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-[8px] uppercase tracking-wider text-mist-200/30">{s.label}</p>
                    <p className="mt-0.5 font-mono text-[11px] font-bold text-white/75">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Animated waveform bars */}
            <div
              className="relative flex h-32 items-end gap-[2px] overflow-hidden px-4 pb-3 pt-2"
              style={{ background: "linear-gradient(180deg, transparent 0%, rgba(7,9,15,0.55) 100%)" }}
            >
              {(masterBars.length > 0 ? masterBars : Array.from({ length: 60 }, () => 0.25)).map((amp, i) => {
                const hue = 185 + (i / 60) * 40; // cyan → blue-green only
                const barH = Math.max(8, Math.round(amp * 100));
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${barH}%`,
                      background: `hsla(${hue}, 90%, 58%, 0.88)`,
                      transformOrigin: "bottom",
                      boxShadow: isPlaying ? `0 0 4px hsla(${hue}, 90%, 65%, 0.45)` : "none",
                      animationName: isPlaying ? "spectrum-bar" : "none",
                      animationDuration: `${(0.5 + Math.sin(i * 0.55) * 0.25).toFixed(2)}s`,
                      animationDelay: `${(i * 0.022).toFixed(3)}s`,
                      animationTimingFunction: "ease-in-out",
                      animationIterationCount: "infinite",
                      animationDirection: "alternate",
                    }}
                  />
                );
              })}
              {/* Playhead */}
              {duration > 0 && (
                <>
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 w-px"
                    style={{
                      left: `${(currentTime / duration) * 100}%`,
                      background: "rgba(255,255,255,0.3)",
                      boxShadow: "0 0 6px rgba(110,231,255,0.7)",
                    }}
                  />
                  <div
                    className="pointer-events-none absolute top-1 h-2 w-2 -translate-x-1/2 rounded-full bg-accent"
                    style={{ left: `${(currentTime / duration) * 100}%`, boxShadow: "0 0 8px #6ee7ff" }}
                  />
                </>
              )}
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2.5">
              <button
                type="button"
                onClick={onTogglePlay}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/[0.12] text-accent transition hover:bg-accent/20 active:scale-95"
              >
                {isPlaying ? (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <rect x="1.5" y="1.5" width="3" height="8" rx="0.8" fill="currentColor" />
                    <rect x="6.5" y="1.5" width="3" height="8" rx="0.8" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M2.5 1.5l7 4-7 4v-8z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <span className="w-9 font-mono text-[10px] text-mist-200/50">{fmtTime(currentTime)}</span>
              {/* Seek bar */}
              <div
                className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/[0.09]"
                onClick={onSeek}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                    background: "linear-gradient(90deg, #6ee7ff, #38bdf8)",
                  }}
                />
                <div
                  className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white"
                  style={{
                    left: `calc(${duration > 0 ? (currentTime / duration) * 100 : 0}% - 7px)`,
                    boxShadow: "0 0 6px rgba(110,231,255,0.55)",
                  }}
                />
              </div>
              <span className="w-9 text-right font-mono text-[10px] text-mist-200/28">{fmtTime(duration)}</span>
              {isPlaying && (
               <div className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/[0.08] px-2.5 py-1">
                 <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="text-accent">
                   <path d="M1 4h1M3 1.5v5M5 .5v7M7 1.5v5M9 4h.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                 </svg>
                 <span className="text-[9px] text-accent">Playing</span>
               </div>
              )}
            </div>
            <audio
              ref={masterAudioRef}
              src={urls.out}
              className="hidden"
              onEnded={onAudioEnded}
              onTimeUpdate={onAudioTimeUpdate}
              onLoadedMetadata={onAudioLoadedMetadata}
            />
          </div>
        </div>
      </div>

      {/* Before/after comparison (toggled) */}
      {showComparison && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">Audio Comparison</p>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-mist-200/35" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-mist-200/50">Before</p>
              </div>
              <canvas ref={beforeRef} width={900} height={80} className="w-full rounded-xl bg-ink-950/60" />
              <audio className="w-full" controls src={urls.in} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-accent/80" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-accent/60">After</p>
              </div>
              <canvas width={900} height={80} className="w-full rounded-xl bg-ink-950/60 shadow-[0_0_20px_rgba(110,231,255,0.06)]"
                ref={(el) => { if (el && urls) void drawWaveform(el, urls.out, "gradient"); }}
              />
              <audio className="w-full" controls src={urls.out} />
            </div>
          </div>
        </div>
      )}

      {/* Analysis + DSP grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Analysis cards */}
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
                    "rounded-xl border p-4 transition",
                    featured
                      ? "border-gold/25 bg-gold/[0.05] sm:col-span-2"
                      : "border-white/[0.06] bg-ink-900/40",
                  ].join(" ")}
                >
                  <div className="mb-2.5 flex items-center gap-2">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: `${color}18`, border: `1px solid ${color}28` }}
                    >
                      <AnalysisIcon type={icon} color={color} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${color}cc` }}>
                      {label}
                    </p>
                  </div>
                  <p className="text-[11px] leading-relaxed text-mist-200/60 line-clamp-4">{value}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* DSP intent */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">DSP Intent</p>
          <MasteringIntensityBars intent={data.safe_intent} />
        </div>
      </div>

      {/* Download exports */}
      {data.exports.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
          <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">Download Exports</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.exports.map((e, idx) => (
              <a
                key={`${e.path}-${idx}`}
                href={apiUrl(e.download_url)}
                download
                className="group flex items-center gap-4 rounded-xl border border-white/[0.07] bg-ink-900/50 px-4 py-3.5 transition hover:border-accent/30 hover:bg-accent/[0.04]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] transition group-hover:border-accent/30 group-hover:text-accent text-mist-200/50">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v7M8 10l-3-3M8 10l3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-mist-200/40 truncate">{e.profile}</p>
                  <p className="text-sm font-bold text-white transition group-hover:text-accent">{e.format.toUpperCase()}</p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[9px] uppercase tracking-wider text-mist-200/35 transition group-hover:border-accent/30 group-hover:text-accent/70">
                  {e.format}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Streaming notes — Early Access only */}
      {data.streaming_notes.length > 0 && (
        tierCfg.canPlaySimulations ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <p className="mb-4 text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/38">
              Streaming &amp; Device Simulations
            </p>
            <ul className="space-y-2.5">
              {data.streaming_notes.map((n, i) => (
                <li key={i} className="flex items-start gap-3 text-xs text-mist-200/65">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="mt-0.5 shrink-0 text-accent/60">
                    <path d="M2.5 6.5l3 3 5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {n}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          /* Locked for Rollout users */
          <div className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-5">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-mist-200/22">
                Streaming &amp; Device Simulations
              </p>
              <span className="rounded-full border border-violet/25 bg-violet/[0.06] px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-violet/55">
                Early Access
              </span>
            </div>
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-white/[0.04] bg-ink-950/40 py-6 text-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-mist-200/20">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.3" />
                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-xs font-semibold text-mist-200/30">Simulations locked</p>
              <p className="text-[10px] text-mist-200/22">
                Switch to Early Access to see how your master translates across platforms and devices.
              </p>
            </div>
          </div>
        )
      )}

      {/* Footer tagline */}
      <p className="text-center text-[10px] text-mist-200/22 tracking-widest">
        KORD Precision Mastering Engine &nbsp;•&nbsp; No presets. No compromise.
      </p>
    </main>
  );
}
