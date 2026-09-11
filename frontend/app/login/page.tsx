"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { NeonWaveformCanvas } from "@/components/NeonWaveformCanvas";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

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
      <div className="pointer-events-none absolute top-[-15%] left-1/2 w-[600px] h-[600px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(34,211,238,0.08)_0%,transparent_65%)] z-0" />
      <div className="pointer-events-none absolute bottom-[5%] -right-5 w-[350px] h-[350px] bg-[radial-gradient(circle,rgba(163,230,53,0.05)_0%,transparent_65%)] z-0" />

      {/* Animated wave header */}
      <div className="relative w-full max-w-md h-[80px] -mb-4 z-10">
        <NeonWaveformCanvas />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#09090b] pointer-events-none" />
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md rounded-3xl p-8 sm:p-10 shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_32px_60px_rgba(0,0,0,0.6)]"
        style={{
          background: "rgba(9,9,11,0.85)",
          border: "1px solid rgba(34,211,238,0.12)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Scan-line overlay */}
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px] opacity-30" />

        <div className="relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-5 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
            <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse shadow-[0_0_8px_#a3e635]" />
            Welcome Back
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white mb-1">
            Sign in to{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-lime-400">
              KORD
            </span>
          </h1>
          <p className="text-sm text-white/40 mb-8">
            AI-powered mastering, precision results.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                Email
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all duration-200 placeholder:text-white/20"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(34,211,238,0.15)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(34,211,238,0.5)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(34,211,238,0.08), 0 0 20px rgba(34,211,238,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(34,211,238,0.15)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                Password
              </label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all duration-200 placeholder:text-white/20"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(34,211,238,0.15)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(34,211,238,0.5)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(34,211,238,0.08), 0 0 20px rgba(34,211,238,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(34,211,238,0.15)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3">
                <p className="text-sm text-rose-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="relative w-full overflow-hidden rounded-xl py-3.5 text-sm font-bold text-[#09090b] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: busy
                  ? "rgba(34,211,238,0.5)"
                  : "linear-gradient(135deg, #22d3ee, #a3e635)",
                boxShadow: busy ? "none" : "0 0 30px rgba(34,211,238,0.35), 0 0 60px rgba(34,211,238,0.1)",
              }}
            >
              <span className="relative z-10">{busy ? "Signing in…" : "Sign In"}</span>
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
            <p className="text-xs text-white/35">
              No account?{" "}
              <Link
                href="/signup"
                className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors underline underline-offset-4 decoration-cyan-400/40"
              >
                Request Early Access
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Trust badges below card */}
      <div className="relative z-10 mt-8 flex flex-wrap items-center justify-center gap-5">
        {[
          { dot: "#a3e635", text: "End-to-end encrypted" },
          { dot: "#22d3ee", text: "Auto-deleted after 10 min" },
          { dot: "#f472b6", text: "No data stored" },
        ].map((b) => (
          <div key={b.text} className="flex items-center gap-2 text-[11px] text-white/35">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.dot, boxShadow: `0 0 6px ${b.dot}` }} />
            {b.text}
          </div>
        ))}
      </div>
    </div>
  );
}
