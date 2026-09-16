import React from "react";
import Link from "next/link";
import { type JobResult, apiUrl } from "@/lib/api";
import { ANALYSIS_CARDS, AnalysisIcon, fmtTime, type ResultProps } from "./ResultAurora";
import { NeonWaveformCanvas } from "./NeonWaveformCanvas";

function pickNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

const BAR_META = [
  { label: "Warmth", desc: "Low-mid body", icon: "🔥", color: "#22d3ee" },
  { label: "Brightness", desc: "Clarity & air", icon: "✨", color: "#a3e635" },
  { label: "Punch", desc: "Transient impact", icon: "⚡", color: "#f472b6" },
  { label: "Width", desc: "Spatial depth", icon: "↔", color: "#22d3ee" },
];

function NeonIntensityBars({ intent }: { intent: Record<string, unknown> | null | undefined }) {
  if (!intent) return null;
  const eq = intent.eq_strategy as Record<string, unknown> | undefined;
  const comp = intent.compression_strategy as Record<string, unknown> | undefined;
  const spat = intent.spatial_strategy as Record<string, unknown> | undefined;

  const values = [
    pickNum(eq?.warmth_intensity),
    pickNum(eq?.brightness_intensity),
    pickNum(comp?.punch_preservation),
    pickNum(spat?.stereo_width_amount),
  ];

  if (!values.some((v) => v != null)) return <p className="text-sm text-white/40">No DSP intent recorded.</p>;

  return (
    <div className="flex flex-col gap-6">
      {BAR_META.map((meta, i) => {
        const val = values[i];
        if (val == null) return null;
        const pct = (Math.min(10, Math.max(0, val)) / 10) * 100;
        return (
          <div key={meta.label}>
            <div className="flex justify-between items-end mb-2">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-white/80">{meta.label}</span>
                <p className="text-[10px] text-white/40 mt-0.5">{meta.desc}</p>
              </div>
              <span className="font-mono text-xl font-black" style={{ color: meta.color }}>{val.toFixed(1)}</span>
            </div>
            <div className="relative h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/5">
              <div 
                className="absolute top-0 left-0 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_currentColor]"
                style={{ width: `${pct}%`, backgroundColor: meta.color, color: meta.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ResultNeon({
  jobId, data, urls, tierCfg, masterBars, isPlaying, showComparison,
  currentTime, duration, copiedId, onCopyId, onTogglePlay, onToggleComparison,
  onSeek, beforeRef, masterAudioRef, onAudioEnded, onAudioError, onAudioTimeUpdate, onAudioLoadedMetadata,
  drawWaveform, downloadUrl, liveTargetLufs, controlPanel, isFinalized = true,
  drawPeaks, waveformPeaks
}: ResultProps) {
  const analysis = data.analysis as Record<string, unknown>;
  const safeIntent = data.safe_intent as Record<string, unknown>;
  const intLufs = analysis?.integrated_lufs != null ? `${Number(analysis.integrated_lufs).toFixed(1)} LUFS` : "—";
  const tgtLufs = (safeIntent?.loudness_strategy as Record<string, unknown>)?.target_lufs != null ? `${Number((safeIntent.loudness_strategy as Record<string, unknown>).target_lufs).toFixed(1)} LUFS` : "—";
  const downloadHref = downloadUrl ?? urls.out;

  return (
    <div className="min-h-[calc(100vh-53px)] relative overflow-hidden font-outfit text-white/90 pb-20">
      {/* Background Grids & Glows from Neon Theme */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_30%,black_20%,transparent_100%)]" />
      <div className="pointer-events-none absolute top-[-15%] left-1/2 w-[600px] h-[600px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(34,211,238,0.07)_0%,transparent_65%)] z-0" />
      <div className="pointer-events-none absolute bottom-[10%] right-[-5%] w-[350px] h-[350px] bg-[radial-gradient(circle,rgba(163,230,53,0.05)_0%,transparent_65%)] z-0" />

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        {/* Wave Hero */}
        <div className="relative w-full h-[160px] -mb-10">
          <NeonWaveformCanvas />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#09090b] pointer-events-none" />
        </div>

        {/* Header Section */}
        <header className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-cyan-400/20 bg-cyan-400/5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
              {isFinalized ? "Analysis Complete" : "Live Preview"}
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3">
              Mastering <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-lime-400">{isFinalized ? "Finalized" : "Preview"}</span>
            </h1>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-cyan-200/40">ID: {jobId}</span>
              <button type="button" onClick={onCopyId} className="px-2 py-1 rounded border border-white/5 bg-white/5 text-[10px] font-bold uppercase tracking-wider text-cyan-200/60 hover:text-cyan-400 hover:border-cyan-400/30 transition-all">
                {copiedId ? "Copied" : "Copy ID"}
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-white/60 bg-transparent border border-white/10 rounded-xl hover:text-white hover:bg-white/5 transition-all"
            >
              Start New
            </Link>
            <a
              href={downloadHref}
              download
              className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-[#09090b] bg-cyan-400 rounded-xl hover:bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v7M7 9l-3-3M7 9l3-3M2 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Download Master
            </a>
          </div>
        </header>

        {/* Top Stats Bar */}
        <div className="flex flex-wrap gap-4 mb-8">
          {[
            { label: "Original LUFS", val: intLufs },
            { label: "Target LUFS", val: liveTargetLufs ?? tgtLufs },
            { label: "Resolution", val: "24-bit" },
            { label: "Format", val: "WAV" }
          ].map((s, i) => (
            <div key={i} className="flex-1 min-w-[140px] p-5 border border-cyan-400/10 rounded-2xl bg-[#09090b]/60 backdrop-blur-md shadow-[0_0_0_1px_rgba(34,211,238,0.02),0_8px_20px_rgba(0,0,0,0.4)] text-center transition-colors hover:border-cyan-400/30">
              <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-lime-400 font-mono tracking-tight">{s.val}</div>
              <div className="text-[9px] uppercase tracking-[0.15em] text-cyan-200/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Master Playback Area */}
        <div className="relative mb-8 rounded-3xl border border-cyan-400/15 bg-[#09090b]/80 backdrop-blur-xl shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_32px_60px_rgba(0,0,0,0.5)] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-400/[0.02] to-transparent pointer-events-none" />
          
          <div className="p-6 md:p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-cyan-400">Master Playback</h2>
              
              {/* Compare Toggle inside playback area */}
              {tierCfg.canPlaySimulations ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-200/50">Compare</span>
                  <button
                    type="button"
                    onClick={onToggleComparison}
                    className={`relative w-12 h-6 rounded-full transition-colors border ${showComparison ? 'bg-cyan-400/20 border-cyan-400/50' : 'bg-white/5 border-white/10'}`}
                  >
                    <span className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-cyan-400 transition-transform ${showComparison ? 'translate-x-7 shadow-[0_0_10px_#22d3ee]' : 'translate-x-1 bg-white/40'}`} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                  <span className="text-xs font-bold uppercase tracking-wider text-white/30">Compare</span>
                  <span className="px-2 py-0.5 rounded border border-lime-400/30 text-[8px] font-bold text-lime-400 uppercase tracking-widest bg-lime-400/10">EA Only</span>
                </div>
              )}
            </div>

            {/* Waveform Visualization */}
            <div className="relative h-32 flex items-end gap-[3px] mb-6">
              {(masterBars.length > 0 ? masterBars : Array.from({ length: 100 }, () => 0.25)).map((amp, i) => {
                const hue = 185 - (i / 100) * 40;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-full"
                    style={{
                      height: `${Math.max(4, amp * 100)}%`,
                      background: `linear-gradient(180deg, hsla(${hue}, 90%, 65%, 1), hsla(${hue}, 90%, 65%, 0.2))`,
                      boxShadow: isPlaying ? `0 0 10px hsla(${hue}, 90%, 65%, 0.4)` : "none",
                      opacity: (currentTime / (duration || 1)) > (i / 100) ? 1 : 0.4
                    }}
                  />
                );
              })}
              {/* Playhead */}
              {duration > 0 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-white shadow-[0_0_15px_#fff] z-10"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={onTogglePlay}
                className="flex items-center justify-center w-14 h-14 rounded-2xl border-2 border-cyan-400 bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 hover:scale-105 transition-all shadow-[0_0_20px_rgba(34,211,238,0.2)]"
              >
                {isPlaying ? (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="2" width="4" height="14" rx="1" fill="currentColor"/><rect x="11" y="2" width="4" height="14" rx="1" fill="currentColor"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 2.5L15 9 4 15.5v-13z" fill="currentColor"/></svg>
                )}
              </button>
              
              <span className="font-mono text-sm text-cyan-400 w-12">{fmtTime(currentTime)}</span>
              
              <div className="relative flex-1 h-2 bg-white/5 rounded-full cursor-pointer" onClick={onSeek}>
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-cyan-400 to-lime-400"
                  style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              
              <span className="font-mono text-sm text-cyan-200/40 w-12 text-right">{fmtTime(duration)}</span>
            </div>
            <audio
              ref={masterAudioRef}
              src={urls.out}
              className="hidden"
              preload="metadata"
              onEnded={onAudioEnded}
              onError={onAudioError}
              onTimeUpdate={onAudioTimeUpdate}
              onLoadedMetadata={onAudioLoadedMetadata}
            />
          </div>
        </div>

        {/* DSP Control Panel (live preview editing) */}
        {controlPanel && <div className="relative mb-8">{controlPanel}</div>}

        {/* Compare Section */}
        {showComparison && (
          <div className="mb-8 p-6 md:p-8 rounded-3xl border border-pink-400/20 bg-[#09090b]/80 backdrop-blur-xl shadow-[0_0_0_1px_rgba(244,114,182,0.05),0_32px_60px_rgba(0,0,0,0.5)]">
            <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-pink-400 mb-6">A/B Comparison</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-white/30" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white/50">Original</span>
                </div>
                <div className="p-4 rounded-xl border border-white/5 bg-black/50">
                  <canvas ref={beforeRef} width={800} height={60} className="w-full h-[60px] opacity-60" />
                  <audio className="w-full mt-4 h-8" controls preload="none" src={urls.in} />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Mastered</span>
                </div>
                <div className="p-4 rounded-xl border border-cyan-400/20 bg-cyan-400/5 shadow-[inset_0_0_20px_rgba(34,211,238,0.05)]">
                  <canvas 
                    ref={(el) => { if (el && urls) { if (drawPeaks && waveformPeaks && waveformPeaks.length > 0) drawPeaks(el, waveformPeaks, "neon"); else void drawWaveform(el, urls.out, "neon"); } }} 
                    width={800} height={60} className="w-full h-[60px]" 
                  />
                  <audio className="w-full mt-4 h-8" controls preload="none" src={urls.out} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lower Grid (Analysis & Export) */}
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Analysis Report */}
          <div className="lg:col-span-2 rounded-3xl border border-white/5 bg-[#09090b]/60 backdrop-blur-md p-6 md:p-8">
            <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-white/50 mb-6">AI Analysis Report</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {ANALYSIS_CARDS.map(({ key, label, icon, color, featured }) => {
                const value = (data.report as Record<string, unknown>)[key] as string | undefined;
                if (!value) return null;
                const neonColor = featured ? "#a3e635" : (color === "#a78bfa" ? "#f472b6" : "#22d3ee");
                
                return (
                  <div key={key} className={`p-5 rounded-2xl border ${featured ? 'border-lime-400/30 bg-lime-400/5 sm:col-span-2' : 'border-white/5 bg-black/40'}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center border" style={{ borderColor: `${neonColor}40`, backgroundColor: `${neonColor}10` }}>
                        <AnalysisIcon type={icon} color={neonColor} />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: neonColor }}>{label}</span>
                    </div>
                    <p className="text-sm text-cyan-100/60 leading-relaxed">{value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column (DSP & Export) */}
          <div className="flex flex-col gap-8">
            {/* DSP Intent */}
            <div className="rounded-3xl border border-white/5 bg-[#09090b]/60 backdrop-blur-md p-6">
              <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-white/50 mb-6">DSP Intent</h2>
              <NeonIntensityBars intent={data.safe_intent} />
            </div>

            {/* Export Files */}
            {data.exports.length > 0 && (
              <div className="rounded-3xl border border-white/5 bg-[#09090b]/60 backdrop-blur-md p-6">
                <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-white/50 mb-6">Exports</h2>
                <div className="flex flex-col gap-3">
                  {data.exports.map((e, idx) => (
                    <a
                      key={idx}
                      href={apiUrl(e.download_url)}
                      download
                      className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 hover:border-cyan-400/40 hover:bg-cyan-400/5 transition-all group"
                    >
                      <div>
                        <p className="text-xs text-white/40 mb-1">{e.profile}</p>
                        <p className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{e.format.toUpperCase()}</p>
                      </div>
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-white/20 group-hover:text-cyan-400 transition-colors">
                        <path d="M10 4v10M6 10l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
