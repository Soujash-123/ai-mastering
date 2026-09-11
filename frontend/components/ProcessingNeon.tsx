import React from "react";
import { STEPS, STEP_DESCRIPTIONS, fmtTime, ProcessingProps } from "./ProcessingAurora";
import { NeonWaveformCanvas } from "./NeonWaveformCanvas";

const STATUS_STEP: Record<string, number> = {
  queued: -1,
  analyzing: 0,
  reasoning: 1,
  mastering: 2,
  exporting: 3,
  completed: 4,
  failed: -2,
};

function NeonCircularProgress({ pct }: { pct: number }) {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="rgba(34,211,238,0.1)"
          strokeWidth="6"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="url(#neon-gradient)"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-in-out"
          style={{ filter: "drop-shadow(0 0 8px rgba(34,211,238,0.6))" }}
        />
        <defs>
          <linearGradient id="neon-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a3e635" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-lime-400 font-sans tracking-tight">
          {pct}%
        </span>
      </div>
    </div>
  );
}

export function ProcessingNeon({ jobId, status, progress, message, elapsed, copied, onCopyId, onBack }: ProcessingProps) {
  const currentStep = STATUS_STEP[status] ?? -1;
  const pct = Math.round(progress * 100);
  const remaining = Math.max(0, 90 - elapsed);
  const desc = STEP_DESCRIPTIONS[status] ?? STEP_DESCRIPTIONS.queued;

  return (
    <div className="min-h-[calc(100vh-53px)] relative overflow-hidden font-outfit text-white/90 pb-16">
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

        <header className="relative z-10 flex flex-col md:flex-row justify-between items-start mb-12">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-4 rounded-full border border-cyan-400/20 bg-cyan-400/5 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse shadow-[0_0_8px_#a3e635]" />
              Engine Active
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2">
              Synthesizing <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-lime-400">Master</span>
            </h1>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-cyan-200/40">{jobId}</span>
              <button type="button" onClick={onCopyId} className="p-1 rounded text-cyan-200/40 hover:text-cyan-400 transition-colors">
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-cyan-400 bg-transparent border border-cyan-400/30 rounded-xl hover:bg-cyan-400/10 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)] transition-all"
          >
            Cancel
          </button>
        </header>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* Main Status Area (Left 7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="relative p-10 rounded-3xl border border-cyan-400/10 bg-[#09090b]/80 backdrop-blur-xl shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_32px_60px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center text-center overflow-hidden min-h-[400px]">
              
              {/* Decorative scanline overlay */}
              <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.2)_50%)] bg-[length:100%_4px] pointer-events-none opacity-50 mix-blend-overlay" />

              <NeonCircularProgress pct={pct} />
              
              <div className="mt-8 z-10">
                <p className="text-xl font-bold text-white mb-2">{desc.title}</p>
                <p className="text-sm text-cyan-100/60 max-w-md mx-auto">{desc.body}</p>
              </div>

              <div className="mt-8 flex items-center justify-center gap-8 w-full max-w-sm border-t border-cyan-400/10 pt-6 z-10">
                <div className="text-center">
                  <p className="text-2xl font-black text-cyan-400 font-mono">{fmtTime(elapsed)}</p>
                  <p className="text-[9px] uppercase tracking-widest text-cyan-200/40 mt-1">Elapsed</p>
                </div>
                <div className="w-px h-8 bg-cyan-400/20" />
                <div className="text-center">
                  <p className="text-2xl font-black text-lime-400 font-mono">{fmtTime(remaining)}</p>
                  <p className="text-[9px] uppercase tracking-widest text-cyan-200/40 mt-1">Est. Left</p>
                </div>
              </div>
            </div>

            {/* Live Log */}
            <div className="p-5 rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400/50 mb-3">System Log</p>
              <div className="font-mono text-xs text-cyan-200/80 bg-black/40 rounded-xl p-4 border border-cyan-400/10 shadow-inner">
                <span className="text-lime-400 mr-2">&gt;</span> {message}
                <span className="inline-block w-1.5 h-3 ml-1 bg-cyan-400 animate-pulse" />
              </div>
            </div>
          </div>

          {/* Steps Sidebar (Right 5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="p-8 rounded-3xl border border-cyan-400/10 bg-[#09090b]/80 backdrop-blur-xl shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_32px_60px_rgba(0,0,0,0.5)]">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white/50 mb-8">DSP Pipeline</h3>
              <div className="flex flex-col gap-6">
                {STEPS.map((step, i) => {
                  const done = currentStep > i;
                  const active = currentStep === i;
                  const waiting = currentStep < i;

                  return (
                    <div key={step.id} className="relative flex items-start gap-4">
                      {/* Connector Line */}
                      {i < STEPS.length - 1 && (
                        <div className={`absolute left-[15px] top-10 w-0.5 h-10 ${done ? 'bg-cyan-400/50' : 'bg-white/5'}`} />
                      )}
                      
                      {/* Icon container */}
                      <div className={`relative z-10 flex w-8 h-8 shrink-0 items-center justify-center rounded-xl border ${
                        done ? 'bg-cyan-400/10 border-cyan-400/30 text-cyan-400' :
                        active ? 'bg-lime-400/10 border-lime-400/40 text-lime-400 shadow-[0_0_15px_rgba(163,230,53,0.3)] scale-110 transition-transform' :
                        'bg-white/5 border-white/10 text-white/20'
                      }`}>
                        {done ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5 9.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        ) : active ? (
                          <span className="w-2 h-2 bg-lime-400 rounded-full animate-pulse" />
                        ) : (
                          <span className="text-[10px] font-bold font-mono">{i + 1}</span>
                        )}
                      </div>

                      {/* Text content */}
                      <div className={`pt-1 ${waiting ? 'opacity-50' : 'opacity-100'}`}>
                        <p className={`text-sm font-bold ${done ? 'text-white' : active ? 'text-lime-400' : 'text-white/60'}`}>
                          {step.label}
                        </p>
                        <p className="text-xs text-cyan-100/40 mt-1">{step.sub}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tip block */}
            <div className="mt-auto p-6 rounded-3xl border border-pink-400/10 bg-pink-400/5 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-pink-400"><path d="M7 13A6 6 0 107 1a6 6 0 000 12zM7 4v3M7 9h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <p className="text-[10px] font-bold uppercase tracking-widest text-pink-400">Pro Tip</p>
              </div>
              <p className="text-xs text-pink-100/70 leading-relaxed">{desc.tip}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
