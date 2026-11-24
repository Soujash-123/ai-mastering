"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { MemoryProfilePanel } from "@/components/debug/MemoryProfilePanel";
import { LeaveStudioModal } from "@/components/result/LeaveStudioModal";
import { DSPControlPanel, type PreviewMode } from "@/components/result/DSPControlPanel";
import { apiUrl, deleteJob, fetchResult, finalizeJob, masterDownloadUrl, previewJob, remasterJob, type JobResult } from "@/lib/api";
import { canAccessFullResult, canAccessMasteringTable, canUsePromptTab } from "@/lib/auth";
import { getTierConfig, type UserTier } from "@/lib/tier";
import { extractBaseParams, DSP_PARAM_KEYS } from "@/lib/dsp";
import { ResultNeon } from "@/components/ResultNeon";
import { resolve } from "@/lib/colors";

const PREVIEW_WINDOW_SEC = 30;
const PREVIEW_DEBOUNCE_MS = 700;

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
  const mid = canvas.height / 2;
  for (let x = 0; x < canvas.width; x++) {
    let min = 1, max = -1;
    const start = x * step;
    const end = Math.min(ch0.length, start + step);
    for (let i = start; i < end; i++) {
      const s = ch0[i];
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const prog = x / canvas.width;
    if (color === "neon" || color === "gradient") {
      // Turmeric, the app's accent; the mastered side reads brighter toward the end.
      ctx.strokeStyle = resolve(`rgb(var(--k-accent) / ${(0.7 + prog * 0.25).toFixed(2)})`);
    } else {
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, (1 + min) * mid);
    ctx.lineTo(x, (1 + max) * mid);
    ctx.stroke();
  }
}

function drawPeaksFromData(canvas: HTMLCanvasElement, peaks: number[], color: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx || peaks.length === 0) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mid = canvas.height / 2;
  const segW = canvas.width / peaks.length;
  const accent = resolve("rgb(var(--k-accent) / 0.85)");
  for (let i = 0; i < peaks.length; i++) {
    const amp = Math.max(0.02, Math.min(1, peaks[i] ?? 0));
    ctx.fillStyle = color === "neon" || color === "gradient" ? accent : color;
    ctx.fillRect(i * segW, mid - amp * mid, Math.max(1, segW - 0.5), amp * mid * 2);
  }
}

