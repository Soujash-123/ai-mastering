import { UploadProps } from "./UploadProps";
import { MasteringDesk } from "./studio/MasteringDesk";
import { uploadLimitLabel } from "@/lib/auth";
import s from "./studio-upload.module.css";

// Reference track and loudness target are not sent to the backend yet, so they
// stay hidden. Flip this once they are wired up; the markup below is kept.
const SHOW_UNWIRED_CONTROLS = false;

// Upload studio. Visual layer only: every prop, handler and state comes from
// app/(app)/studio/page.tsx unchanged.
export function UploadNeon({
  dragOver, setDragOver, busy, progress, error, setError,
  platform, setPlatform, intentValue, setIntentValue,
  showAdvanced, setShowAdvanced, selectedFile, setSelectedFile,
  fileDuration, setFileDuration, tier, setShowTierModal,
  tierCfg, onFiles, handleMaster, inputRef,
  fmt, fmtDur, isDurationExceeded, PLATFORMS, CREATIVE_INTENTS,
  styleFamily, setStyleFamily, STYLE_FAMILIES,
  desk, deskTweaks, canEditDesk, onDeskChange, onDeskReset,
}: UploadProps) {
  const activeStyle = STYLE_FAMILIES.find((f) => f.value === styleFamily) ?? STYLE_FAMILIES[0];
  const dropState = isDurationExceeded ? "exceeded" : dragOver ? "over" : selectedFile ? "file" : "idle";
  const canMaster = !!selectedFile && !busy && !isDurationExceeded;

  return (
    <main className={s.page}>
      <header className={s.head}>
        <div>
          <h1 className={s.h1}>Master a track</h1>
          <p className={s.lede}>
            Drop in your mix, tell Kord what kind of music it is, and get back release-ready files.
          </p>
        </div>
        <p className={s.tier}>
          <strong>{tierCfg.label}</strong>: tracks up to {tierCfg.maxDurationLabel}
        </p>
      </header>

      {/* 1. File */}
      <section className={s.step} aria-labelledby="step-file">
        <div className={s.stepHead}>
          <span className={s.stepNum} aria-hidden="true">1</span>
          <div>
            <h2 id="step-file" className={s.h2}>Your track</h2>
          </div>
        </div>

        <div
          className={s.drop}
          data-state={dropState}
          role={selectedFile ? undefined : "button"}
          tabIndex={selectedFile ? undefined : 0}
          aria-label={selectedFile ? undefined : "Choose an audio file to master"}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void onFiles(e.dataTransfer.files); }}
          onClick={() => !selectedFile && !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!selectedFile && !busy && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          {!selectedFile ? (
            <>
              <p className={s.dropTitle}>{dragOver ? "Let go to add your track" : "Drop your track here"}</p>
              <p className={s.dropAlt}>
                or <span>choose a file</span>
              </p>
              <p className={s.formats}>WAV, FLAC, AIFF, or a phone recording: M4A, AAC, MP3, OGG, Opus</p>
            </>
          ) : (
            <>
              <div className={`${s.file} ${isDurationExceeded ? s.fileExceeded : ""}`}>
                <span className={s.fileIcon} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8h2l1.5-4 2 8 2-6 1.5 2H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
                  </svg>
                </span>
                <div style={{ minWidth: 0 }}>
                  <p className={s.fileName}>{selectedFile.name}</p>
                  <p className={s.fileMeta}>
                    {fmt(selectedFile.size)}
                    {fileDuration !== null && (
                      <span className={isDurationExceeded ? s.fileMetaBad : undefined}>
                        {"  ·  "}
                        {fmtDur(fileDuration)}
                        {isDurationExceeded && ` (limit ${tierCfg.maxDurationLabel})`}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className={s.remove}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setFileDuration(null);
                    setError(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  disabled={busy}
                >
                  Remove
                </button>
              </div>

              {isDurationExceeded && (
                <div className={s.problem} role="alert">
                  <p className={s.problemTitle}>This track is longer than {tierCfg.maxDurationLabel}</p>
                  {tier !== "early_access" ? (
                    <>
                      <p>Early Access allows tracks up to {uploadLimitLabel("EARLY_ACCESS")}. Request it, or trim your file.</p>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setShowTierModal(true); }}>
                        Request Early Access
                      </button>
                    </>
                  ) : (
                    <p>Trim your file to {tierCfg.maxDurationLabel} or less and add it again.</p>
                  )}
                </div>
              )}

              {error && !isDurationExceeded && <p className={s.error} role="alert">{error}</p>}

              {busy && (
                <div className={s.progress}>
                  <div className={s.progressTrack}>
                    <div className={s.progressBar} style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <p className={s.progressLabel}>Uploading…</p>
                </div>
              )}
            </>
          )}
          {!selectedFile && error && <p className={s.error} role="alert">{error}</p>}

          <input
            ref={inputRef}
            type="file"
            accept=".wav,.flac,.aiff,.aif,.m4a,.aac,.mp3,.ogg,.opus,audio/*"
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </div>
      </section>

      {/* 2. Style */}
      <section className={s.step} aria-labelledby="step-style">
        <div className={s.stepHead}>
          <span className={s.stepNum} aria-hidden="true">2</span>
          <div>
            <h2 id="step-style" className={s.h2}>What are you releasing?</h2>
            <p className={s.stepSub}>Pick the closest style. It sets safe limits and moves the desk below to a starting point.</p>
          </div>
        </div>
        <div className={s.styles} role="radiogroup" aria-labelledby="step-style">
          {STYLE_FAMILIES.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={f.value === styleFamily}
              disabled={busy}
              onClick={() => setStyleFamily(f.value)}
              className={s.styleBtn}
            >
              <span className={s.styleName}>{f.label}</span>
            </button>
          ))}
        </div>
        <p className={s.styleNow} aria-live="polite">
          <strong>{activeStyle.label}:</strong> {activeStyle.hint}
        </p>
        <MasteringDesk
          style={styleFamily}
          desk={desk}
          tweaks={deskTweaks}
          editable={canEditDesk}
          disabled={busy}
          onChange={onDeskChange}
          onReset={onDeskReset}
          onUnlock={() => setShowTierModal(true)}
        />
      </section>

      {/* 3. Advanced */}
      <section className={s.step} aria-labelledby="step-adv">
        {tierCfg.canAccessAdvancedSettings ? (
          <>
            <button
              type="button"
              className={s.advToggle}
              aria-expanded={showAdvanced}
              aria-controls="adv-panel"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <span className={s.stepHead} style={{ marginBottom: 0 }}>
                <span className={s.stepNum} aria-hidden="true">3</span>
                <span>
                  <span id="step-adv" className={s.h2}>Platform and character</span>
                  <span className={s.stepSub} style={{ display: "block" }}>Optional. Defaults suit most releases.</span>
                </span>
              </span>
              <svg width="18" height="18" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
              </svg>
            </button>

            {showAdvanced && (
              <div id="adv-panel">
                <div className={s.advGrid}>
                  <div className={s.field}>
                    <label htmlFor="adv-platform" className={s.label}>Platform</label>
                    <select id="adv-platform" className={s.select} value={platform} onChange={(e) => setPlatform(e.target.value)}>
                      {PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={s.field}>
                    <label htmlFor="adv-intent" className={s.label}>Character</label>
                    <select id="adv-intent" className={s.select} value={intentValue} onChange={(e) => setIntentValue(e.target.value)}>
                      {CREATIVE_INTENTS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* TODO(soujash): reference track and loudness target are not sent to the
                      backend yet (they never were); hidden until they are wired up. */}
                  {SHOW_UNWIRED_CONTROLS && (
                  <>
                  <div className={s.field}>
                    <span className={s.label}>
                      Reference track <span className={s.labelNote}>(coming soon)</span>
                    </span>
                    <button type="button" className={s.ghostBtn} disabled>
                      Add reference
                    </button>
                  </div>
                  <div className={s.field}>
                    <label htmlFor="adv-lufs" className={s.label}>
                      Loudness target <span className={s.labelNote}>(coming soon)</span>
                    </label>
                    <select id="adv-lufs" className={s.select} defaultValue="-14" disabled>
                      <option value="-14">−14 LUFS</option>
                      <option value="-16">−16 LUFS</option>
                      <option value="-13">−13 LUFS</option>
                      <option value="-9">−9 LUFS</option>
                    </select>
                  </div>
                  </>
                  )}
                </div>
                <button
                  type="button"
                  className={s.textBtn}
                  onClick={() => {
                    setPlatform("Spotify");
                    setIntentValue(CREATIVE_INTENTS[0].value);
                  }}
                >
                  Reset to defaults
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={s.locked}>
            <div className={s.stepHead} style={{ marginBottom: 0 }}>
              <span className={s.stepNum} aria-hidden="true">3</span>
              <div>
                <h2 id="step-adv" className={s.h2}>Platform and character</h2>
                <p className={s.stepSub}>Available with Early Access.</p>
              </div>
            </div>
            <button type="button" className={s.lockedBtn} onClick={(e) => { e.stopPropagation(); setShowTierModal(true); }}>
              See Early Access
            </button>
          </div>
        )}
      </section>

      {/* Master */}
      <div className={s.go}>
        <p className={s.goNote}>
          Your upload is deleted about 10 minutes after you finish working on it. The finished master is kept for 12
          hours so you can download it.
        </p>
        <button type="button" className={s.master} onClick={handleMaster} disabled={!canMaster}>
          {busy ? "Uploading…" : "Master this track"}
        </button>
      </div>
    </main>
  );
}
