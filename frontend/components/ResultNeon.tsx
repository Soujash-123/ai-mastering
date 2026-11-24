import React from "react";
import Link from "next/link";
import { type JobResult, type MasterInfo, apiUrl } from "@/lib/api";
import { ANALYSIS_CARDS, fmtTime, type ResultProps } from "./ResultAurora";
import s from "./result.module.css";

function pickNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

/**
 * Surfaces where the canonical master is stored.
 *
 * Silent by default: when Appwrite is not configured (`state === "none"`) there
 * is nothing to tell the user. It only speaks up when something is worth
 * knowing — the master is in the cloud and will expire, or the upload failed
 * even though mastering itself succeeded.
 */
function CloudMasterStatus({ jobId, master }: { jobId: string; master: MasterInfo | null | undefined }) {
  if (!master || master.state === "none") return null;

  if (master.state === "failed") {
    return (
      <section className={s.block} aria-labelledby="cloud-title">
        <h2 id="cloud-title" className={s.h3}>Cloud copy</h2>
        <p className={s.warn} style={{ marginTop: "0.5rem" }}>
          Your master was produced but could not be stored in the cloud. It is still available to download from this
          page.
        </p>
      </section>
    );
  }

  if (master.state === "expired") {
    return (
      <section className={s.block} aria-labelledby="cloud-title">
        <h2 id="cloud-title" className={s.h3}>Cloud copy</h2>
        <p className={s.muted} style={{ marginTop: "0.5rem" }}>
          The retention window for this master has closed and the stored copy was deleted.
        </p>
      </section>
    );
  }

  const hoursLeft = master.expires_at
    ? Math.max(0, Math.round((new Date(master.expires_at).getTime() - Date.now()) / 3_600_000))
    : null;

  return (
    <section className={s.block} aria-labelledby="cloud-title">
      <h2 id="cloud-title" className={s.h3}>Cloud copy</h2>
      <p className={s.muted} style={{ marginTop: "0.5rem" }}>
        <strong style={{ color: "rgb(var(--k-paper))" }}>{master.filename || "master.flac"}</strong> is stored in the cloud
        {hoursLeft !== null && <> and expires in about {hoursLeft} h</>}.
      </p>
      {master.download_url && (
        <a href={apiUrl(`/api/jobs/${jobId}/master/download`)} download className={s.textBtn}>
          Download the cloud copy
        </a>
      )}
    </section>
  );
}

const BAR_META = [
  { label: "Warmth", desc: "Low-mid body" },
  { label: "Brightness", desc: "Clarity and air" },
  { label: "Punch", desc: "Transient impact" },
  { label: "Width", desc: "Stereo space" },
];

