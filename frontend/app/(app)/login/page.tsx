"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthFrame } from "@/components/auth/AuthFrame";
import s from "@/components/auth/auth.module.css";

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
    <AuthFrame
      title="Welcome back to the studio"
      line="Masters for classical, devotional, film, dance and indie, each the way it is meant to sound."
    >
      <h1 className={s.h2}>Log in to Kord</h1>
      <p className={s.sub}>Use the email and password we set up with you.</p>

      <form onSubmit={onSubmit} className={s.form}>
        <div className={s.field}>
          <label htmlFor="login-email" className={s.label}>
            Email
          </label>
          <input
            id="login-email"
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={s.input}
          />
        </div>

        <div className={s.field}>
          <label htmlFor="login-password" className={s.label}>
            Password
          </label>
          <input
            id="login-password"
            required
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={s.input}
          />
        </div>

        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={s.btn}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className={s.foot}>
        No account yet?{" "}
        <Link href="/signup" className={s.link}>
          Request early access
        </Link>
      </p>
      <p className={s.foot}>
        Uploads are deleted about 10 minutes after you finish working on a track; finished masters after 12 hours.
      </p>
    </AuthFrame>
  );
}
