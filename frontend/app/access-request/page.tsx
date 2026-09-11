"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import emailjs from "@emailjs/browser";
import { submitEarlyAccessRequest } from "@/lib/auth";
import { NeonWaveformCanvas } from "@/components/NeonWaveformCanvas";

const FIELD_STYLE = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(34,211,238,0.15)",
} as const;

const FIELD_FOCUS = {
  borderColor: "rgba(34,211,238,0.5)",
  boxShadow: "0 0 0 3px rgba(34,211,238,0.08), 0 0 20px rgba(34,211,238,0.1)",
} as const;

const FIELD_BLUR = {
  borderColor: "rgba(34,211,238,0.15)",
  boxShadow: "none",
} as const;

const inputClass =
  "w-full rounded-xl px-4 py-3 text-sm text-white outline-none transition-all duration-200 placeholder:text-white/20";

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
      <div className="pointer-events-none absolute top-[-15%] left-1/2 w-[700px] h-[700px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(34,211,238,0.07)_0%,transparent_65%)] z-0" />
      <div className="pointer-events-none absolute bottom-0 right-[-5%] w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(163,230,53,0.05)_0%,transparent_65%)] z-0" />
      <div className="pointer-events-none absolute bottom-0 left-[-5%] w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(244,114,182,0.04)_0%,transparent_65%)] z-0" />

      {/* Wave header */}
      <div className="relative w-full max-w-lg h-[80px] -mb-4 z-10">
        <NeonWaveformCanvas />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#09090b] pointer-events-none" />
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-lg rounded-3xl shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_32px_60px_rgba(0,0,0,0.6)]"
        style={{
          background: "rgba(9,9,11,0.88)",
          border: "1px solid rgba(34,211,238,0.10)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.15)_50%)] bg-[length:100%_4px] opacity-30" />

        <div className="relative z-10 p-8 sm:p-10">
          {success ? (
            <div className="flex flex-col items-center gap-6 py-8 text-center">
              {/* Success glow circle */}
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full"
                style={{
                  background: "rgba(163,230,53,0.1)",
                  border: "1px solid rgba(163,230,53,0.3)",
                  boxShadow: "0 0 40px rgba(163,230,53,0.2)",
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M6 16l8 8L26 8" stroke="#a3e635" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white mb-2">Request Submitted!</h2>
                <p className="text-sm text-white/50 leading-relaxed max-w-xs mx-auto">
                  Thanks! We&apos;ve received your Early Access request and will be in touch shortly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-[#09090b] transition-all hover:-translate-y-px"
                style={{
                  background: "linear-gradient(135deg, #22d3ee, #a3e635)",
                  boxShadow: "0 0 24px rgba(34,211,238,0.3)",
                }}
              >
                Back to Studio
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-8">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-5 rounded-full border border-pink-400/20 bg-pink-400/[0.06] text-[10px] font-bold uppercase tracking-[0.2em] text-pink-400">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 9A4 4 0 105 1a4 4 0 000 8zM5 3v2.5M5 6.5h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Early Access
                </div>
                <h1 className="text-3xl font-black tracking-tight text-white mb-2">
                  Request{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-lime-400">
                    Early Access
                  </span>
                </h1>
                <p className="text-sm text-white/45 leading-relaxed">
                  Unlock longer uploads, streaming simulations, advanced DSP controls, and full platform features.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Full Name */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                    Full Name
                  </label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className={inputClass}
                    style={FIELD_STYLE}
                    onFocus={(e) => Object.assign(e.currentTarget.style, FIELD_FOCUS)}
                    onBlur={(e) => Object.assign(e.currentTarget.style, FIELD_BLUR)}
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                    Email Address
                  </label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                    style={FIELD_STYLE}
                    onFocus={(e) => Object.assign(e.currentTarget.style, FIELD_FOCUS)}
                    onBlur={(e) => Object.assign(e.currentTarget.style, FIELD_BLUR)}
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                    Phone Number
                  </label>
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className={inputClass}
                    style={FIELD_STYLE}
                    onFocus={(e) => Object.assign(e.currentTarget.style, FIELD_FOCUS)}
                    onBlur={(e) => Object.assign(e.currentTarget.style, FIELD_BLUR)}
                  />
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">
                    Why would you like Early Access?
                    <span className="ml-2 font-normal lowercase text-white/30 normal-case tracking-normal">(min. 20 chars)</span>
                  </label>
                  <textarea
                    required
                    minLength={20}
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="I'm a producer looking to streamline my mastering workflow and get streaming-ready results fast…"
                    className={`${inputClass} resize-none`}
                    style={FIELD_STYLE}
                    onFocus={(e) => Object.assign(e.currentTarget.style, FIELD_FOCUS)}
                    onBlur={(e) => Object.assign(e.currentTarget.style, FIELD_BLUR)}
                  />
                  <div className="flex justify-end">
                    <span className={`text-[10px] ${reason.length < 20 ? "text-white/25" : "text-lime-400"}`}>
                      {reason.length} / 20+
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3">
                    <p className="text-sm text-rose-300">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="relative w-full overflow-hidden rounded-xl py-3.5 text-sm font-bold text-[#09090b] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-px"
                  style={{
                    background: busy
                      ? "rgba(34,211,238,0.5)"
                      : "linear-gradient(135deg, #22d3ee, #a3e635)",
                    boxShadow: busy ? "none" : "0 0 30px rgba(34,211,238,0.3), 0 0 60px rgba(34,211,238,0.1)",
                  }}
                >
                  <span className="relative z-10">
                    {busy ? "Submitting…" : "Submit Request →"}
                  </span>
                </button>
              </form>

              {/* Footer link */}
              <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-xs text-white/35">
                  Already have an account?{" "}
                  <a href="/login" className="font-semibold text-cyan-400 hover:text-cyan-300 transition-colors underline underline-offset-4 decoration-cyan-400/40">
                    Sign in
                  </a>
                </p>
                <div className="flex items-center gap-4">
                  {[
                    { dot: "#a3e635", text: "Encrypted" },
                    { dot: "#22d3ee", text: "Private" },
                  ].map((b) => (
                    <div key={b.text} className="flex items-center gap-1.5 text-[10px] text-white/30">
                      <span className="w-1 h-1 rounded-full" style={{ background: b.dot }} />
                      {b.text}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
