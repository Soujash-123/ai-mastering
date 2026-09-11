import { UploadProps } from "./UploadProps";
import { NeonWaveformCanvas } from "./NeonWaveformCanvas";

// Note: In UploadAurora these are local to page.tsx, but in Neon we can just use the props
export function UploadNeon({
  dragOver, setDragOver, busy, progress, error, setError,
  platform, setPlatform, intentValue, setIntentValue,
  showAdvanced, setShowAdvanced, selectedFile, setSelectedFile,
  fileDuration, setFileDuration, tier, showTierModal, setShowTierModal,
  tierCfg, handleTierSelect, onFiles, handleMaster, inputRef,
  fmt, fmtDur, isDurationExceeded, PLATFORMS, CREATIVE_INTENTS
}: UploadProps) {
  return (
    <main className="relative overflow-hidden w-full h-full min-h-[calc(100vh-57px)] font-outfit">
      {/* Background elements */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_30%,black_20%,transparent_100%)]" 
        style={{ 
          backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)", 
          backgroundSize: "60px 60px", 
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 30%,black 20%,transparent 100%)" 
        }} 
      />
      <div className="absolute top-[-15%] left-1/2 w-[600px] h-[600px] -translate-x-1/2 bg-[radial-gradient(circle,rgba(34,211,238,0.07)_0%,transparent_65%)] pointer-events-none z-0" />
      <div className="absolute bottom-[10%] -right-5 w-[350px] h-[350px] bg-[radial-gradient(circle,rgba(163,230,53,0.05)_0%,transparent_65%)] pointer-events-none z-0" />
      <div className="absolute bottom-[5%] -left-5 w-[300px] h-[300px] bg-[radial-gradient(circle,rgba(244,114,182,0.04)_0%,transparent_65%)] pointer-events-none z-0" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-20">
        
        {/* Wave Hero */}
        <div className="relative w-full h-[160px] -mb-10">
          <NeonWaveformCanvas />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#09090b] pointer-events-none" />
        </div>

        {/* Hero Card */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center px-10 py-10 rounded-3xl border border-cyan-400/10 bg-[#09090b]/70 backdrop-blur-xl shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_32px_60px_rgba(0,0,0,0.5)] mb-8">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-cyan-400/20 bg-cyan-400/[0.06] text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-4">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 5h1.5l1-3 1.5 6 1.5-4.5L8 5h1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
              Real-time Analysis
            </div>
            <h1 className="text-4xl sm:text-5xl font-black leading-[1.1] mb-4 text-white">
              Master your sound<br />
              <span className="bg-gradient-to-r from-cyan-400 via-lime-400 to-cyan-400 bg-clip-text text-transparent animate-shimmer" style={{ backgroundSize: "200% auto" }}>
                with intelligence.
              </span>
            </h1>
            <p className="text-[13px] text-white/40 leading-[1.7] max-w-md">
              Feed your raw audio into our spectral AI engine. Get streaming-ready masters with adaptive EQ, multiband compression, and surgical DSP — all in real-time.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl border border-white/5 bg-white/[0.02] transition-colors hover:bg-white/[0.04] hover:border-white/10 group relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_#22d3ee]" />
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.08]">
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7h2l1.5-4 2 8 2-5 1.5 2H13" stroke="#22d3ee" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Spectral Analysis</p>
                <p className="text-[10px] text-white/40 mt-0.5">Deep frequency profiling of your mix</p>
              </div>
            </div>
            <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl border border-white/5 bg-white/[0.02] transition-colors hover:bg-white/[0.04] hover:border-white/10 group relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-lime-400 opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_#a3e635]" />
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-lime-400/20 bg-lime-400/[0.08]">
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="4" stroke="#a3e635" strokeWidth="1.2" />
                  <path d="M7 5v4M5 7h4" stroke="#a3e635" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Adaptive DSP Chain</p>
                <p className="text-[10px] text-white/40 mt-0.5">EQ, compression, limiting — all dynamic</p>
              </div>
            </div>
            <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl border border-white/5 bg-white/[0.02] transition-colors hover:bg-white/[0.04] hover:border-white/10 group relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-pink-400 opacity-0 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_#f472b6]" />
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pink-400/20 bg-pink-400/[0.08]">
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <path d="M4 10l3-3 3 3" stroke="#f472b6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 6l3-3 3 3" stroke="#f472b6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Streaming Ready</p>
                <p className="text-[10px] text-white/40 mt-0.5">LUFS-targeted exports for every platform</p>
              </div>
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={[
            "relative cursor-pointer overflow-hidden rounded-[22px] border transition-all duration-300 mb-8",
            isDurationExceeded
              ? "border-rose-500/50 bg-rose-500/[0.035]"
              : dragOver
                ? "border-cyan-400 bg-cyan-400/[0.03] shadow-[0_0_80px_rgba(34,211,238,0.12),0_0_0_2px_rgba(34,211,238,0.25)]"
                : selectedFile
                  ? "border-cyan-400/30 bg-white/[0.02]"
                  : "border-cyan-400/10 bg-white/[0.015] hover:border-cyan-400/30 hover:shadow-[0_0_50px_rgba(34,211,238,0.06),0_0_0_1px_rgba(34,211,238,0.1)]",
          ].join(" ")}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void onFiles(e.dataTransfer.files); }}
          onClick={() => !selectedFile && !busy && inputRef.current?.click()}
        >
          {/* Dropzone inner glows */}
          <div className="absolute inset-0 rounded-[22px] bg-gradient-to-br from-cyan-400/[0.03] via-transparent to-lime-400/[0.02] pointer-events-none" />
          <div className="absolute bottom-0 left-[8%] right-[8%] h-[1px] bg-gradient-to-r from-transparent via-cyan-400 to-lime-400 opacity-0 transition-opacity duration-300 group-hover:opacity-60" />

          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-8 px-10 py-10 min-h-[160px]">
            {!selectedFile ? (
              <>
                <div>
                  <div className="flex items-center gap-[2.5px] h-[52px] mb-3">
                    {Array.from({ length: 15 }).map((_, i) => {
                      const h = [20,35,48,28,52,44,38,52,42,32,24,45,36,28,50][i];
                      const isLime = i % 5 === 0;
                      const isPink = i % 7 === 0;
                      return (
                        <div
                          key={i}
                          className="w-[3px] rounded-full animate-pulse shadow-[0_0_6px_rgba(34,211,238,0.3)]"
                          style={{
                            height: `${h}px`,
                            background: isLime ? 'linear-gradient(180deg,#a3e635,rgba(163,230,53,0.2))' : isPink ? 'linear-gradient(180deg,#f472b6,rgba(244,114,182,0.2))' : 'linear-gradient(180deg,#22d3ee,rgba(34,211,238,0.2))',
                            animationDelay: `${i * 0.06}s`,
                            animationDuration: `${0.5 + (i % 3) * 0.2}s`
                          }}
                        />
                      );
                    })}
                  </div>
                  <p className="text-[17px] font-bold mb-1 text-white">
                    {dragOver ? "Release to upload" : "Drop audio to begin mastering"}
                  </p>
                  <p className="text-[13px] text-white/40 mb-3">
                    or <span className="text-cyan-400 underline underline-offset-4 decoration-cyan-400/30">browse your files</span>
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {["WAV", "FLAC", "24-bit", "Any sample rate"].map(t => (
                      <span key={t} className="px-2.5 py-1 rounded-[7px] border border-cyan-400/15 bg-cyan-400/[0.04] text-[10px] font-semibold text-cyan-400/70 tracking-widest uppercase">
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] font-medium mt-3" style={{ color: `${tierCfg.color}99` }}>
                    {tierCfg.label}: up to {tierCfg.maxDurationLabel}
                  </p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <button className="w-[60px] h-[60px] rounded-2xl border-[1.5px] border-cyan-400/35 bg-cyan-400/[0.07] text-cyan-400 flex items-center justify-center transition-all hover:bg-cyan-400/[0.14] hover:shadow-[0_0_36px_rgba(34,211,238,0.2)] hover:scale-105 hover:border-cyan-400/55 shadow-[0_0_24px_rgba(34,211,238,0.1)]">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 14V4M10 4L6 8M10 4L14 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 16h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                  <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30">Upload</span>
                </div>
              </>
            ) : (
              <div className="flex w-full flex-col items-center gap-5 animate-fade-in-up">
                {/* File card neon version */}
                <div
                  className="flex w-full max-w-sm items-center gap-4 rounded-2xl border px-5 py-4 transition-all"
                  style={{
                    borderColor: isDurationExceeded ? "rgba(244,63,94,0.35)" : "rgba(34,211,238,0.2)",
                    background: isDurationExceeded ? "rgba(244,63,94,0.05)" : "rgba(34,211,238,0.05)",
                  }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: isDurationExceeded ? "rgba(244,63,94,0.3)" : "rgba(34,211,238,0.3)",
                      background: isDurationExceeded ? "rgba(244,63,94,0.1)" : "rgba(34,211,238,0.1)",
                      color: isDurationExceeded ? "#f87171" : "#22d3ee",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="2.5" y="1.5" width="8.5" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M8.5 1.5v4H13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      <path d="M5 9h6M5 11.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-white">{selectedFile.name}</p>
                    <p className="text-[11px] text-white/50">
                      {fmt(selectedFile.size)}
                      {fileDuration !== null && (
                        <span className={isDurationExceeded ? " text-rose-400 font-semibold" : " text-white/50"}>
                          {" "}• {fmtDur(fileDuration)}
                          {isDurationExceeded && ` (limit: ${tierCfg.maxDurationLabel})`}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setFileDuration(null);
                      setError(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                    className="shrink-0 rounded-lg p-1.5 text-white/30 transition hover:bg-white/10 hover:text-white"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                {/* Duration exceeded CTA */}
                {isDurationExceeded && (
                  <div className="w-full max-w-sm rounded-2xl border border-rose-500/25 bg-rose-500/[0.05] px-4 py-3.5 text-center">
                    <p className="mb-2 text-xs font-semibold text-rose-300">
                      File exceeds {tierCfg.maxDurationLabel} limit
                    </p>
                    <p className="mb-3 text-[10px] text-rose-300/70">
                      Switch to Early Access to upload up to 5 min, or trim your file.
                    </p>
                    {tier !== "early_access" && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setShowTierModal(true); }}
                        className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-1.5 text-[11px] font-bold text-rose-300 transition hover:bg-rose-500/20"
                      >
                        Switch to Early Access →
                      </button>
                    )}
                  </div>
                )}

                {error && !isDurationExceeded && <p className="text-xs text-rose-300">{error}</p>}
                
                {/* Upload progress bar */}
                {busy && (
                  <div className="w-full max-w-sm mt-2">
                    <div className="h-0.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-cyan-400 transition-all duration-700"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-center text-[11px] text-white/40">Uploading…</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <input
            ref={inputRef}
            type="file"
            accept=".wav,.flac,audio/wav,audio/flac,audio/x-flac"
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </div>

        {/* Advanced Settings */}
        {tierCfg.canAccessAdvancedSettings ? (
          <div className="w-full max-w-6xl mx-auto overflow-hidden rounded-2xl border border-cyan-400/10 bg-[#09090b]/40 backdrop-blur-md mb-8">
            <button
              type="button"
              className="flex w-full items-center gap-3.5 px-6 py-4 text-left transition hover:bg-white/[0.02]"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-cyan-400">
                  <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3 3l1.4 1.4M9.6 9.6l1.4 1.4M3 11l1.4-1.4M9.6 4.4l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">Advanced Settings</p>
                <p className="text-[10px] text-white/40">Tailor the mastering process to your needs</p>
              </div>
              <div className="flex items-center gap-3">
                {showAdvanced && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlatform("Spotify");
                      setIntentValue(CREATIVE_INTENTS[0].value);
                    }}
                    className="flex items-center gap-1 text-[10px] text-white/40 transition hover:text-white"
                  >
                    Reset to default
                  </button>
                )}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`text-cyan-400 transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}>
                  <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {showAdvanced && (
              <div className="border-t border-cyan-400/10 px-6 pb-6 pt-5 animate-fade-in-up">
                <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
                  {/* Platform */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">Platform</span>
                    </div>
                    <select
                      className="w-full rounded-xl border border-cyan-400/20 bg-black/40 px-3 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-cyan-400 transition"
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Creative Intent */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">Creative Intent</span>
                    </div>
                    <select
                      className="w-full rounded-xl border border-lime-400/20 bg-black/40 px-3 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-lime-400 transition"
                      value={intentValue}
                      onChange={(e) => setIntentValue(e.target.value)}
                    >
                      {CREATIVE_INTENTS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Reference Track */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">Reference Track</span>
                      <span className="rounded bg-white/[0.07] px-1 py-0.5 text-[8px] text-white/40">Optional</span>
                    </div>
                    <button type="button" className="flex w-full items-center gap-2 rounded-xl border border-cyan-400/20 bg-black/40 px-3 py-2.5 text-xs text-cyan-400 transition hover:bg-cyan-400/10">
                      Add reference
                    </button>
                  </div>

                  {/* Loudness Target */}
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">Loudness Target</span>
                      <span className="rounded bg-white/[0.07] px-1 py-0.5 text-[8px] text-white/40">Auto</span>
                    </div>
                    <select className="w-full rounded-xl border border-pink-400/20 bg-black/40 px-3 py-2.5 text-xs text-white outline-none focus:ring-1 focus:ring-pink-400 transition" defaultValue="-14">
                      <option value="-14">-14 LUFS</option>
                      <option value="-16">-16 LUFS</option>
                      <option value="-13">-13 LUFS</option>
                      <option value="-9">-9 LUFS</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-6xl mx-auto overflow-hidden rounded-2xl border border-cyan-400/5 bg-[#09090b]/40 backdrop-blur-md mb-8 opacity-70">
            <div className="flex items-center gap-3.5 px-6 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/5 bg-white/[0.02]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white/20">
                  <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7 1.5v2M7 10.5v2M1.5 7h2M10.5 7h2M3 3l1.4 1.4M9.6 9.6l1.4 1.4M3 11l1.4-1.4M9.6 4.4l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30">Advanced Settings</p>
                <p className="text-[10px] text-white/20">Available for Early Access users</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowTierModal(true); }}
                className="flex items-center gap-1.5 rounded-xl border border-lime-400/30 bg-lime-400/10 px-3 py-1.5 text-[10px] font-bold text-lime-400 transition hover:bg-lime-400/20"
              >
                Early Access
              </button>
            </div>
          </div>
        )}

        {/* Bottom stats and CTA */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 flex-wrap">
          <div className="flex gap-4 flex-wrap justify-center md:justify-start">
            <div className="flex flex-col items-center px-5 py-3.5 border border-white/5 rounded-2xl bg-white/[0.02] min-w-[90px] transition-colors hover:border-cyan-400/20">
              <div className="text-xl font-extrabold bg-gradient-to-br from-cyan-400 to-lime-400 bg-clip-text text-transparent">0.4s</div>
              <div className="text-[9px] text-white/30 uppercase tracking-[0.15em] mt-1">Avg Analysis</div>
            </div>
            <div className="flex flex-col items-center px-5 py-3.5 border border-white/5 rounded-2xl bg-white/[0.02] min-w-[90px] transition-colors hover:border-cyan-400/20">
              <div className="text-xl font-extrabold bg-gradient-to-br from-cyan-400 to-lime-400 bg-clip-text text-transparent">-14</div>
              <div className="text-[9px] text-white/30 uppercase tracking-[0.15em] mt-1">LUFS Target</div>
            </div>
            <div className="flex flex-col items-center px-5 py-3.5 border border-white/5 rounded-2xl bg-white/[0.02] min-w-[90px] transition-colors hover:border-cyan-400/20">
              <div className="text-xl font-extrabold bg-gradient-to-br from-cyan-400 to-lime-400 bg-clip-text text-transparent">8-band</div>
              <div className="text-[9px] text-white/30 uppercase tracking-[0.15em] mt-1">Adaptive EQ</div>
            </div>
            <div className="flex flex-col items-center px-5 py-3.5 border border-white/5 rounded-2xl bg-white/[0.02] min-w-[90px] transition-colors hover:border-cyan-400/20">
              <div className="text-xl font-extrabold bg-gradient-to-br from-cyan-400 to-lime-400 bg-clip-text text-transparent">24-bit</div>
              <div className="text-[9px] text-white/30 uppercase tracking-[0.15em] mt-1">Output</div>
            </div>
          </div>
          
          <div className="flex flex-col items-center md:items-end gap-3 w-full md:w-auto">
            <button
              onClick={handleMaster}
              disabled={!selectedFile || busy || isDurationExceeded}
              className={`relative overflow-hidden inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-2xl border-[1.5px] border-cyan-400/40 bg-transparent text-cyan-400 text-sm font-bold transition-all
                ${(!selectedFile || busy || isDurationExceeded) 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:border-cyan-400/70 hover:shadow-[0_0_30px_rgba(34,211,238,0.15),0_0_0_1px_rgba(34,211,238,0.3)] hover:-translate-y-px cursor-pointer group'}`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 to-lime-400/[0.06] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <span className="relative z-10">{busy ? 'Processing...' : 'Master with KORD'}</span>
              {!busy && (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="relative z-10">
                  <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <div className="flex gap-3.5 flex-wrap justify-center">
              <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                <div className="w-[5px] h-[5px] rounded-full bg-lime-400 shadow-[0_0_6px_#a3e635]" /> Encrypted
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                <div className="w-[5px] h-[5px] rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" /> Auto-deletes 10 min
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                <div className="w-[5px] h-[5px] rounded-full bg-pink-400 shadow-[0_0_6px_#f472b6]" /> No account needed
              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
