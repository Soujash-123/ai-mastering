"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

export type StreamingPreview = {
  label: string;
  description: string;
  filename: string;
  category: string;
  preview_url: string;
};

type Props = {
  previews: StreamingPreview[];
  notes?: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
  streaming: "Streaming Platforms",
  device: "Device Playback",
};

export function StreamingSimulator({ previews, notes = [] }: Props) {
  const [activeId, setActiveId] = useState(previews[0]?.filename ?? "");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const active = previews.find((p) => p.filename === activeId) ?? previews[0];

  useEffect(() => {
    if (!audioRef.current || !active) return;
    audioRef.current.pause();
    audioRef.current.load();
  }, [active?.filename]);

  if (previews.length === 0) return null;

  const grouped = previews.reduce<Record<string, StreamingPreview[]>>((acc, item) => {
    const key = item.category || "other";
    acc[key] = acc[key] ? [...acc[key], item] : [item];
    return acc;
  }, {});

  return (
    <div className="overflow-hidden rounded-2xl border border-violet/20 bg-gradient-to-br from-violet/[0.06] via-white/[0.02] to-accent/[0.04]">
      <div className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-violet/80">
              Streaming Simulator
            </p>
            <h2 className="mt-1 text-lg font-bold text-white sm:text-xl">
              Hear how your master translates
            </h2>
            <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-mist-200/50">
              Preview-only simulations — listen here to compare platform loudness and device playback.
              These are not downloadable exports.
            </p>
          </div>
          <span className="rounded-full border border-violet/30 bg-violet/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-violet/90">
            Preview only
          </span>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-5">
        <div className="border-b border-white/[0.06] p-4 lg:col-span-2 lg:border-b-0 lg:border-r">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-4 last:mb-0">
              <p className="mb-2 px-1 text-[8px] font-bold uppercase tracking-[0.2em] text-mist-200/30">
                {CATEGORY_LABELS[category] ?? category}
              </p>
              <div className="space-y-1.5">
                {items.map((item) => {
                  const selected = item.filename === active?.filename;
                  return (
                    <button
                      key={item.filename}
                      type="button"
                      onClick={() => setActiveId(item.filename)}
                      className={[
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                        selected
                          ? "border-violet/40 bg-violet/15 shadow-[0_0_20px_rgba(167,139,250,0.12)]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold",
                          selected
                            ? "border-violet/40 bg-violet/20 text-violet"
                            : "border-white/10 bg-white/[0.04] text-mist-200/40",
                        ].join(" ")}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 1.5l7 4-7 4v-8z" fill="currentColor" />
                        </svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{item.label}</span>
                        <span className="block truncate text-[10px] text-mist-200/40">{item.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col justify-between gap-4 p-5 lg:col-span-3">
          {active && (
            <>
              <div className="rounded-xl border border-white/[0.08] bg-ink-950/50 p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-accent/70">Now Playing</p>
                <p className="mt-1 text-xl font-bold text-white">{active.label}</p>
                <p className="mt-1 text-xs text-mist-200/55">{active.description}</p>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-ink-950/40 p-4">
                <audio
                  ref={audioRef}
                  key={active.filename}
                  className="w-full"
                  controls
                  controlsList="nodownload noplaybackrate"
                  preload="metadata"
                  src={apiUrl(active.preview_url)}
                />
                <p className="mt-2 text-center text-[9px] text-mist-200/30">
                  Playback preview — right-click save is disabled in supported browsers
                </p>
              </div>
            </>
          )}

          {notes.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
              {notes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-[10px] text-mist-200/45">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-violet/50" />
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
