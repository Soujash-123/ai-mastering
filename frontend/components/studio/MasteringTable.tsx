"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl, finalizeJob } from "@/lib/api";
import { askCopilot, commitStudio, fetchStudio, fetchStudioStatus, revertStudio, saveStudioSession, waitForRender } from "@/lib/studio/api";
import { fmtTime } from "@/lib/studio/dsp";
import { StudioEngine, type MeterReading } from "@/lib/studio/engine";
import type { ChatMessage, ListenMode, ModuleState, Region, StudioData, StudioSession, StudioSpec } from "@/lib/studio/types";
import { CopilotPanel } from "./CopilotPanel";
import { Knob } from "./Knob";
import { MODULE_ACCENTS, ModuleRack } from "./ModuleRack";
import { Timeline } from "./Timeline";

// --- session store with undo/redo -------------------------------------------

type Store = { session: StudioSession; past: StudioSession[]; future: StudioSession[] };
type Action =
  | { type: "checkpoint" }
  | { type: "edit"; session: StudioSession }
  | { type: "commit-step"; session: StudioSession }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "mark-committed"; committed: boolean };

const HISTORY = 100;

function reducer(state: Store, action: Action): Store {
  switch (action.type) {
    case "checkpoint":
      return { session: state.session, past: [...state.past, state.session].slice(-HISTORY), future: [] };
    case "edit":
      return { ...state, session: { ...action.session, committed: false } };
    case "commit-step":
      return { session: action.session, past: [...state.past, state.session].slice(-HISTORY), future: [] };
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { session: { ...prev, committed: false }, past: state.past.slice(0, -1), future: [state.session, ...state.future] };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { session: { ...next, committed: false }, past: [...state.past, state.session], future: state.future.slice(1) };
    }
    case "mark-committed":
      return { ...state, session: { ...state.session, committed: action.committed } };
  }
}

function defaultModules(spec: StudioSpec): Record<string, ModuleState> {
  const out: Record<string, ModuleState> = {};
  for (const [key, m] of Object.entries(spec.modules)) {
    const s: ModuleState = { enabled: m.default_enabled };
    for (const [pk, p] of Object.entries(m.params)) s[pk] = p.default;
    out[key] = s;
  }
  return out;
}

/** True when the session makes no change on top of the AI master. */
function isNeutral(session: StudioSession, spec: StudioSpec): boolean {
  if (session.regions.length) return false;
  const defaults = defaultModules(spec);
  return Object.entries(defaults).every(([m, d]) =>
    Object.entries(d).every(([k, v]) => session.modules[m]?.[k] === v),
  );
}

function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const QUICK_KNOBS: { module: string; param: string; label: string }[] = [
  { module: "output", param: "gain_db", label: "Loudness" },
  { module: "eq", param: "bass_db", label: "Bass" },
  { module: "eq", param: "presence_db", label: "Clarity" },
  { module: "eq", param: "air_db", label: "Air" },
  { module: "warmth", param: "drive", label: "Warmth" },
  { module: "width", param: "width", label: "Width" },
];

const uid = () => Math.random().toString(36).slice(2, 12);

// --- component ---------------------------------------------------------------