function IntentMeters({ intent }: { intent: Record<string, unknown> | null | undefined }) {
  if (!intent) return null;
  const eq = intent.eq_strategy as Record<string, unknown> | undefined;
  const comp = intent.compression_strategy as Record<string, unknown> | undefined;
  const spat = intent.spatial_strategy as Record<string, unknown> | undefined;

  const values = [
    pickNum(eq?.warmth_intensity),
    pickNum(eq?.brightness_intensity),
    pickNum(comp?.punch_preservation),
    pickNum(spat?.stereo_width_amount),
  ];

  if (!values.some((v) => v != null)) return <p className={s.muted}>No DSP intent recorded.</p>;

  return (
    <div className={s.meters}>
      {BAR_META.map((meta, i) => {
        const val = values[i];
        if (val == null) return null;
        const lit = Math.round(Math.min(10, Math.max(0, val)));
        return (
          <div key={meta.label} className={s.meterRow}>
            <div className={s.meterTop}>
              <span>
                <strong>{meta.label}</strong> <span className={s.meterDesc}>{meta.desc}</span>
              </span>
              <span className={`${s.mono} ${s.meterValue}`}>{val.toFixed(1)}</span>
            </div>
            <div className={s.meterTrack} role="img" aria-label={`${meta.label} ${val.toFixed(1)} out of 10`}>
              {Array.from({ length: 10 }, (_, k) => (
                <span key={k} data-lit={k < lit || undefined} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Result screen. Visual layer only: every prop, ref and callback comes from
// app/(app)/result/[jobId]/page.tsx unchanged.
export function ResultNeon({
  jobId, data, urls, tierCfg, masterBars, isPlaying, showComparison,
  currentTime, duration, copiedId, onCopyId, onTogglePlay, onToggleComparison,
  onSeek, beforeRef, masterAudioRef, onAudioEnded, onAudioError, onAudioTimeUpdate, onAudioLoadedMetadata,
  drawWaveform, downloadUrl, liveTargetLufs, controlPanel, isFinalized = true,
  drawPeaks, waveformPeaks, promptTab
}: ResultProps) {
  const analysis = data.analysis as Record<string, unknown>;
  const safeIntent = data.safe_intent as Record<string, unknown>;
  const intLufs = analysis?.integrated_lufs != null ? `${Number(analysis.integrated_lufs).toFixed(1)} LUFS` : "—";
  const tgtLufs = (safeIntent?.loudness_strategy as Record<string, unknown>)?.target_lufs != null ? `${Number((safeIntent.loudness_strategy as Record<string, unknown>).target_lufs).toFixed(1)} LUFS` : "—";
  const downloadHref = downloadUrl ?? urls.out;
  const hasDur = Number.isFinite(duration) && duration > 0;
  const frac = hasDur ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const bars = masterBars.length > 0 ? masterBars : Array.from({ length: 100 }, () => 0.25);
  const report = data.report as Record<string, unknown>;

  return (
    <main className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.h1}>{isFinalized ? "Your master is ready" : "Preview your master"}</h1>
          <p className={s.job}>
            <span>
              Job <span className={s.mono}>{jobId}</span>
            </span>
            <button type="button" onClick={onCopyId} className={s.textBtn}>
              {copiedId ? "Copied" : "Copy job ID"}
            </button>
          </p>
        </div>
        <div className={s.actions}>
          <Link href="/studio" className={s.btnLine}>
            Master another track
          </Link>
          <a href={downloadHref} download className={s.btn}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 2v7M7 9l-3-3M7 9l3-3M2 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
            Download master
          </a>
        </div>
      </header>

      <dl className={s.readouts}>
        {[
          { label: "Original loudness", val: intLufs },
          { label: "Target loudness", val: liveTargetLufs ?? tgtLufs },
          { label: "Resolution", val: "24-bit" },
          { label: "Download format", val: "FLAC" },
        ].map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd className={s.mono}>{r.val}</dd>
          </div>
        ))}
      </dl>

      {/* Playback */}
      <section className={s.block} aria-labelledby="listen-title">
        <div className={s.blockHead}>
          <h2 id="listen-title" className={s.h2}>Listen to the master</h2>
          {tierCfg.canPlaySimulations ? (
            <button
              type="button"
              role="switch"
              aria-checked={showComparison}
              onClick={onToggleComparison}
              className={s.switch}
            >
              <span className={s.switchTrack} aria-hidden="true" />
              Compare with original
            </button>
          ) : (
            <span className={s.locked}>Compare with original: Early Access</span>
          )}
        </div>

        <div className={s.wave} aria-hidden="true">
          {bars.map((amp, i) => (
            <span
              key={i}
              className={s.bar}
              data-played={frac > i / bars.length || undefined}
              style={{ height: `${Math.max(4, amp * 100)}%` }}
            />
          ))}
          {hasDur && <span className={s.playhead} style={{ left: `${frac * 100}%` }} />}
        </div>

        <div className={s.transport}>
          <button type="button" onClick={onTogglePlay} className={s.play} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><rect x="3" y="2" width="4" height="14" fill="currentColor"/><rect x="11" y="2" width="4" height="14" fill="currentColor"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 2.5L15 9 4 15.5v-13z" fill="currentColor"/></svg>
            )}
          </button>
          <span className={`${s.time} ${s.mono}`}>{fmtTime(currentTime)}</span>
          <div className={s.seek} onClick={onSeek} role="presentation">
            <div className={s.seekFill} style={{ width: `${frac * 100}%` }} />
          </div>
          <span className={`${s.time} ${s.mono} ${s.muted}`} style={{ textAlign: "right" }}>{fmtTime(duration)}</span>
        </div>
        <audio
          ref={masterAudioRef}
          src={urls.out}
          className="hidden"
          preload="metadata"
          onEnded={onAudioEnded}
          onError={onAudioError}
          onTimeUpdate={onAudioTimeUpdate}
          onLoadedMetadata={onAudioLoadedMetadata}
        />
      </section>

      {controlPanel && <div style={{ marginTop: "2rem" }}>{controlPanel}</div>}

      {showComparison && (
        <section className={s.block} aria-labelledby="ab-title">
          <h2 id="ab-title" className={s.h2} style={{ marginBottom: "1.25rem" }}>Original and master</h2>
          <div className={s.ab}>
            <div className={s.abSide}>
              <h3 className={s.h3}>Original</h3>
              <canvas ref={beforeRef} width={800} height={60} style={{ opacity: 0.7 }} />
              <audio controls preload="none" src={urls.in} />
            </div>
            <div className={s.abSide}>
              <h3 className={s.h3}>Master</h3>
              <canvas
                ref={(el) => { if (el && urls) { if (drawPeaks && waveformPeaks && waveformPeaks.length > 0) drawPeaks(el, waveformPeaks, "neon"); else void drawWaveform(el, urls.out, "neon"); } }}
                width={800} height={60}
              />
              <audio controls preload="none" src={urls.out} />
            </div>
          </div>
        </section>
      )}

      <div className={s.lower}>
        <section className={s.block} aria-labelledby="report-title">
          <h2 id="report-title" className={s.h2} style={{ marginBottom: "1.25rem" }}>What Kord heard and did</h2>
          <div className={s.report}>
            {[...ANALYSIS_CARDS].sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).map(({ key, label, featured }) => {
              const value = report[key] as string | undefined;
              if (!value) return null;
              return (
                <section key={key} className={featured ? s.verdict : undefined}>
                  <h3 className={s.h3}>{label}</h3>
                  <p>{value}</p>
                </section>
              );
            })}
          </div>
        </section>

        <div className={s.side}>
          <section className={s.block} aria-labelledby="intent-title">
            <h2 id="intent-title" className={s.h2} style={{ marginBottom: "1.25rem" }}>Processing character</h2>
            <IntentMeters intent={data.safe_intent} />
          </section>

          <CloudMasterStatus jobId={jobId} master={data.master} />

          {data.exports.length > 0 && (
            <section className={s.block} aria-labelledby="exports-title">
              <h2 id="exports-title" className={s.h2} style={{ marginBottom: "0.75rem" }}>Files for each platform</h2>
              <div className={s.exports}>
                {data.exports.map((e, idx) => (
                  <a key={idx} href={apiUrl(e.download_url)} download className={s.exportRow}>
                    <span>
                      <strong>{e.profile}</strong> <span className={`${s.mono} ${s.muted}`}>{e.format.toUpperCase()}</span>
                    </span>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M10 4v10M6 10l4 4 4-4M4 17h12" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                    </svg>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Prompt remaster: ROLLOUT and ADMIN only */}
      {promptTab?.visible && (
        <section className={s.block} aria-labelledby="prompt-title">
          <h2 id="prompt-title" className={s.h2}>Ask for a different master</h2>
          <p className={s.muted} style={{ margin: "0.6rem 0 1.1rem" }}>
            Describe how you&apos;d like the mastering changed. A new master will be made from your original audio.
          </p>
          <label htmlFor="prompt-remaster" className="sr-only">How should the master change?</label>
          <textarea
            id="prompt-remaster"
            value={promptTab.prompt}
            onChange={(e) => promptTab.onPromptChange(e.target.value)}
            disabled={promptTab.loading}
            placeholder="For example: warmer and punchier, a little more low end, a wider stereo image…"
            rows={4}
            className={s.textarea}
          />
          {promptTab.error && <p className={s.error} role="alert">{promptTab.error}</p>}
          <div className={s.right}>
            <button
              type="button"
              onClick={promptTab.onSubmit}
              disabled={promptTab.loading || !promptTab.prompt.trim()}
              className={s.btn}
            >
              {promptTab.loading ? (
                <>
                  <span className={s.spinner} aria-hidden="true" />
                  Starting…
                </>
              ) : (
                "Make a new master"
              )}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
