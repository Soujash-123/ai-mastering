"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { MemoryProfilePanel } from "@/components/debug/MemoryProfilePanel";
import { LeaveStudioModal } from "@/components/result/LeaveStudioModal";
import { DSPControlPanel, type PreviewMode } from "@/components/result/DSPControlPanel";
import { apiUrl, deleteJob, fetchResult, finalizeJob, previewJob, type JobResult } from "@/lib/api";
import { canAccessFullResult } from "@/lib/auth";
import { getTier, getTierConfig } from "@/lib/tier";
import { extractBaseParams, DSP_PARAM_KEYS } from "@/lib/dsp";
import { ResultNeon } from "@/components/ResultNeon";

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
    if (color === "neon") {
      const hue = 185 + prog * 40;
      ctx.strokeStyle = `hsla(${hue}, 90%, 65%, 0.85)`;
    } else if (color === "gradient") {
      const hue = 185 + prog * 110;
      ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.85)`;
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

export default function ResultPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const jobId = params.jobId;
  const fullAccess = user ? canAccessFullResult(user.role) : false;
  const tier = getTier();
  const tierCfg = getTierConfig(tier);

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

  const canDsp = fullAccess && !!data?.dsp_params;

  const overrides = useMemo(() => {
    const out: Record<string, number> = {};
    for (const k of DSP_PARAM_KEYS) out[k] = dspParams[k];
    return out;
  }, [dspParams]);

  const urls = useMemo(() => {
    if (!data) return null;
    return { in: apiUrl(data.input_url), out: audioUrl ?? apiUrl(data.master_wav_url) };
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
    setAudioUrl(`${apiUrl(data.master_wav_url)}?v=${Date.now()}`);
    setDownloadUrl(`${apiUrl(data.master_wav_url)}?v=${Date.now()}`);
    setDspReady(true);
    setFinalized(true);
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
        setDownloadUrl(url);
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
    router.push("/");
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
    if (!urls) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(urls.out);
        const arrBuf = await res.arrayBuffer();
        const ac = new AudioContext();
        const decoded = await ac.decodeAudioData(arrBuf);
        await ac.close();
        if (cancelled) return;
        const ch0 = decoded.getChannelData(0);
        const NUM_BARS = 100;
        const segLen = Math.max(1, Math.floor(ch0.length / NUM_BARS));
        let globalMax = 0;
        const rawBars: number[] = [];
        for (let i = 0; i < NUM_BARS; i++) {
          let peak = 0;
          const s = i * segLen;
          const e = Math.min(ch0.length, s + segLen);
          for (let j = s; j < e; j++) {
            const abs = Math.abs(ch0[j]);
            if (abs > peak) peak = abs;
          }
          rawBars.push(peak);
          if (peak > globalMax) globalMax = peak;
        }
        if (!cancelled) setMasterBars(rawBars.map((v) => (globalMax > 0 ? v / globalMax : 0.3)));
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [urls]);

  // Reload the audio element whenever the (live) preview source changes.
  useEffect(() => {
    masterAudioRef.current?.load();
  }, [audioUrl]);

  // Draw "before" waveform when comparison is shown
  useEffect(() => {
    if (!showComparison || !urls || !beforeRef.current) return;
    void drawWaveform(beforeRef.current, urls.in, "rgba(255,75,75,0.72)");
  }, [showComparison, urls]);

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
    const t = ((e.clientX - rect.left) / rect.width) * (duration || 0);
    setCurrentTime(t);
    currentTimeRef.current = t;
    if (masterAudioRef.current) masterAudioRef.current.currentTime = t;
  };

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
    setFinalizing(true);
    setPreviewError(null);
    setRendering(false);
    dirtyRef.current = false;
    seqRef.current += 1;
    try {
      const updated = await finalizeJob(jobId, overrides);
      if (updated) {
        setData(updated);
        setFinalized(true);
        const master = `${apiUrl(updated.master_wav_url)}?v=${Date.now()}`;
        setAudioUrl(master);
        setDownloadUrl(master);
        setPreviewStats(null);
        setIsPlaying(false);
        setCurrentTime(0);
        sessionStorage.setItem(`kord_result_${jobId}`, JSON.stringify(updated));
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setFinalizing(false);
    }
  }, [data, finalizing, rendering, jobId, overrides]);

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
        onAudioTimeUpdate={(e) => { setCurrentTime(e.currentTarget.currentTime); currentTimeRef.current = e.currentTarget.currentTime; }}
        onAudioLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        drawWaveform={drawWaveform}
        downloadUrl={downloadUrl}
        liveTargetLufs={liveTargetLufs}
        isFinalized={finalized}
        controlPanel={
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
        }
      />
      {fullAccess && data.memory_profile && (
        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-10">
          <MemoryProfilePanel steps={data.memory_profile} />
        </div>
      )}
    </>
  );
}