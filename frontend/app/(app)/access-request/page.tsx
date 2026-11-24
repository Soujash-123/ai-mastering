"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import { submitEarlyAccessRequest } from "@/lib/auth";
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

  const enabled = process.env.NEXT_PUBLIC_ENABLE_EARLY_ACCESS_REQUESTS !== "false";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (reason.trim().length < 20) {
      setError("Please write at least 20 characters explaining why you want Early Access.");
      return;
    }
    setBusy(true);
    try {
      await submitEarlyAccessRequest({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        reason: reason.trim(),
      });

      if (enabled) {
        const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
        const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
        const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;
        if (serviceId && templateId && publicKey) {
          await emailjs.send(
            serviceId,
            templateId,
            {
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim(),
              reason: reason.trim(),
              time: new Date().toLocaleString(),
            },
            publicKey,
          );
        }
      }

      setSuccess(true);
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
            Thank you. We read every request ourselves and will get in touch at the email you gave us.
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
                What do you make, and why Kord? <span className={s.hint}>(20 characters or more)</span>
              </label>
              <textarea
                id="ea-reason"
                required
                minLength={20}
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="I produce devotional and indie songs at home and want masters ready for Spotify…"
                className={s.input}
                aria-describedby="ea-reason-count"
              />
              <span id="ea-reason-count" className={`${s.counter} ${reason.length >= 20 ? s.counterOk : ""}`}>
                {reason.length} / 20
              </span>
            </div>

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
