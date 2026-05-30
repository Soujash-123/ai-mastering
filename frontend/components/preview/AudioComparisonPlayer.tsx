"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  beforeUrl: string;
  afterUrl: string;
  durationSec?: number;
};

export function AudioComparisonPlayer({ beforeUrl, afterUrl, durationSec }: Props) {
  const [mode, setMode] = useState<"before" | "after">("before");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const src = useMemo(() => (mode === "before" ? beforeUrl : afterUrl), [mode, beforeUrl, afterUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [src]);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-neon-purple">Audio comparison</p>
          <h2 className="mt-2 text-lg font-semibold text-white">Before vs After</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              mode === "before"
                ? "border-neon-purple bg-neon-purple/10 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
            }`}
            onClick={() => setMode("before")}
          >
            Before
          </button>
          <button
            type="button"
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              mode === "after"
                ? "border-neon-purple bg-neon-purple/10 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white"
            }`}
            onClick={() => setMode("after")}
          >
            After
          </button>
        </div>
      </div>

      <div className="mt-6">
        <audio
          ref={audioRef}
          controls
          className="w-full rounded-3xl border border-white/10 bg-ink-900 p-3"
          src={src}
        />
        {typeof durationSec === "number" ? (
          <p className="mt-3 text-xs text-white/60">Duration: {Math.round(durationSec)} seconds</p>
        ) : null}
      </div>
    </div>
  );
}
