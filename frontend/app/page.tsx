"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createJob } from "@/lib/api";
import {
  durationLimitMessage,
  getAudioDurationSec,
  maxUploadDurationSec,
  roleBadgeLabel,
} from "@/lib/auth";

const PLATFORMS = [
  { value: "Spotify", label: "Streaming (Default)" },
  { value: "Apple Music", label: "Apple Music" },
  { value: "YouTube", label: "YouTube" },
  { value: "SoundCloud", label: "SoundCloud" },
  { value: "Club / PA", label: "Club / PA" },
  { value: "Broadcast", label: "Broadcast" },
];

const CREATIVE_INTENTS = [
  { value: "Preserve dynamics; improve translation.", label: "Balanced" },
  { value: "Maximize punch and impact while maintaining natural dynamics.", label: "Punchy" },
  { value: "Add warmth and body, smooth highs, preserve low-end depth.", label: "Warm" },
  { value: "Enhance clarity and air, forward presence, crisp transients.", label: "Bright" },
  { value: "Wide, spacious, emotional depth with gentle dynamic arc.", label: "Cinematic" },
  { value: "Competitive streaming loudness, maximize energy and presence.", label: "Loud" },
];

// Decorative animated spectrum bars on the sides of the page
function SideBars({ side }: { side: "left" | "right" }) {
  const bars = Array.from({ length: 26 }, (_, i) => ({
    h: 8 + Math.abs(Math.sin(i * 0.72 + 1)) * 55 + Math.abs(Math.sin(i * 0.31)) * 25,
    dur: 1.2 + Math.abs(Math.sin(i * 0.55)) * 1.1,
    del: i * 0.06,
  }));
  return (
    <div
      className={`pointer-events-none fixed top-[57px] bottom-0 flex items-end gap-[3px] px-2 ${
        side === "left" ? "left-0 flex-row-reverse" : "right-0"
      }`}
    >
      {bars.map((b, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full ${side === "left" ? "bg-accent/20" : "bg-violet/20"}`}
          style={{
            height: `${b.h}%`,
            transformOrigin: "bottom",
            animationName: "spectrum-bar",
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.del}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
          }}
        />
      ))}
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("Spotify");
  const [intentValue, setIntentValue] = useState(CREATIVE_INTENTS[0].value);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "wav" && ext !== "flac") {
      setError("Only .wav and .flac files are accepted.");
      return;
    }
    setError(null);
    setSelectedFile(file);
  }, []);

  const handleMaster = useCallback(async () => {
    if (!selectedFile || !user) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const duration = await getAudioDurationSec(selectedFile);
      const maxDur = maxUploadDurationSec(user.role);
      if (maxDur !== null && duration > maxDur) {
        throw new Error(durationLimitMessage(user.role));
      }
      await new Promise<void>((r) => setTimeout(r, 40));
      setProgress(0.3);
      const { job_id } = await createJob(selectedFile, platform, intentValue);
      setProgress(1);
      router.push(`/processing/${job_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  }, [selectedFile, platform, intentValue, router, user]);

  const fmt = (b: number) => (b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

  return (
    <main className="relative overflow-hidden">
      <SideBars side="left" />
      <SideBars side="right" />

      <div className="relative z-10 flex flex-col items-center gap-8 px-4 py-10">
        {/* Hero */}
        <header className="space-y-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
            Precision AI Mastering
          </p>
          <h1 className="text-5xl font-extrabold leading-[1.08] text-white sm:text-6xl">
            Drop your mix.
            <br />
            <span
              className="animate-shimmer bg-gradient-to-r from-accent via-violet to-accent bg-clip-text text-transparent"
              style={{ backgroundSize: "200% auto" }}
            >
              Get your master.
            </span>
          </h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-mist-200/55">
            Deep spectral analysis → GPT mastering intent → adaptive DSP chain →{" "}
            streaming-ready exports. No presets. No compromise.
          </p>
          {user && (
            <p className="text-[11px] text-mist-200/40">
              Plan: <span className="font-semibold text-accent/80">{roleBadgeLabel(user.role)}</span>
              {" · "}
              {maxUploadDurationSec(user.role) === null
                ? "No upload length limit"
                : `Max track length: ${Math.floor((maxUploadDurationSec(user.role) ?? 0) / 60)} min`}
            </p>
          )}
        </header>

        {/* Drop zone */}
        <div className="w-full max-w-3xl">
          <div
            className={[
              "relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300",
              dragOver
                ? "border-accent/70 bg-accent/[0.04] shadow-[0_0_70px_rgba(110,231,255,0.12)]"
                : selectedFile
                ? "border-accent/35 bg-white/[0.025]"
                : "border-white/12 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.03]",
            ].join(" ")}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); void onFiles(e.dataTransfer.files); }}
            onClick={() => !selectedFile && !busy && inputRef.current?.click()}
          >
            {/* Subtle dot grid */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.018]"
              style={{
                backgroundImage: "radial-gradient(circle, rgba(110,231,255,1) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />

            <div className="relative flex min-h-[280px] flex-col items-center justify-center gap-5 px-6 py-10">
              {!selectedFile ? (
                <>
                  {/* Hexagon upload icon */}
                  <div
                    className="transition-all duration-300"
                    style={{
                      filter: dragOver
                        ? "drop-shadow(0 0 24px rgba(110,231,255,0.55))"
                        : "drop-shadow(0 0 12px rgba(110,231,255,0.22))",
                      transform: dragOver ? "scale(1.08)" : "scale(1)",
                    }}
                  >
                    <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
                      <path
                        d="M50 6L90 28V72L50 94L10 72V28L50 6Z"
                        stroke={dragOver ? "rgba(110,231,255,0.9)" : "rgba(110,231,255,0.45)"}
                        strokeWidth="1.4"
                        fill={dragOver ? "rgba(110,231,255,0.12)" : "rgba(110,231,255,0.05)"}
                      />
                      <path
                        d="M50 62V38M50 38L41 47M50 38L59 47"
                        stroke={dragOver ? "rgba(110,231,255,1)" : "rgba(110,231,255,0.8)"}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M37 66h26"
                        stroke={dragOver ? "rgba(110,231,255,0.55)" : "rgba(110,231,255,0.35)"}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <div className="space-y-1.5 text-center">
                    <p className="text-base font-semibold text-white">
                      {dragOver ? "Release to upload" : "Drag & drop your audio file here"}
                    </p>
                    <p className="text-xs text-mist-200/45">
                      or{" "}
                      <span className="cursor-pointer text-accent/90 underline underline-offset-2 hover:text-accent">
                        click to browse
                      </span>
                    </p>
                    <p className="text-[11px] text-mist-200/35">WAV or FLAC • 24-bit • Any sample rate</p>
                  </div>

                  <div className="flex gap-2">
                    {["WAV", "FLAC"].map((f) => (
                      <span
                        key={f}
                        className="rounded-full border border-accent/30 bg-accent/[0.06] px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent/70"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex w-full max-w-sm flex-col items-center gap-5 animate-fade-in-up">
                  {/* File card */}
                  <div className="flex w-full items-center gap-4 rounded-2xl border border-accent/20 bg-accent/[0.05] px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="2.5" y="1.5" width="8.5" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                        <path d="M8.5 1.5v4H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                        <path d="M5 9h6M5 11.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.5" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-white">{selectedFile.name}</p>
                      <p className="text-[11px] text-mist-200/50">{fmt(selectedFile.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        if (inputRef.current) inputRef.current.value = "";
                      }}
                      className="shrink-0 rounded-lg p-1.5 text-mist-200/35 transition hover:bg-white/10 hover:text-mist-200"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>

                  {/* Decorative waveform bars */}
                  <div className="flex h-9 w-full items-end justify-center gap-[2px]">
                    {Array.from({ length: 64 }).map((_, i) => {
                      const h = 18 + Math.abs(Math.sin(i * 0.67)) * 50 + Math.abs(Math.sin(i * 1.93 + 1)) * 28;
                      const prog = i / 64;
                      return (
                        <div
                          key={i}
                          className="w-[2px] rounded-full"
                          style={{
                            height: `${h}%`,
                            background: `hsl(${190 + prog * 100}, 80%, 65%)`,
                            opacity: 0.6,
                          }}
                        />
                      );
                    })}
                  </div>

                  {error && <p className="text-xs text-rose-300">{error}</p>}
                </div>
              )}

              {/* Upload progress bar */}
              {busy && (
                <div className="absolute inset-x-6 bottom-5">
                  <div className="h-0.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-700"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-center text-[11px] text-mist-200/45">Uploading…</p>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".wav,.flac,audio/wav,audio/flac,audio/x-flac"
              className="hidden"
              onChange={(e) => void onFiles(e.target.files)}
            />
          </div>
        </div>

        {/* CTA button */}
        {selectedFile && !busy && (
          <button
            type="button"
            onClick={handleMaster}
            className="animate-fade-in-up rounded-2xl bg-gradient-to-r from-accent to-accent/80 px-12 py-3.5 text-sm font-bold text-ink-950 shadow-[0_0_30px_rgba(110,231,255,0.3)] transition-all hover:shadow-[0_0_45px_rgba(110,231,255,0.5)] active:scale-95"
          >
            Master with KORD
          </button>
        )}
        {error && !selectedFile && <p className="text-xs text-rose-300">{error}</p>}

        {/* Advanced Settings */}
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <button
            type="button"
            className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition hover:bg-white/[0.025]"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-mist-200/50">
                <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
                <path
                  d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3 3l1.4 1.4M9.6 9.6l1.4 1.4M3 11l1.4-1.4M9.6 4.4l1.4-1.4"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/75">Advanced Settings</p>
              <p className="text-[10px] text-mist-200/35">Tailor the mastering process to your needs</p>
            </div>
            <div className="flex items-center gap-3">
              {showAdvanced && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlatform("Spotify");
                    setIntentValue(CREATIVE_INTENTS[0].value);
                  }}
                  className="flex items-center gap-1 text-[10px] text-mist-200/45 transition hover:text-mist-200"
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <path d="M7.5 1.5A4 4 0 102.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M7.5 1.5L6 3.5l2 .5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Reset to default
                </button>
              )}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className={`text-mist-200/35 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}
              >
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>

          {showAdvanced && (
            <div className="border-t border-white/[0.06] px-5 pb-5 pt-4 animate-fade-in-up">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {/* Platform */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-mist-200/45">
                      <rect x="1" y="1.5" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
                      <path d="M3.5 9.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-mist-200/45">Platform</span>
                  </div>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-accent/40 transition"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* Creative Intent */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-violet/65">
                      <path d="M5.5 1l1 3h3l-2.5 1.8.9 3-2.4-1.7-2.4 1.7.9-3L2 4h3z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                    </svg>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-mist-200/45">Creative Intent</span>
                  </div>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-accent/40 transition"
                    value={intentValue}
                    onChange={(e) => setIntentValue(e.target.value)}
                  >
                    {CREATIVE_INTENTS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Reference Track (UI only) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-mist-200/45">
                      <path d="M2.5 8.5V4l6-2V6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="2.5" cy="8.5" r="1.3" stroke="currentColor" strokeWidth="1.1" />
                      <circle cx="8.5" cy="6" r="1.3" stroke="currentColor" strokeWidth="1.1" />
                    </svg>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-mist-200/45">Reference Track</span>
                    <span className="rounded bg-white/[0.07] px-1 py-0.5 text-[8px] text-mist-200/35">Optional</span>
                  </div>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-xs text-mist-200/40 transition hover:text-mist-200/70"
                  >
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <path d="M4.5 1v5.5M4.5 6.5L2 4M4.5 6.5L7 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M1 8h7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.5" />
                    </svg>
                    Add reference
                  </button>
                </div>

                {/* Loudness Target (UI only) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-mist-200/45">
                      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.1" />
                      <path d="M3.5 5.5a2 2 0 104 0" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-mist-200/45">Loudness Target</span>
                    <span className="rounded bg-white/[0.07] px-1 py-0.5 text-[8px] text-mist-200/35">Auto</span>
                  </div>
                  <select
                    className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-accent/40 transition"
                    defaultValue="-14"
                  >
                    <option value="-14">-14 LUFS</option>
                    <option value="-16">-16 LUFS</option>
                    <option value="-13">-13 LUFS</option>
                    <option value="-9">-9 LUFS</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Trust badges */}
        <div className="flex w-full max-w-3xl flex-col gap-3 sm:flex-row">
          {[
            {
              icon: "shield",
              title: "Private & Secure",
              sub: "Your audio is encrypted and never stored.",
              color: "text-accent/65",
            },
            {
              icon: "lightning",
              title: "Lightning Fast",
              sub: "AI-powered analysis in seconds.",
              color: "text-gold/65",
            },
            {
              icon: "check",
              title: "Industry Standard",
              sub: "Pro quality, streaming ready.",
              color: "text-violet/65",
            },
          ].map((b) => (
            <div
              key={b.title}
              className="flex flex-1 items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] ${b.color}`}>
                {b.icon === "shield" && (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 1.5L11 3.5v4A5 5 0 016.5 11.5 5 5 0 012 7.5v-4l4.5-2z" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4.5 6.5l1.5 1.5 2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {b.icon === "lightning" && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M7 1L3 6.5h3.5L5 11 9 5.5H5.5L7 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                )}
                {b.icon === "check" && (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 6.5l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{b.title}</p>
                <p className="text-[10px] text-mist-200/38">{b.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

