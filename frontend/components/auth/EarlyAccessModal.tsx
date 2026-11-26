"use client";

import { FormEvent, useState } from "react";
import { DUPLICATE_REQUEST_MESSAGE, sendAccessRequest } from "@/lib/early-access";

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
  const [duplicate, setDuplicate] = useState(false);

  if (!open) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-violet/25 bg-ink-900 p-6 shadow-2xl">
        {success ? (
          <div className="space-y-4 text-center">
            <p className="text-lg font-bold text-white">Request submitted</p>
            <p className="text-sm text-mist-200/60">
              Thanks! We read every request ourselves and reply within 48 hours.
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
                <span className="text-xs font-semibold text-mist-200/40">Full Name</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-mist-200/40">Email Address</span>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-mist-200/40">Phone Number</span>
                <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-mist-200/40">About your music (optional)</span>
                <textarea rows={4} maxLength={1800} placeholder="What are you working on? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full resize-none rounded-xl border border-white/10 bg-ink-950 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/40" />
              </label>
              {duplicate && <p role="status" className="text-sm text-mist-200/80">{DUPLICATE_REQUEST_MESSAGE}</p>}
              {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
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