export default function ResultPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const jobId = params.jobId;
  const fullAccess = user ? canAccessFullResult(user.role) : false;
  // ADMIN and EARLY_ACCESS always get the full feature tier regardless of localStorage.
  const effectiveTier: UserTier = (user?.role === "ADMIN" || user?.role === "EARLY_ACCESS") ? "early_access" : "rollout";
  const tierCfg = getTierConfig(effectiveTier);
  const showPromptTab = user ? canUsePromptTab(user.role) : false;
  const showMasteringTable = user ? canAccessMasteringTable(user.role) : false;

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [data, setData] = useState<JobResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);
  const beforeRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [masterBars, setMasterBars] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // ── DSP control panel state ───────────────────────────────────────────────
  const baseParams = useMemo(() => extractBaseParams(data), [data]);
  const [dspParams, setDspParams] = useState<Record<string, number>>(baseParams);
  const [dspReady, setDspReady] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewStats, setPreviewStats] = useState<{ lufs: number | null; peak_db: number | null } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("window");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [finalized, setFinalized] = useState(false);
  const dirtyRef = useRef(false);
  const seqRef = useRef(0);
  const currentTimeRef = useRef(0);
  const finalizeHandledRef = useRef(false);

  // Prompt tab state
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const canDsp = fullAccess && !!data?.dsp_params;
  const analyzedDuration = useMemo(() => {
    const value = Number((data?.analysis as Record<string, unknown> | undefined)?.duration_sec);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [data]);

  const overrides = useMemo(() => {
    const out: Record<string, number> = {};
    for (const k of DSP_PARAM_KEYS) out[k] = dspParams[k];
    return out;
  }, [dspParams]);

  const urls = useMemo(() => {
    if (!data) return null;
    return {
      in: apiUrl(data.input_url),
      out: audioUrl ?? apiUrl(data.master_playback_url ?? data.master_wav_url),
    };
  }, [data, audioUrl]);

  useEffect(() => {
    const cached = sessionStorage.getItem(`kord_result_${jobId}`);
    if (cached) {
      try {
        setData(JSON.parse(cached) as JobResult);
        return;
      } catch { /* corrupt, fall through */ }
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchResult(jobId);
        if (cancelled) return;
        if (!r) { setErr("Result not ready yet. Stay on the processing page."); return; }
        setData(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load result");
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  // Initialize panel params + audio urls when result data arrives.
  useEffect(() => {
    if (!data) return;
    setDspParams(extractBaseParams(data));
    // Prefer the signed Appwrite URL so playback bypasses the EC2 instance.
    // Fall back to the backend route when Appwrite token creation failed.
    setAudioUrl(
      data.master?.download_url ??
      `${apiUrl(data.master_playback_url ?? data.master_wav_url)}?v=${Date.now()}`,
    );
    // The download link prefers the Appwrite-signed cloud URL when available.
    setDownloadUrl(masterDownloadUrl(data, Date.now()));
    setDspReady(true);
    setFinalized(!data.finalizing);
    setPreviewStats(null);
  }, [data]);

  // Debounced live preview render whenever DSP params or preview scope change.
  // Skipped until the user actually tweaks something (dirtyRef).
  useEffect(() => {
    if (!data || !dspReady || !dirtyRef.current || !canDsp) return;
    const seq = ++seqRef.current;
    const seg = previewMode === "window" ? PREVIEW_WINDOW_SEC : 0;
    const handler = setTimeout(async () => {
      if (seqRef.current !== seq) return;
      setRendering(true);
      setPreviewError(null);
      try {
        const resp = await previewJob(jobId, {
          overrides,
          segment_sec: seg,
          window_start_sec: seg > 0 ? currentTimeRef.current : null,
        });
        if (seqRef.current !== seq) return;
        const url = `${resp.url}?v=${Date.now()}`;
        setAudioUrl(url);
        setDownloadUrl(`${resp.download_url ?? resp.url}?v=${Date.now()}`);
        setPreviewStats({ lufs: resp.lufs, peak_db: resp.peak_db });
        setFinalized(false);
        setIsPlaying(false);
        setCurrentTime(0);
      } catch (e) {
        if (seqRef.current !== seq) return;
        setPreviewError(e instanceof Error ? e.message : "Preview render failed");
      } finally {
        if (seqRef.current === seq) setRendering(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dspParams, previewMode, dspReady, canDsp, jobId]);

  const leaveToStudio = () => {
    sessionStorage.removeItem(`kord_result_${jobId}`);
    void deleteJob(jobId);
    router.push("/studio");
  };

  const requestLeave = () => setShowLeaveModal(true);

  useEffect(() => {
    window.history.pushState({ kordResultGuard: true }, "");
    const onPopState = () => {
      setShowLeaveModal(true);
      window.history.pushState({ kordResultGuard: true }, "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const cleanup = () => {
      sessionStorage.removeItem(`kord_result_${jobId}`);
      void deleteJob(jobId);
    };
    window.addEventListener("beforeunload", cleanup);
    return () => window.removeEventListener("beforeunload", cleanup);
  }, [jobId]);

  useEffect(() => {
    const peaks = data?.waveform_peaks;
    if (peaks && peaks.length > 0) {
      setMasterBars(peaks.map((v) => Math.min(1, Math.max(0.02, Number(v) || 0))));
      return;
    }
    setMasterBars(Array.from({ length: 100 }, () => 0.25));
  }, [data?.waveform_peaks]);

  // Reload the audio element whenever the (live) preview source changes.
  useEffect(() => {
    masterAudioRef.current?.load();
  }, [audioUrl]);

  // Draw "before" waveform when comparison is shown
  useEffect(() => {
    if (!showComparison || !beforeRef.current) return;
    const peaks = data?.waveform_peaks;
    if (peaks && peaks.length > 0) {
      drawPeaksFromData(beforeRef.current, peaks, "rgb(var(--k-alert) / 0.72)");
      return;
    }
    if (!urls) return;
    void drawWaveform(beforeRef.current, urls.in, "rgb(var(--k-alert) / 0.72)");
  }, [showComparison, urls, data]);

  const onCopyId = () => {
    void navigator.clipboard.writeText(jobId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const onTogglePlay = async () => {
    if (!masterAudioRef.current) return;
    try {
      if (masterAudioRef.current.paused) {
        await masterAudioRef.current.play();
        setIsPlaying(true);
      } else {
        masterAudioRef.current.pause();
        setIsPlaying(false);
      }
    } catch { /* ignore */ }
  };

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const seekDuration = Number.isFinite(duration) && duration > 0 ? duration : analyzedDuration;
    const t = Math.max(0, Math.min(seekDuration, ((e.clientX - rect.left) / rect.width) * seekDuration));
    setCurrentTime(t);
    currentTimeRef.current = t;
    if (masterAudioRef.current) masterAudioRef.current.currentTime = t;
  };

  const onAudioError = useCallback(() => {
    setIsPlaying(false);
    setPreviewError("Playback file is unavailable. Try finalizing again.");
  }, []);

  const handleParamChange = useCallback((key: string, value: number) => {
    dirtyRef.current = true;
    setDspParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    dirtyRef.current = true;
    setDspParams(baseParams);
  }, [baseParams]);

  const handleFinalize = useCallback(async () => {
    if (!data || finalizing || rendering) return;
    finalizeHandledRef.current = false;
    setFinalizing(true);
    setPreviewError(null);
    setRendering(false);
    dirtyRef.current = false;
    seqRef.current += 1;
    try {
      // Returns immediately; the render runs in the background and the polling
      // effect below applies the new master + exports when it completes.
      await finalizeJob(jobId, overrides);
    } catch (e) {
      setFinalizing(false);
      setPreviewError(e instanceof Error ? e.message : "Finalize failed");
    }
  }, [data, finalizing, rendering, jobId, overrides]);

  const handleRemaster = useCallback(async () => {
    if (!promptText.trim() || promptLoading) return;
    setPromptLoading(true);
    setPromptError(null);
    try {
      const { job_id } = await remasterJob(jobId, promptText.trim());
      sessionStorage.removeItem(`kord_result_${jobId}`);
      router.push(`/processing/${job_id}`);
    } catch (e) {
      setPromptError(e instanceof Error ? e.message : "Remaster failed");
      setPromptLoading(false);
    }
  }, [promptText, promptLoading, jobId, router]);

  // Poll /result while a background finalize is in flight. Once `finalizing`
  // flips to false the new master is committed, so swap the player/download to
  // it (fresh cache-buster) — or surface `finalize_error` if it failed.
  const finalizeInFlight = finalizing || !!data?.finalizing;
  useEffect(() => {
    if (!finalizeInFlight) {
      finalizeHandledRef.current = false;
      return;
    }
    // A terminal state (done / error / timeout) may leave data.finalizing true;
    // keep polling stopped via the ref until the user starts a new finalize.
    if (finalizeHandledRef.current) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const r = await fetchResult(jobId);
        if (cancelled || !r) return;
        if (r.finalizing) {
          if (attempts > 150) {
            finalizeHandledRef.current = true;
            setFinalizing(false);
            setPreviewError("Finalize timed out. Refresh the page and try again.");
          }
          return;
        }
        finalizeHandledRef.current = true;
        setFinalizing(false);
        if (r.finalize_error) {
          setPreviewError(r.finalize_error);
          return;
        }
        setIsPlaying(false);
        setCurrentTime(0);
        setData(r);
      } catch (e) {
        if (attempts > 10) {
          finalizeHandledRef.current = true;
          setFinalizing(false);
          setPreviewError(e instanceof Error ? e.message : "Finalize failed");
        }
      }
    };
    const id = setInterval(tick, 2000);
    void tick();
    return () => { cancelled = true; clearInterval(id); };
  }, [finalizeInFlight, jobId]);

  if (err) {
    return (
      <main className="py-10 space-y-4">
        <p className="text-sm text-rose-300">{err}</p>
        <button type="button" className="text-sm text-accent underline" onClick={requestLeave}>
          Back to studio
        </button>
        <LeaveStudioModal open={showLeaveModal} onCancel={() => setShowLeaveModal(false)} onConfirm={leaveToStudio} />
      </main>
    );
  }

  if (!data || !urls) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-mist-200/55">
          <div className="h-4 w-4 animate-spin rounded-full border border-white/10 border-t-accent" />
          Loading results…
        </div>
      </main>
    );
  }

  const liveTargetLufs = canDsp && Number.isFinite(dspParams.target_lufs)
    ? `${dspParams.target_lufs.toFixed(1)} LUFS`
    : null;

  return (
    <>
      <LeaveStudioModal open={showLeaveModal} onCancel={() => setShowLeaveModal(false)} onConfirm={leaveToStudio} />
      <ResultNeon
        jobId={jobId}
        data={data}
        urls={urls}
        tierCfg={{ canPlaySimulations: fullAccess && tierCfg.canPlaySimulations }}
        masterBars={masterBars}
        isPlaying={isPlaying}
        showComparison={showComparison}
        currentTime={currentTime}
        duration={duration}
        copiedId={copiedId}
        onCopyId={onCopyId}
        onTogglePlay={onTogglePlay}
        onToggleComparison={() => setShowComparison((v) => !v)}
        onSeek={onSeek}
        beforeRef={beforeRef as React.RefObject<HTMLCanvasElement>}
        masterAudioRef={masterAudioRef as React.RefObject<HTMLAudioElement>}
        onAudioEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
        onAudioError={onAudioError}
        onAudioTimeUpdate={(e) => {
          const time = Number.isFinite(e.currentTarget.currentTime) ? e.currentTarget.currentTime : 0;
          setCurrentTime(time);
          currentTimeRef.current = time;
          setIsPlaying(!e.currentTarget.paused && !e.currentTarget.ended);
        }}
        onAudioLoadedMetadata={(e) => {
          const mediaDuration = e.currentTarget.duration;
          setDuration(Number.isFinite(mediaDuration) && mediaDuration > 0 ? mediaDuration : analyzedDuration);
        }}
        drawWaveform={drawWaveform}
        drawPeaks={drawPeaksFromData}
        waveformPeaks={data.waveform_peaks?.length ? data.waveform_peaks : masterBars}
        downloadUrl={downloadUrl}
        liveTargetLufs={liveTargetLufs}
        isFinalized={finalized}
        controlPanel={
          /* Temporarily disabled while Appwrite-backed playback is stabilized.
           * Keep the editing implementation in place for re-enablement.
          canDsp ? (
            <DSPControlPanel
              params={dspParams}
              baseParams={baseParams}
              onParamChange={handleParamChange}
              onReset={handleReset}
              rendering={rendering}
              finalizing={finalizing}
              stats={previewStats}
              error={previewError}
              previewMode={previewMode}
              onPreviewModeChange={(m) => { dirtyRef.current = true; setPreviewMode(m); }}
              onFinalize={handleFinalize}
              finalized={finalized}
            />
          ) : undefined
          */
          showMasteringTable ? (
            <button
              type="button"
              onClick={() => router.push(`/studio/${jobId}`)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] px-5 py-4 text-left transition hover:border-cyan-400/40 hover:"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="5" cy="13" r="2.3" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="10" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.4" />
                  <circle cx="15" cy="12" r="2.3" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M5 3v7.7M5 15.3V17M10 3v1.7M10 9.3V17M15 3v6.7M15 14.3V17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white">Open in Mastering Table</p>
                  <span className="rounded-md bg-violet-400 px-1.5 py-0.5 text-[11px] font-black text-black">BETA</span>
                </div>
                <p className="mt-0.5 text-xs text-white/50">
                  Fine-tune the AI master with live knobs, make any part louder, or just ask the Mastering Copilot.
                </p>
              </div>
              <span className="text-cyan-300 transition group-hover:translate-x-1">→</span>
            </button>
          ) : undefined
        }
        promptTab={{
          visible: showPromptTab,
          prompt: promptText,
          onPromptChange: setPromptText,
          onSubmit: handleRemaster,
          loading: promptLoading,
          error: promptError,
        }}
      />
      {fullAccess && data.memory_profile && (
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-10">
          <MemoryProfilePanel steps={data.memory_profile} />
        </div>
      )}
    </>
  );
}
