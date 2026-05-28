"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { createJob } from "@/lib/api";

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("Spotify");
  const [intent, setIntent] = useState("Preserve dynamics; improve translation.");

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const file = files[0];
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext !== "wav" && ext !== "flac") {
        setError("Only .wav and .flac files are accepted.");
        return;
      }
      setError(null);
      setBusy(true);
      setProgress(0);
      try {
        await new Promise<void>((r) => setTimeout(r, 50));
        setProgress(0.25);
        const { job_id } = await createJob(file, platform, intent);
        setProgress(1);
        router.push(`/processing/${job_id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [intent, platform, router],
  );

  const hint = useMemo(
    () => "WAV or FLAC only. Files are decoded in the API and stored as 24-bit PCM WAV for processing.",
    [],
  );

  return (
    <main className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.25em] text-mist-200/70">Elite AI Mastering</p>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl">Upload your mix</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist-200">
          Analysis drives the chain. GPT shapes high-level intent. DSP safety keeps it musical, loudness-aware, and
          streaming-resilient—without flattening your art into a preset.
        </p>
      </header>

      <section className="glass rounded-2xl p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <label className="space-y-2 text-sm text-mist-200">
            Target platform
            <select
              className="w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-mist-50 outline-none ring-accent/40 focus:ring-2"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              {["Spotify", "Apple Music", "YouTube", "SoundCloud", "Club / PA", "Broadcast"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-mist-200 md:col-span-2">
            Creative intent (optional)
            <textarea
              className="min-h-[88px] w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-mist-50 outline-none ring-accent/40 focus:ring-2"
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Example: keep vocals intimate but widen the chorus lift…"
            />
          </label>
        </div>

        <div
          className={[
            "mt-6 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center transition",
            dragOver ? "border-accent bg-accent/5" : "border-white/15 bg-ink-900/40 hover:border-white/25",
          ].join(" ")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onFiles(e.dataTransfer.files);
          }}
          onClick={() => document.getElementById("file")?.click()}
        >
          <p className="text-sm font-medium text-white">Drag & drop audio</p>
          <p className="mt-2 max-w-md text-xs text-mist-200">{hint}</p>
          {busy && (
            <div className="mt-6 w-full max-w-sm">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-mist-200">Uploading…</p>
            </div>
          )}
          {error && <p className="mt-4 text-xs text-rose-300">{error}</p>}
        </div>

        <input
          id="file"
          type="file"
          accept=".wav,.flac,audio/wav,audio/flac,audio/x-flac"
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />
      </section>

      <footer className="text-xs text-mist-200/70">
        Backend must be running at <span className="text-mist-100">{process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000"}</span>
        . Configure <code className="rounded bg-white/5 px-1">NEXT_PUBLIC_API_BASE</code> in{" "}
        <code className="rounded bg-white/5 px-1">frontend/.env.local</code>.
      </footer>
    </main>
  );
}
