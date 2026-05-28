"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchResult, fetchStatus } from "@/lib/api";

export default function ProcessingPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;
  const [msg, setMsg] = useState("Queued…");

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await fetchStatus(jobId);
        if (cancelled) return;
        setMsg(s.message || s.status);
        if (s.status === "completed") {
          router.replace(`/result/${jobId}`);
          return;
        }
        if (s.status === "failed") {
          setMsg(s.message || "Processing failed");
          return;
        }
      } catch {
        if (!cancelled) setMsg("Lost connection to API");
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 1200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobId, router]);

  useEffect(() => {
    let cancelled = false;
    const warm = async () => {
      const r = await fetchResult(jobId);
      if (!cancelled && r) router.replace(`/result/${jobId}`);
    };
    void warm();
  }, [jobId, router]);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Mastering in progress</h1>
        <p className="mt-2 text-sm text-mist-200">
          Deep analysis → GPT mastering intent → adaptive DSP → streaming simulations → exports.
        </p>
      </header>
      <div className="glass rounded-2xl p-8">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
        <p className="mt-6 text-center text-sm text-mist-100">{msg}</p>
        <p className="mt-2 text-center text-xs text-mist-200/80">Job ID: {jobId}</p>
      </div>
    </main>
  );
}
