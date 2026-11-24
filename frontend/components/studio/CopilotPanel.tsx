"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/studio/types";

const SUGGESTIONS = [
  "Make the chorus louder",
  "Vocals feel buried — bring them forward",
  "It sounds harsh, smooth it out",
  "Add warmth without making it muddy",
  "More punch on the drums",
  "Make it louder for YouTube",
];

export type CopilotPanelProps = {
  messages: ChatMessage[];
  thinking: boolean;
  onSend: (text: string) => void;
  canUndoLast: boolean;
  onUndoLast: () => void;
  onRunRemaster: (overrides: Record<string, number>) => void;
  contextHint: string;
  styleLabel: string;
};

export function CopilotPanel({ messages, thinking, onSend, canUndoLast, onUndoLast, onRunRemaster, contextHint, styleLabel }: CopilotPanelProps) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v || thinking) return;
    onSend(v);
    setText("");
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-2xl border border-cyan-400/10 bg-ink-800">
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5l1.6 3.6 3.9.4-2.9 2.6.8 3.9L8 10.1 4.6 12l.8-3.9L2.5 5.5l3.9-.4L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-bold text-white">Mastering Copilot</p>
          <p className="truncate text-xs text-white/40">Knows your song{styleLabel ? ` · ${styleLabel}` : ""}</p>
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-[12px] leading-relaxed text-white/60">
              Tell me what you want to hear, in your own words. I&apos;ll change the master instantly. You can undo anything.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.05] px-2.5 py-1 text-[13px] text-cyan-200/90 transition hover:bg-cyan-400/15">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[92%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md bg-cyan-400/15 text-cyan-50"
                  : m.error
                    ? "rounded-bl-md border border-rose-400/25 bg-rose-500/[0.07] text-rose-200"
                    : "rounded-bl-md border border-white/[0.06] bg-white/[0.03] text-white/85"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.changes && m.changes.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {m.changes.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[13px] text-emerald-200/90">
                      <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
                      {c}
                    </li>
                  ))}
                </ul>
              )}
              {m.changes && m.changes.length > 0 && m.id === lastAssistant?.id && canUndoLast && (
                <button type="button" onClick={onUndoLast} className="mt-2 text-[13px] font-semibold text-white/50 underline-offset-2 hover:text-white hover:underline">
                  Undo these changes
                </button>
              )}
              {m.proposals?.map((p, i) => (
                <div key={i} className="mt-2 rounded-xl border border-violet-400/25 bg-violet-400/[0.06] p-2.5">
                  <p className="text-xs font-bold text-violet-200">Deep re-master suggestion</p>
                  {p.reason && <p className="mt-1 text-[13px] text-white/70">{p.reason}</p>}
                  <p className="mt-1 text-xs text-white/40">Re-runs the full AI chain (takes a little while). Your table edits stay.</p>
                  <button type="button" onClick={() => onRunRemaster(p.overrides)} className="mt-2 rounded-lg border border-violet-300/40 bg-violet-400/15 px-2.5 py-1 text-[13px] font-semibold text-violet-100 transition hover:bg-violet-400/25">
                    Run deep re-master
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex items-center gap-2 text-[13px] text-white/45">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            </span>
            Listening to your song…
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.06] p-3">
        {contextHint && <p className="mb-1.5 truncate text-xs text-white/35">Context: {contextHint}</p>}
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/40 p-2 focus-within:border-cyan-400/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            rows={2}
            maxLength={1500}
            placeholder="e.g. make the second chorus louder and a bit brighter"
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent text-[12px] text-white outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            onClick={() => submit(text)}
            disabled={thinking || !text.trim()}
            className="rounded-lg bg-cyan-400 px-3 py-1.5 text-[13px] font-bold text-black transition hover:bg-cyan-300 disabled:opacity-30"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}
