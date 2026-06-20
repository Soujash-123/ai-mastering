"use client";

import { FormEvent, useState } from "react";
import emailjs from "@emailjs/browser";
import { submitEarlyAccessRequest } from "@/lib/auth";

type Props = {
  open: boolean;
  onClose: () => void;
  defaultEmail?: string;
  defaultName?: string;
};

export function EarlyAccessModal({ open, onClose, defaultEmail = "", defaultName = "" }: Props) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-violet/25 bg-ink-900 p-6 shadow-2xl">
        {success ? (
          <div className="space-y-4 text-center">
            <p className="text-lg font-bold text-white">Request submitted</p>
            <p className="text-sm text-mist-200/60">
              Thanks! We&apos;ve received your Early Access request and will be in touch.
            </p>
            <button type="button" onClick={onClose} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-ink-950">
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-white">Request Early Access</h2>
            <p className="mt-1 text-sm text-mist-200/55">
              Unlock longer uploads, streaming simulations, and full platform features.
            </p>
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-200/40">Full Name</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-200/40">Email Address</span>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-200/40">Phone Number</span>
                <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-mist-200/40">Why would you like Early Access?</span>
                <textarea required minLength={20} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full resize-none rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
              </label>
              {error && <p className="text-sm text-rose-300">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-mist-200/60">
                  Cancel
                </button>
                <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-violet px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  {busy ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
