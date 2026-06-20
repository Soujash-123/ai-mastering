"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

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
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent/70">Welcome back</p>
        <h1 className="mt-2 text-2xl font-extrabold text-white">Sign in to KORD</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-200/40">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-200/40">Password</span>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
          </label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-ink-950 disabled:opacity-50">
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-mist-200/45">
          No account?{" "}
          <Link href="/signup" className="text-accent underline">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
