"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DUPLICATE_REQUEST_MESSAGE, sendAccessRequest } from "@/lib/early-access";
import { captureUtm } from "@/lib/utm";
import { AuthFrame } from "@/components/auth/AuthFrame";
import s from "@/components/auth/auth.module.css";

export default function AccessRequestPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  // A tagged link straight to /access-request counts too, not only one via /.
  useEffect(() => {
    captureUtm();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDuplicate(false);
    setBusy(true);
    try {
      const result = await sendAccessRequest({ name, email, phone, reason });
      if (result === "duplicate") setDuplicate(true);
      else setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Request early access"
      line="Kord masters Indian music for release. During early access we set up every artist personally."
    >
      {success ? (
        <div className={s.success} role="status">
          <span className={s.successMark} aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <path d="M6 16l8 8L26 8" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
            </svg>
          </span>
          <h1 className={s.h2}>Request received</h1>
          <p className={s.sub}>
            Thank you. We read every request ourselves and reply within 48 hours, at the email you gave us.
          </p>
          <button type="button" onClick={() => router.push("/")} className={s.btn}>
            Back to Kord home
          </button>
        </div>
      ) : (
        <>
          <h1 className={s.h2}>Tell us about your music</h1>
          <p className={s.sub}>
            Early access unlocks longer uploads, streaming previews, detailed DSP controls and the full set of export
            files.
          </p>

          <form onSubmit={handleSubmit} className={s.form}>
            <div className={s.field}>
              <label htmlFor="ea-name" className={s.label}>
                Full name
              </label>
              <input
                id="ea-name"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={s.input}
              />
            </div>

            <div className={s.field}>
              <label htmlFor="ea-email" className={s.label}>
                Email
              </label>
              <input
                id="ea-email"
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
              <label htmlFor="ea-phone" className={s.label}>
                Phone number
              </label>
              <input
                id="ea-phone"
                required
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className={s.input}
              />
            </div>

            <div className={s.field}>
              <label htmlFor="ea-reason" className={s.label}>
                About your music <span className={s.hint}>(optional)</span>
              </label>
              <textarea
                id="ea-reason"
                rows={4}
                maxLength={1800}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What are you working on? (optional)"
                className={s.input}
              />
            </div>

            {duplicate && (
              <p role="status" className={s.notice}>
                {DUPLICATE_REQUEST_MESSAGE}
              </p>
            )}

            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className={s.btn}>
              {busy ? "Sending request…" : "Send request"}
            </button>
          </form>

          <p className={s.foot}>
            Already have an account?{" "}
            <a href="/login" className={s.link}>
              Log in
            </a>
          </p>
        </>
      )}
    </AuthFrame>
  );
}
