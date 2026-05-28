"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MasteringIntensityBars } from "@/components/mastering/MasteringIntensityBars";
import { apiUrl, fetchResult, type JobResult } from "@/lib/api";

async function drawWaveform(canvas: HTMLCanvasElement, audioUrl: string, color: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const res = await fetch(audioUrl);
  const buf = await res.arrayBuffer();
  const ac = new AudioContext();
  const audio = await ac.decodeAudioData(buf.slice(0));
  await ac.close();
  const ch0 = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(ch0.length / canvas.width));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const mid = canvas.height / 2;
  for (let x = 0; x < canvas.width; x++) {
    let min = 1;
    let max = -1;
    const start = x * step;
    const end = Math.min(ch0.length, start + step);
    for (let i = start; i < end; i++) {
      const s = ch0[i];
      if (s < min) min = s;
      if (s > max) max = s;
    }
    ctx.moveTo(x, (1 + min) * mid);
    ctx.lineTo(x, (1 + max) * mid);
  }
  ctx.stroke();
}

export default function ResultPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [data, setData] = useState<JobResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);

  const urls = useMemo(() => {
    if (!data) return null;
    return {
      in: apiUrl(data.input_url),
      out: apiUrl(data.master_wav_url),
    };
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchResult(jobId);
        if (cancelled) return;
        if (!r) {
          setErr("Result not ready yet. Stay on the processing page.");
          return;
        }
        setData(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load result");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!urls || !beforeRef.current || !afterRef.current) return;
    void (async () => {
      await drawWaveform(beforeRef.current!, urls.in, "rgba(230,234,245,0.55)");
      await drawWaveform(afterRef.current!, urls.out, "rgba(110,231,255,0.85)");
    })();
  }, [urls]);

  if (err) {
    return (
      <main className="space-y-4">
        <p className="text-sm text-rose-300">{err}</p>
        <Link className="text-sm text-accent underline" href={`/processing/${jobId}`}>
          Back to processing
        </Link>
      </main>
    );
  }

  if (!data || !urls) {
    return (
      <main>
        <p className="text-sm text-mist-200">Loading results…</p>
      </main>
    );
  }

  return (
    <main className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-mist-200/70">Mastering report</p>
          <h1 className="text-3xl font-semibold text-white">Your master is ready</h1>
        </div>
        <Link href="/" className="text-sm text-accent underline">
          New upload
        </Link>
      </header>

      <section className="glass rounded-2xl p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-mist-200/80">Before</p>
            <canvas ref={beforeRef} width={900} height={140} className="mt-2 w-full rounded-xl bg-ink-900" />
            <audio className="mt-3 w-full" controls src={urls.in} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-mist-200/80">After</p>
            <canvas ref={afterRef} width={900} height={140} className="mt-2 w-full rounded-xl bg-ink-900" />
            <audio className="mt-3 w-full" controls src={urls.out} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white">Mastering analysis</h2>
          {data.report.analysis_summary && (
            <p className="mt-4 text-sm leading-relaxed text-mist-200/90">{data.report.analysis_summary}</p>
          )}
          {data.report.mix_assessment && (
            <p className="mt-4 text-sm leading-relaxed text-mist-200/90">{data.report.mix_assessment}</p>
          )}
          {data.report.emotional_summary && (
            <p className="mt-4 text-sm leading-relaxed text-mist-200/90">{data.report.emotional_summary}</p>
          )}
          {data.report.emotional_assessment && (
            <p className="mt-4 text-sm leading-relaxed text-mist-200/90">{data.report.emotional_assessment}</p>
          )}
          {[
            ["Mix strengths", data.report.mix_strengths],
            ["Mix issues", data.report.mix_issues],
            ["Mastering focus points", data.report.mastering_focus_points],
            ["Translation notes", data.report.translation_notes],
            ["Spatial notes", data.report.spatial_notes],
            ["Harmonic notes", data.report.harmonic_notes],
          ].map(([title, items]) =>
            Array.isArray(items) && items.length > 0 ? (
              <div key={title} className="mt-4">
                <p className="text-xs uppercase tracking-wide text-mist-200/80">{title}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mist-200">
                  {items.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {data.report.commercial_readiness_assessment && (
            <p className="mt-4 text-sm leading-relaxed text-mist-200/90">
              {data.report.commercial_readiness_assessment}
            </p>
          )}
          {data.report.final_mastering_outlook && (
            <p className="mt-3 text-sm leading-relaxed text-mist-200/90">{data.report.final_mastering_outlook}</p>
          )}
          {data.report.mastering_direction && (
            <p className="mt-3 text-sm leading-relaxed text-mist-200/90">{data.report.mastering_direction}</p>
          )}
          {data.report.translation_assessment && (
            <p className="mt-3 text-sm leading-relaxed text-mist-200/90">{data.report.translation_assessment}</p>
          )}
          {data.report.dynamic_assessment && (
            <p className="mt-3 text-sm leading-relaxed text-mist-200/90">{data.report.dynamic_assessment}</p>
          )}
          {data.report.spatial_assessment && (
            <p className="mt-3 text-sm leading-relaxed text-mist-200/90">{data.report.spatial_assessment}</p>
          )}
          {data.report.final_summary && (
            <p className="mt-3 text-sm leading-relaxed text-mist-200/90">{data.report.final_summary}</p>
          )}
        </div>
        <div className="glass rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-white">Safe intent (DSP layer)</h2>
          <MasteringIntensityBars intent={data.safe_intent} />
          <pre className="mt-3 max-h-[320px] overflow-auto rounded-xl bg-ink-900 p-3 text-xs text-mist-100">
            {JSON.stringify(data.safe_intent, null, 2)}
          </pre>
        </div>
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white">Exports</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.exports.map((e, idx) => (
            <a
              key={`${e.path}-${idx}`}
              href={apiUrl(e.download_url)}
              className="rounded-xl border border-white/10 bg-ink-900/50 px-4 py-3 text-sm text-mist-50 transition hover:border-accent/40 hover:text-white"
              download
            >
              <div className="text-xs text-mist-200">{e.profile}</div>
              <div className="font-medium">{e.format.toUpperCase()}</div>
            </a>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white">Streaming & device simulations</h2>
        <ul className="mt-3 space-y-1 text-xs text-mist-200">
          {data.streaming_notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
