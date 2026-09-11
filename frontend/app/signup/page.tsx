"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { NeonWaveformCanvas } from "@/components/NeonWaveformCanvas";

export default function SignupPage() {
  return (
    <div className="relative min-h-[calc(100vh-57px)] overflow-hidden font-outfit flex flex-col items-center justify-center px-4 py-12">
      {/* Background grid + glows */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)",
          backgroundSize: "60px 60px",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 30%,black 20%,transparent 100%)",
        }}
      />
      <div className="pointer-events-none absolute top-[-15%] left-1/2 w-[600px] h-[600px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(163,230,53,0.07)_0%,transparent_65%)] z-0" />
      <div className="pointer-events-none absolute bottom-[5%] -right-5 w-[350px] h-[350px] bg-[radial-gradient(circle,rgba(34,211,238,0.05)_0%,transparent_65%)] z-0" />
      <div className="pointer-events-none absolute bottom-[5%] -left-5 w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(244,114,182,0.04)_0%,transparent_65%)] z-0" />

      {/* Animated wave header */}
      <div className="relative w-full max-w-md h-[80px] -mb-4 z-10">
        <NeonWaveformCanvas />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#09090b] pointer-events-none" />
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md rounded-3xl p-8 sm:p-10 shadow-[0_0_0_1px_rgba(163,230,53,0.07),0_32px_60px_rgba(0,0,0,0.6)]"
        style={{
          background: "rgba(9,9,11,0.85)",
          border: "1px solid rgba(163,230,53,0.12)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px] opacity-30" />

        <div className="relative z-10 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-6 rounded-full border border-lime-400/20 bg-lime-400/[0.06] text-[10px] font-bold uppercase tracking-[0.2em] text-lime-400">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
            Sign Up
          </div>

          {/* Decorative waveform icon */}
          <div className="flex items-center justify-center gap-[3px] h-10 mb-5">
            {[20, 35, 48, 28, 52, 44, 38, 52, 42, 32, 24, 45, 36].map((h, i) => {
              const isLime = i % 5 === 0;
              const isPink = i % 7 === 0;
              return (
                <div
                  key={i}
                  className="w-[3px] rounded-full"
                  style={{
                    height: `${h}px`,
                    background: isLime
                      ? "linear-gradient(180deg,#a3e635,rgba(163,230,53,0.2))"
                      : isPink
                        ? "linear-gradient(180deg,#f472b6,rgba(244,114,182,0.2))"
                        : "linear-gradient(180deg,#22d3ee,rgba(34,211,238,0.2))",
                    animationName: "waveform-pulse",
                    animationDuration: `${0.8 + i * 0.07}s`,
                    animationTimingFunction: "ease-in-out",
                    animationIterationCount: "infinite",
                    animationDelay: `${i * 0.06}s`,
                  }}
                />
              );
            })}
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white mb-2">
            Sign up is{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-cyan-400">
              invite-only
            </span>
          </h1>
          <p className="text-sm text-white/45 leading-relaxed mb-8 max-w-xs mx-auto">
            We&apos;re in early access. Request an invite to unlock precision AI mastering.
          </p>

          {/* CTA */}
          <Link
            href="/access-request"
            className="relative inline-flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-bold text-[#09090b] transition-all duration-200 hover:-translate-y-px"
            style={{
              background: "linear-gradient(135deg, #a3e635, #22d3ee)",
              boxShadow: "0 0 30px rgba(163,230,53,0.3), 0 0 60px rgba(163,230,53,0.1)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v10M8 11l-4-4M8 11l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 14h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
            </svg>
            Request Early Access
          </Link>

          {/* Feature list */}
          <div className="mt-6 grid grid-cols-2 gap-2.5 text-left">
            {[
              { icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M9.5 1L2.5 9h5l-1.5 6 7.5-8h-5l1.5-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="currentColor"/></svg>, text: "Spectral AI analysis" },
              { icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4v8M8 2v12M13 6v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>, text: "Adaptive DSP chain" },
              { icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 12a1 1 0 100-2 1 1 0 000 2zM3.05 7.05a7 7 0 019.9 0M5.17 9.17a4 4 0 015.66 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>, text: "Streaming-ready exports" },
              { icon: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 7V5a3 3 0 116 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, text: "End-to-end encrypted" },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
                <span className="text-cyan-400 opacity-80">{f.icon}</span>
                <span className="text-[11px] font-medium text-white/60">{f.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-white/[0.06]">
            <p className="text-xs text-white/35">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors underline underline-offset-4 decoration-cyan-400/40"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