export function MasteringTable({ initial }: { initial: StudioData }) {
  const router = useRouter();
  const jobId = initial.job_id;
  const [data, setData] = useState(initial);
  const spec = data.spec;
  const [store, dispatch] = useReducer(reducer, { session: initial.session, past: [], future: [] });
  const session = store.session;

  const engineRef = useRef<StudioEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<ListenMode>("edit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const [meters, setMeters] = useState<MeterReading>({ peakDb: -Infinity, lufsM: null });
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [busy, setBusy] = useState<null | "commit" | "revert" | "remaster" | "download">(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [agentStamp, setAgentStamp] = useState<number | null>(null);

  const selected = session.regions.find((r) => r.id === selectedId) ?? null;
  const hasSnapshot = data.base_url.includes("/artifacts/master_ai");

  // Engine lifecycle
  useEffect(() => {
    const matchDb =
      initial.base_lufs != null && initial.original_lufs != null ? initial.base_lufs - initial.original_lufs : 0;
    const engine = new StudioEngine({
      baseUrl: apiUrl(initial.base_url),
      originalUrl: apiUrl(initial.original_url),
      durationSec: initial.duration_sec,
      constants: initial.spec.constants,
      originalMatchDb: Math.max(-24, Math.min(24, matchDb)),
    });
    engineRef.current = engine;
    let cancelled = false;
    engine
      .init()
      .then(() => {
        if (cancelled) return;
        engine.applySession(store.session);
        setEngineReady(true);
      })
      .catch((e: unknown) => {
        // A cancelled engine (e.g. React Strict Mode's dev remount) rejects
        // because its context was closed mid-load; that's not a real failure.
        if (cancelled) return;
        setEngineError(e instanceof Error ? e.message : "Audio engine failed to start");
      });
    return () => {
      cancelled = true;
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session → audio (instant)
  useEffect(() => {
    if (engineReady) engineRef.current?.applySession(session);
  }, [session, engineReady]);

  useEffect(() => {
    if (engineReady) engineRef.current?.setMode(mode);
  }, [mode, engineReady]);

  useEffect(() => {
    engineRef.current?.setLoop(loop);
  }, [loop]);

  // Transport tick + meters
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loopFn = (ts: number) => {
      const e = engineRef.current;
      if (e) {
        e.tick();
        if (ts - last > 100) {
          last = ts;
          setMeters(e.readMeters());
          setPlaying(e.playing);
        }
      }
      raf = requestAnimationFrame(loopFn);
    };
    raf = requestAnimationFrame(loopFn);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Debounced autosave
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      saveStudioSession(jobId, session)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 700);
    return () => clearTimeout(t);
  }, [session, jobId]);

  // Heartbeat: keeps the job alive on the server while the Table is open, even
  // when the user is only listening (ephemeral jobs are removed after idling).
  useEffect(() => {
    const id = setInterval(() => {
      fetchStudioStatus(jobId).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(id);
  }, [jobId]);

  // --- edit helpers ----------------------------------------------------------

  const begin = useCallback(() => dispatch({ type: "checkpoint" }), []);
  const edit = useCallback((s: StudioSession) => dispatch({ type: "edit", session: s }), []);

  const setParam = useCallback(
    (module: string, param: string, value: number) => {
      const mods = { ...session.modules, [module]: { ...session.modules[module], [param]: value, enabled: true } };
      edit({ ...session, modules: mods, preset: "custom" });
    },
    [session, edit],
  );

  const toggleModule = useCallback(
    (module: string) => {
      const mods = { ...session.modules, [module]: { ...session.modules[module], enabled: !session.modules[module].enabled } };
      edit({ ...session, modules: mods, preset: "custom" });
    },
    [session, edit],
  );

  const applyPreset = useCallback(
    (key: string) => {
      const mods = defaultModules(spec);
      for (const [m, vals] of Object.entries(spec.presets[key]?.modules ?? {})) mods[m] = { ...mods[m], ...vals } as ModuleState;
      dispatch({ type: "commit-step", session: { ...session, modules: mods, preset: key, committed: false } });
    },
    [session, spec],
  );

  const updateRegion = useCallback(
    (id: string, patch: Partial<Region>) => {
      edit({ ...session, regions: session.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    },
    [session, edit],
  );

  const createRegion = useCallback(
    (start: number, end: number) => {
      if (session.regions.length >= spec.max_regions) {
        setNotice({ kind: "error", text: `You can have up to ${spec.max_regions} regions.` });
        return;
      }
      const r: Region = { id: uid(), start_sec: start, end_sec: end, label: "", gain_db: 1.5, bass_db: 0, air_db: 0, fade_ms: 250 };
      dispatch({
        type: "commit-step",
        session: { ...session, regions: [...session.regions, r].sort((a, b) => a.start_sec - b.start_sec), committed: false },
      });
      setSelectedId(r.id);
    },
    [session, spec.max_regions],
  );

  const deleteRegion = useCallback(() => {
    if (!selectedId) return;
    dispatch({ type: "commit-step", session: { ...session, regions: session.regions.filter((r) => r.id !== selectedId), committed: false } });
    if (loop && selected && loop.start === selected.start_sec) setLoop(null);
    setSelectedId(null);
  }, [session, selectedId, loop, selected]);

  // --- transport ------------------------------------------------------------

  const togglePlay = useCallback(async () => {
    const e = engineRef.current;
    if (!e || !engineReady) return;
    try {
      if (e.playing) e.pause();
      else await e.play();
      setPlaying(e.playing);
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : "Playback failed");
    }
  }, [engineReady]);

  const getTime = useCallback(() => engineRef.current?.currentTime ?? 0, []);
  const seek = useCallback((t: number) => engineRef.current?.seek(t), []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteRegion();
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, deleteRegion, selectedId]);

  // --- copilot ----------------------------------------------------------------

  const contextHint = useMemo(() => {
    if (selected) return `${selected.label || "selected region"} ${fmtTime(selected.start_sec)}–${fmtTime(selected.end_sec)}`;
    if (loop) return `loop ${fmtTime(loop.start)}–${fmtTime(loop.end)}`;
    return "";
  }, [selected, loop]);

  const sendToCopilot = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
      const history = [...messages.filter((m) => !m.error), userMsg];
      setMessages((m) => [...m, userMsg]);
      setThinking(true);
      try {
        const sel = selected ? { start_sec: selected.start_sec, end_sec: selected.end_sec } : loop ? { start_sec: loop.start, end_sec: loop.end } : null;
        const res = await askCopilot(jobId, {
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          session,
          playhead_sec: engineRef.current?.currentTime ?? 0,
          selection: sel,
        });
        if (res.changes.length) {
          dispatch({ type: "commit-step", session: { ...res.session, committed: false } });
          setAgentStamp(store.past.length + 1);
        }
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: res.reply, changes: res.changes, proposals: res.proposals }]);
      } catch (e) {
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: e instanceof Error ? e.message : "Copilot failed", error: true }]);
      } finally {
        setThinking(false);
      }
    },
    [messages, selected, loop, jobId, session, store.past.length],
  );

  // --- server actions ---------------------------------------------------------

  const reloadBase = useCallback(async () => {
    const fresh = await fetchStudio(jobId);
    setData(fresh);
    if (fresh.base_url !== data.base_url) await engineRef.current?.setBaseUrl(apiUrl(fresh.base_url));
    return fresh;
  }, [jobId, data.base_url]);

  const runBackground = useCallback(
    async (kind: "commit" | "revert" | "remaster", start: () => Promise<unknown>, okText: string): Promise<boolean> => {
      setBusy(kind);
      setNotice(null);
      try {
        await start();
        const status = await waitForRender(jobId);
        if (status.finalize_error) throw new Error(status.finalize_error);
        await reloadBase();
        dispatch({ type: "mark-committed", committed: kind === "commit" });
        setNotice({ kind: "ok", text: okText });
        return true;
      } catch (e) {
        setNotice({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [jobId, reloadBase],
  );

  const commit = () =>
    runBackground("commit", () => commitStudio(jobId, session), "Your edits are now the downloadable master.");
  // Download what the user hears: unapplied edits are rendered first.
  const needsApply = !session.committed && (!isNeutral(session, spec) || hasSnapshot);
  const download = async () => {
    if (needsApply) {
      const ok = await runBackground("commit", () => commitStudio(jobId, session), "Edits applied — your download is starting.");
      if (!ok) return;
    }
    setBusy("download");
    triggerDownload(apiUrl(`/api/jobs/${jobId}/master/download?v=${Date.now()}`));
    setTimeout(() => setBusy(null), 1500);
  };
  const revert = () => runBackground("revert", () => revertStudio(jobId), "Restored the original AI master. Your table edits are still here.");
  const remaster = (overrides: Record<string, number>) =>
    runBackground("remaster", () => finalizeJob(jobId, overrides), "Deep re-master done. Your table edits now sit on the new AI master.");

  // --- render -------------------------------------------------------------------

  const presetKeys = Object.keys(spec.presets);
  const presetIdx = presetKeys.indexOf(session.preset);
  const stepPreset = (dir: number) => {
    const i = presetIdx < 0 ? 0 : (presetIdx + dir + presetKeys.length) % presetKeys.length;
    applyPreset(presetKeys[i]);
  };

  const peakColor = meters.peakDb > -1 ? "text-rose-300" : meters.peakDb > -6 ? "text-amber-200" : "text-emerald-300";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[rgb(var(--k-ink))] text-white font-outfit">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/[0.06] px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => router.push(`/result/${jobId}`)} title="Close" className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[14px] font-bold tracking-tight">Mastering Table</h1>
              <span className="rounded-md bg-violet-400 px-1.5 py-0.5 text-[11px] font-black text-black">BETA</span>
            </div>
            <p className="truncate text-[13px] text-white/40">
              {data.title}
              {data.style.label ? ` · ${data.style.label}` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button type="button" onClick={() => stepPreset(-1)} className="rounded-md px-1.5 py-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Previous preset">‹</button>
            <button type="button" onClick={() => stepPreset(1)} className="rounded-md px-1.5 py-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Next preset">›</button>
            <select
              value={presetIdx >= 0 ? session.preset : "custom"}
              onChange={(e) => e.target.value !== "custom" && applyPreset(e.target.value)}
              className="min-w-[150px] rounded-md bg-transparent px-2 py-1 text-[12px] font-semibold text-white outline-none"
            >
              {presetIdx < 0 && <option value="custom">Custom*</option>}
              {presetKeys.map((k) => (
                <option key={k} value={k} className="bg-[rgb(var(--k-ink))]">{spec.presets[k].label}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-white/35">
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save — retrying on next change" : "All changes saved"}
          </span>
        </div>

        <div className="flex items-end gap-4">
          {QUICK_KNOBS.map((q) => {
            const p = spec.modules[q.module]?.params[q.param];
            if (!p) return null;
            return (
              <Knob
                key={`${q.module}.${q.param}`}
                spec={p}
                label={q.label}
                value={Number(session.modules[q.module]?.[q.param] ?? p.default)}
                accent={MODULE_ACCENTS[q.module]}
                size={44}
                onBegin={begin}
                onChange={(v) => setParam(q.module, q.param, v)}
              />
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasSnapshot && (
            <button type="button" onClick={revert} disabled={!!busy} className="rounded-xl border border-white/10 px-3 py-2 text-[13px] font-semibold text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-40">
              {busy === "revert" ? "Restoring…" : "Revert to AI master"}
            </button>
          )}
          <button
            type="button"
            onClick={() => void download()}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-400/[0.06] px-3 py-2 text-[12px] font-semibold text-cyan-200 transition hover:bg-cyan-400/15 disabled:opacity-40"
            title={needsApply ? "Renders your latest edits, then downloads the master" : "Download your master (lossless FLAC)"}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5v8M7 9.5L3.8 6.3M7 9.5l3.2-3.2M2 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {busy === "download" ? "Starting…" : needsApply ? "Apply & download" : "Download"}
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={!!busy || session.committed}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-[12px] font-bold text-black transition hover:bg-cyan-300 disabled:opacity-40"
            title="Render these edits into your downloadable master"
          >
            {busy === "commit" ? "Rendering…" : session.committed ? "Applied ✓" : "Apply to master"}
          </button>
        </div>
      </header>

      {(notice || engineError || busy === "remaster") && (
        <div className={`px-5 py-2 text-[12px] ${notice?.kind === "error" || engineError ? "bg-rose-500/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200"}`}>
          {engineError ?? (busy === "remaster" ? "Running a deep re-master of the AI chain…" : notice?.text)}
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Transport */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void togglePlay()}
              disabled={!engineReady}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:opacity-40"
              aria-label={playing ? "Pause" : "Play"}
              title="Play / pause (Space)"
            >
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2.5" y="2" width="3" height="10" rx="1" fill="currentColor" /><rect x="8.5" y="2" width="3" height="10" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.4 1.7a.6.6 0 0 0-.9.5z" fill="currentColor" /></svg>
              )}
            </button>
            <button type="button" onClick={() => seek(0)} className="rounded-lg border border-white/10 px-2.5 py-2 text-[13px] text-white/60 hover:text-white" title="Back to start">⏮</button>

            <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1" role="radiogroup" aria-label="Listen to">
              {([
                ["edit", "Your edit"],
                ["ai", "AI master"],
                ["original", "Original mix"],
              ] as [ListenMode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${mode === m ? "bg-white/15 text-white" : "text-white/45 hover:text-white"}`}
                  title={m === "original" ? "Level-matched so you compare tone, not volume" : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex gap-1">
              <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={!store.past.length} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[13px] text-white/60 hover:text-white disabled:opacity-30" title="Undo (⌘Z)">Undo</button>
              <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={!store.future.length} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[13px] text-white/60 hover:text-white disabled:opacity-30" title="Redo (⇧⌘Z)">Redo</button>
            </div>

            {loop && (
              <button type="button" onClick={() => setLoop(null)} className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-2.5 py-1.5 text-[13px] font-semibold text-amber-200">
                Loop {fmtTime(loop.start)}–{fmtTime(loop.end)} ✕
              </button>
            )}

            <div className="ml-auto flex items-center gap-4 rounded-xl border border-white/[0.06] bg-black/30 px-3 py-1.5 tabular-nums">
              <div className="text-right">
                <p className="text-[11px] text-white/35">Loudness ≈</p>
                <p className="text-[13px] font-bold text-cyan-200">{meters.lufsM != null ? `${meters.lufsM.toFixed(1)} LUFS` : "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-white/35">Peak</p>
                <p className={`text-[13px] font-bold ${peakColor}`}>{Number.isFinite(meters.peakDb) ? `${meters.peakDb.toFixed(1)} dB` : "—"}</p>
              </div>
            </div>
          </div>

          <Timeline
            peaks={data.peaks}
            duration={data.duration_sec}
            sections={data.sections}
            regions={session.regions}
            selectedId={selectedId}
            getTime={getTime}
            onSeek={seek}
            onSelect={setSelectedId}
            onCreateRegion={createRegion}
            onRegionChange={updateRegion}
            onBeginEdit={begin}
            loop={loop}
          />

          <div className={`min-h-0 ${thinking ? "pointer-events-none opacity-60" : ""}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-black italic">Fx</span>
              <p className="text-[13px] font-bold text-white/50">Mastering tools</p>
              <p className="text-xs text-white/30">Changes are heard instantly · preview of the final render</p>
            </div>
            <ModuleRack
              spec={spec}
              modules={session.modules}
              onParam={setParam}
              onToggle={toggleModule}
              onBegin={begin}
              region={selected}
              onRegion={(patch) => selected && updateRegion(selected.id, patch)}
              onDeleteRegion={deleteRegion}
              looping={!!(loop && selected && loop.start === selected.start_sec && loop.end === selected.end_sec)}
              onLoopRegion={() => {
                if (!selected) return;
                const same = loop && loop.start === selected.start_sec && loop.end === selected.end_sec;
                setLoop(same ? null : { start: selected.start_sec, end: selected.end_sec });
                if (!same) seek(selected.start_sec);
              }}
            />
          </div>
        </main>

        <div className="w-[340px] shrink-0">
          <CopilotPanel
            messages={messages}
            thinking={thinking}
            onSend={(t) => void sendToCopilot(t)}
            canUndoLast={agentStamp != null && agentStamp === store.past.length}
            onUndoLast={() => {
              dispatch({ type: "undo" });
              setAgentStamp(null);
            }}
            onRunRemaster={remaster}
            contextHint={contextHint}
            styleLabel={data.style.label}
          />
        </div>
      </div>
    </div>
  );
}
