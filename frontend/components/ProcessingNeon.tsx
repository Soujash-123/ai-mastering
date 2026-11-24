import React from "react";
import { STEPS, STEP_DESCRIPTIONS, fmtTime, ProcessingProps } from "./ProcessingAurora";
import { LiveDesk } from "./processing/LiveDesk";
import s from "./processing.module.css";

const STATUS_STEP: Record<string, number> = {
  queued: -1,
  analyzing: 0,
  reasoning: 1,
  mastering: 2,
  exporting: 3,
  completed: 4,
  failed: -2,
};

const SEGMENTS = 40;

// Processing screen. Visual layer only; data comes from
// app/(app)/processing/[jobId]/page.tsx (WebSocket progress) unchanged.
export function ProcessingNeon({ jobId, status, progress, message, elapsed, copied, onCopyId, onBack, stage = "", liveView }: ProcessingProps) {
  const currentStep = STATUS_STEP[status] ?? -1;
  const pct = Math.round(progress * 100);
  const lit = Math.round((pct / 100) * SEGMENTS);
  const desc = STEP_DESCRIPTIONS[status] ?? STEP_DESCRIPTIONS.queued;
  const failed = status === "failed";

  return (
    <main className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.h1}>{failed ? "Mastering stopped" : "Mastering your track"}</h1>
          <p className={s.job}>
            <span>
              Job <span className={s.mono}>{jobId}</span>
            </span>
            <button type="button" onClick={onCopyId} className={s.copy}>
              {copied ? "Copied" : "Copy job ID"}
            </button>
          </p>
        </div>
        <button type="button" onClick={onBack} className={s.cancel}>
          {failed ? "Back to studio" : "Cancel"}
        </button>
      </header>

      {liveView && !failed && <LiveDesk view={liveView} stage={stage} status={status} />}

      <div className={s.grid}>
        <section aria-label="Progress">
          <p className={s.pct} aria-live="polite">
            {pct}
            <small>%</small>
          </p>
          <div
            className={s.ladder}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Mastering progress"
          >
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <span
                key={i}
                className={s.seg}
                data-lit={i < lit || undefined}
                data-hot={failed || undefined}
              />
            ))}
          </div>

          <div className={s.stage}>
            <p className={s.stageTitle}>{desc.title}</p>
            <p className={s.stageBody}>{desc.body}</p>
          </div>

          <p className={s.elapsed}>
            Elapsed <strong className={s.mono}>{fmtTime(elapsed)}</strong>
          </p>

          {failed ? (
            <p className={s.failed} role="alert">
              {message}
            </p>
          ) : (
            <p className={`${s.log} ${s.mono}`} aria-live="polite">
              <b aria-hidden="true">&gt;</b>
              {message}
            </p>
          )}
        </section>

        <aside aria-labelledby="pipeline-title">
          <h2 id="pipeline-title" className={s.h2}>
            Pipeline
          </h2>
          <ol className={s.steps}>
            {STEPS.map((step, i) => {
              const state = currentStep > i ? "done" : currentStep === i ? "active" : "waiting";
              return (
                <li key={step.id} data-state={state}>
                  <span className={s.mark} aria-hidden="true">
                    {state === "done" ? (
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5 9.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div>
                    <p className={s.stepLabel}>
                      {step.label}
                      {state === "active" && <span className={s.now}>Working</span>}
                      {state === "done" && <span className="sr-only"> (done)</span>}
                    </p>
                    <p className={s.stepSub}>{step.sub}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className={s.note}>
            <p className={s.noteTitle}>While you wait</p>
            <p>{desc.tip}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
