/* Live mastering layer for the Mastering Table (BETA).
 *
 * Plays the AI master through a Web Audio graph that mirrors
 * backend/studio/render.py, so every edit is heard on the next audio block
 * (no network, no re-render):
 *
 *   base <audio> → region shelves + region gain (100 Hz automation curves)
 *     → Tone EQ (4 RBJ biquads) → Glue comp (AudioWorklet) → Warmth (WaveShaper)
 *     → Width (M/S) → Output gain → Brickwall limiter (AudioWorklet) → monitor
 *   base <audio> ───────────────────────────────────────────────→ monitor ("AI master")
 *   original <audio> → level match ─────────────────────────────→ monitor ("Original")
 */
import {
  CONTROL_RATE_HZ,
  compMakeupDb,
  compThresholdDb,
  dbToGain,
  limiterCeilingLin,
  regionCurves,
  warmthCurve,
} from "./dsp";
import type { ListenMode, Region, StudioSession } from "./types";

const RAMP = 0.01; // seconds; setTargetAtTime time constant (~10 ms)
const WORKLET_URL = "/worklets/studio-dynamics.js";

type Constants = Record<string, number>;

export type MeterReading = { peakDb: number; lufsM: number | null };

function num(v: number | boolean | undefined, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export class StudioEngine {
  readonly ctx: AudioContext;
  private base: HTMLAudioElement;
  private original: HTMLAudioElement;
  private c: Constants;
  private duration: number;

  // nodes
  private regionLow!: BiquadFilterNode;
  private regionHigh!: BiquadFilterNode;
  private regionGain!: GainNode;
  private eq!: BiquadFilterNode[];
  private comp!: AudioWorkletNode;
  private warmDry!: GainNode;
  private warmWet!: GainNode;
  private shaper!: WaveShaperNode;
  private sideHP!: BiquadFilterNode;
  private sideWidth!: GainNode;
  private outGain!: GainNode;
  private limiter!: AudioWorkletNode;
  private editBus!: GainNode;
  private aiBus!: GainNode;
  private origBus!: GainNode;
  private analyser!: AnalyserNode;
  private kAnalyser!: AnalyserNode;
  private meterBuf = new Float32Array(16384);
  private kBuf = new Float32Array(16384);

  private regions: Region[] = [];
  private curves: ReturnType<typeof regionCurves> | null = null;
  private lastDrive = -1;
  private mode: ListenMode = "edit";
  private loop: { start: number; end: number } | null = null;
  private lastSchedule = 0;
  private ready = false;

  constructor(opts: {
    baseUrl: string;
    originalUrl: string;
    durationSec: number;
    constants: Constants;
    originalMatchDb: number;
  }) {
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.duration = opts.durationSec;
    this.c = opts.constants;
    this.base = StudioEngine.makeAudio(opts.baseUrl);
    this.original = StudioEngine.makeAudio(opts.originalUrl);
    this.originalMatchDb = opts.originalMatchDb;
  }

  private originalMatchDb: number;

  private static makeAudio(url: string): HTMLAudioElement {
    const a = new Audio();
    a.crossOrigin = "anonymous";
    a.preload = "auto";
    a.src = url;
    return a;
  }

  async init(): Promise<void> {
    const ctx = this.ctx;
    await ctx.audioWorklet.addModule(WORKLET_URL);
    const c = this.c;

    const baseSrc = ctx.createMediaElementSource(this.base);
    const origSrc = ctx.createMediaElementSource(this.original);

    // Regions
    this.regionLow = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: c.region_bass_hz, gain: 0 });
    this.regionHigh = new BiquadFilterNode(ctx, { type: "highshelf", frequency: c.region_air_hz, gain: 0 });
    this.regionGain = new GainNode(ctx, { gain: 1 });

    // Tone EQ (Web Audio biquads implement the RBJ cookbook used server-side)
    this.eq = [
      new BiquadFilterNode(ctx, { type: "lowshelf", frequency: c.eq_bass_hz, gain: 0 }),
      new BiquadFilterNode(ctx, { type: "peaking", frequency: c.eq_mud_hz, Q: c.eq_mud_q, gain: 0 }),
      new BiquadFilterNode(ctx, { type: "peaking", frequency: c.eq_presence_hz, Q: c.eq_presence_q, gain: 0 }),
      new BiquadFilterNode(ctx, { type: "highshelf", frequency: c.eq_air_hz, gain: 0 }),
    ];

    const stereo = { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" as const, channelInterpretation: "speakers" as const };
    this.comp = new AudioWorkletNode(ctx, "studio-dynamics", { ...stereo, processorOptions: { mode: "comp" } });
    this.comp.parameters.get("knee")!.value = c.comp_knee_db;

    // Warmth: dry/wet around tanh shaper (input pre-scaled by 0.5)
    const warmIn = new GainNode(ctx);
    const warmPre = new GainNode(ctx, { gain: 0.5 });
    this.shaper = new WaveShaperNode(ctx, { oversample: "none" });
    this.warmDry = new GainNode(ctx, { gain: 1 });
    this.warmWet = new GainNode(ctx, { gain: 0 });
    const warmOut = new GainNode(ctx);

    // Width (M/S)
    const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const mono = { channelCount: 1, channelCountMode: "explicit" as const };
    const midL = new GainNode(ctx, { gain: 0.5, ...mono });
    const midR = new GainNode(ctx, { gain: 0.5, ...mono });
    const sideL = new GainNode(ctx, { gain: 0.5, ...mono });
    const sideR = new GainNode(ctx, { gain: -0.5, ...mono });
    const mid = new GainNode(ctx, { gain: 1, ...mono });
    const side = new GainNode(ctx, { gain: 1, ...mono });
    this.sideHP = new BiquadFilterNode(ctx, { type: "highpass", frequency: 1, Q: -3.0103, ...mono });
    this.sideWidth = new GainNode(ctx, { gain: 1, ...mono });
    const sideNeg = new GainNode(ctx, { gain: -1, ...mono });
    const merge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });

    this.outGain = new GainNode(ctx, { gain: 1 });
    this.limiter = new AudioWorkletNode(ctx, "studio-dynamics", { ...stereo, processorOptions: { mode: "limit" } });
    this.limiter.parameters.get("release")!.value = c.limiter_release_ms;

    this.editBus = new GainNode(ctx, { gain: 1 });
    this.aiBus = new GainNode(ctx, { gain: 0 });
    this.origBus = new GainNode(ctx, { gain: 0 });
    const monitor = new GainNode(ctx);
    this.analyser = new AnalyserNode(ctx, { fftSize: 16384 });
    // Approximate K-weighting for the momentary loudness meter.
    const kShelf = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 1681, gain: 4 });
    const kHP = new BiquadFilterNode(ctx, { type: "highpass", frequency: 38, Q: -3.0103 });
    this.kAnalyser = new AnalyserNode(ctx, { fftSize: 16384 });

    // Wire the edit path
    baseSrc.connect(this.regionLow).connect(this.regionHigh).connect(this.regionGain);
    let node: AudioNode = this.regionGain;
    for (const f of this.eq) node = node.connect(f);
    node.connect(this.comp).connect(warmIn);
    warmIn.connect(this.warmDry).connect(warmOut);
    warmIn.connect(warmPre).connect(this.shaper).connect(this.warmWet).connect(warmOut);
    warmOut.connect(split);
    split.connect(midL, 0);
    split.connect(midR, 1);
    split.connect(sideL, 0);
    split.connect(sideR, 1);
    midL.connect(mid);
    midR.connect(mid);
    sideL.connect(side);
    sideR.connect(side);
    side.connect(this.sideHP).connect(this.sideWidth);
    mid.connect(merge, 0, 0);
    mid.connect(merge, 0, 1);
    this.sideWidth.connect(merge, 0, 0);
    this.sideWidth.connect(sideNeg).connect(merge, 0, 1);
    merge.connect(this.outGain).connect(this.limiter).connect(this.editBus).connect(monitor);

    // Reference paths
    baseSrc.connect(this.aiBus).connect(monitor);
    origSrc.connect(this.origBus).connect(monitor);

    monitor.connect(ctx.destination);
    monitor.connect(this.analyser);
    monitor.connect(kShelf).connect(kHP).connect(this.kAnalyser);

    this.original.muted = false;
    this.base.addEventListener("seeked", () => this.syncOriginal(true));
    this.ready = true;
  }

  // --- transport -------------------------------------------------------------

  get currentTime(): number {
    return this.base.currentTime;
  }

  get playing(): boolean {
    return !this.base.paused;
  }

  async play(): Promise<void> {
    if (this.ctx.state !== "running") await this.ctx.resume();
    this.syncOriginal(true);
    await Promise.all([this.base.play(), this.original.play().catch(() => undefined)]);
    this.scheduleRegions();
  }

  pause(): void {
    this.base.pause();
    this.original.pause();
    this.scheduleRegions();
  }

  seek(t: number): void {
    const clamped = Math.max(0, Math.min(this.duration - 0.05, t));
    this.base.currentTime = clamped;
    this.syncOriginal(true);
    this.scheduleRegions(clamped);
  }

  setLoop(loop: { start: number; end: number } | null): void {
    this.loop = loop;
  }

  setMode(mode: ListenMode): void {
    this.mode = mode;
    const now = this.ctx.currentTime;
    this.editBus.gain.setTargetAtTime(mode === "edit" ? 1 : 0, now, RAMP);
    this.aiBus.gain.setTargetAtTime(mode === "ai" ? 1 : 0, now, RAMP);
    this.origBus.gain.setTargetAtTime(mode === "original" ? dbToGain(this.originalMatchDb) : 0, now, RAMP);
  }

  /** Call every animation frame: handles looping, A/B sync and automation drift. */
  tick(): void {
    if (!this.ready || !this.playing) return;
    const t = this.base.currentTime;
    if (this.loop && t >= this.loop.end) {
      this.seek(this.loop.start);
      return;
    }
    this.syncOriginal(false);
    if (performance.now() - this.lastSchedule > 8000) this.scheduleRegions();
  }

  private syncOriginal(force: boolean): void {
    const drift = Math.abs(this.original.currentTime - this.base.currentTime);
    if (force || drift > 0.06) {
      try {
        this.original.currentTime = Math.min(this.base.currentTime, this.original.duration || this.base.currentTime);
      } catch {
        /* not seekable yet */
      }
    }
  }

  // --- session → graph -------------------------------------------------------

  applySession(session: StudioSession): void {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, now, RAMP);
    const m = session.modules;

    const eq = m.eq;
    const eqOn = !!eq?.enabled;
    set(this.eq[0].gain, eqOn ? num(eq.bass_db) : 0);
    set(this.eq[1].gain, eqOn ? num(eq.mud_db) : 0);
    set(this.eq[2].gain, eqOn ? num(eq.presence_db) : 0);
    set(this.eq[3].gain, eqOn ? num(eq.air_db) : 0);

    const comp = m.comp;
    const cp = this.comp.parameters;
    const amount = num(comp?.amount, 0.3);
    const ratio = num(comp?.ratio, 2);
    cp.get("enabled")!.setValueAtTime(comp?.enabled ? 1 : 0, now);
    set(cp.get("threshold")!, compThresholdDb(amount));
    set(cp.get("ratio")!, ratio);
    cp.get("attack")!.setValueAtTime(num(comp?.attack_ms, 20), now);
    cp.get("release")!.setValueAtTime(num(comp?.release_ms, 200), now);
    set(cp.get("makeup")!, compMakeupDb(amount, ratio));
    set(cp.get("mix")!, num(comp?.mix, 1));

    const warm = m.warmth;
    const mix = warm?.enabled ? num(warm.mix, 0.5) : 0;
    const drive = num(warm?.drive, 0.3);
    if (Math.abs(drive - this.lastDrive) > 1e-4) {
      this.shaper.curve = warmthCurve(drive);
      this.lastDrive = drive;
    }
    set(this.warmDry.gain, 1 - mix);
    set(this.warmWet.gain, mix);

    const width = m.width;
    const widthOn = !!width?.enabled;
    set(this.sideWidth.gain, widthOn ? num(width.width, 1) : 1);
    const monoHz = widthOn ? num(width.bass_mono_hz) : 0;
    set(this.sideHP.frequency, monoHz > 0 ? monoHz : 1);

    const out = m.output;
    const outOn = !!out?.enabled;
    set(this.outGain.gain, outOn ? dbToGain(num(out.gain_db)) : 1);
    this.limiter.parameters.get("ceiling")!.setValueAtTime(limiterCeilingLin(outOn ? num(out.ceiling_db, -1) : -1), now);

    if (JSON.stringify(session.regions) !== JSON.stringify(this.regions)) {
      this.regions = session.regions;
      this.curves = regionCurves(session.regions, this.duration);
      this.scheduleRegions();
    }
  }

  /** Re-lay the region automation from the current (or given) song position. */
  private scheduleRegions(at?: number): void {
    if (!this.ready) return;
    this.lastSchedule = performance.now();
    const now = this.ctx.currentTime;
    const t0 = at ?? this.base.currentTime;
    const targets: [AudioParam, Float32Array, (db: number) => number][] = [];
    const curves = this.curves;
    const params: [AudioParam, keyof NonNullable<typeof curves>, (db: number) => number][] = [
      [this.regionGain.gain, "gain_db", dbToGain],
      [this.regionLow.gain, "bass_db", (d) => d],
      [this.regionHigh.gain, "air_db", (d) => d],
    ];
    for (const [param, key, map] of params) {
      param.cancelScheduledValues(0);
      if (!curves) {
        param.setValueAtTime(map(0), now);
        continue;
      }
      targets.push([param, curves[key], map]);
    }
    for (const [param, curve, map] of targets) {
      const i0 = Math.min(curve.length - 1, Math.max(0, Math.round(t0 * CONTROL_RATE_HZ)));
      if (!this.playing || curve.length - i0 < 2) {
        param.setValueAtTime(map(curve[i0]), now);
        continue;
      }
      const slice = new Float32Array(curve.length - i0);
      let flat = true;
      for (let i = 0; i < slice.length; i++) {
        slice[i] = map(curve[i0 + i]);
        if (flat && slice[i] !== slice[0]) flat = false;
      }
      if (flat) {
        param.setValueAtTime(slice[0], now);
        continue;
      }
      param.setValueCurveAtTime(slice, now, (slice.length - 1) / CONTROL_RATE_HZ);
    }
  }

  // --- meters ----------------------------------------------------------------

  readMeters(): MeterReading {
    if (!this.ready) return { peakDb: -Infinity, lufsM: null };
    this.analyser.getFloatTimeDomainData(this.meterBuf);
    let peak = 0;
    for (let i = this.meterBuf.length - 2048; i < this.meterBuf.length; i++) {
      const a = Math.abs(this.meterBuf[i]);
      if (a > peak) peak = a;
    }
    this.kAnalyser.getFloatTimeDomainData(this.kBuf);
    let ms = 0;
    for (let i = 0; i < this.kBuf.length; i++) ms += this.kBuf[i] * this.kBuf[i];
    ms /= this.kBuf.length;
    // Analyser down-mixes to mono ((L+R)/2); ×2 approximates the BS.1770 channel sum.
    const lufs = ms > 1e-10 ? -0.691 + 10 * Math.log10(2 * ms) : null;
    return { peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, lufsM: this.playing ? lufs : null };
  }

  async setBaseUrl(url: string): Promise<void> {
    const t = this.base.currentTime;
    const wasPlaying = this.playing;
    this.pause();
    this.base.src = url;
    await new Promise<void>((resolve) => {
      this.base.addEventListener("loadedmetadata", () => resolve(), { once: true });
      this.base.addEventListener("error", () => resolve(), { once: true });
    });
    this.seek(t);
    if (wasPlaying) await this.play();
  }

  destroy(): void {
    this.ready = false;
    this.base.pause();
    this.original.pause();
    this.base.removeAttribute("src");
    this.original.removeAttribute("src");
    void this.ctx.close();
  }
}
