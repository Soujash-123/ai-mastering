/* Mastering Table dynamics (AudioWorklet).
 *
 * Mirrors backend/studio/render.py so the live preview matches the committed render:
 *  - mode "comp":  stereo-linked feed-forward compressor; envelope recurrence is
 *    identical to mastering/envelope.py:envelope_follower, soft-knee gain computer
 *    identical to studio/render.py:comp_gain_db.
 *  - mode "limit": lookahead brickwall limiter identical to
 *    studio/render.py:brickwall_limit (sliding min over 2L+1, box average over L,
 *    one-pole release on gain reduction). Latency = L + floor((L-1)/2) samples.
 * Parameters are k-rate AudioParams so knob moves apply on the next 128-sample block.
 */

function onePole(ms, sr, minMs) {
  return Math.exp(-1 / (Math.max(ms, minMs) * 1e-3 * sr));
}

class StudioDynamics extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "enabled", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "threshold", defaultValue: -13.2, minValue: -60, maxValue: 0, automationRate: "k-rate" },
      { name: "ratio", defaultValue: 2, minValue: 1, maxValue: 20, automationRate: "k-rate" },
      { name: "knee", defaultValue: 6, minValue: 0, maxValue: 24, automationRate: "k-rate" },
      { name: "attack", defaultValue: 20, minValue: 0.1, maxValue: 1000, automationRate: "k-rate" },
      { name: "release", defaultValue: 200, minValue: 1, maxValue: 2000, automationRate: "k-rate" },
      { name: "makeup", defaultValue: 0, minValue: -24, maxValue: 24, automationRate: "k-rate" },
      { name: "mix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "ceiling", defaultValue: 0.8590, minValue: 0.01, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor(options) {
    super();
    this.mode = (options.processorOptions && options.processorOptions.mode) || "comp";
    this.env = 0;
    this.grEnv = 0;
    this.gr = 0;
    if (this.mode === "limit") {
      const L = Math.max(1, Math.floor(0.005 * sampleRate));
      this.L = L;
      this.D = L + Math.floor((L - 1) / 2);
      this.reqSize = 2 * L + 1;
      this.req = new Float64Array(this.reqSize).fill(1);
      this.reqPos = 0;
      this.box = new Float64Array(L).fill(1);
      this.boxPos = 0;
      this.boxSum = L;
      this.delaySize = this.D + 1;
      this.dl = new Float32Array(this.delaySize);
      this.dr = new Float32Array(this.delaySize);
      this.dPos = 0;
    }
    this.port.onmessage = (e) => {
      if (e.data === "reset") this.reset();
    };
  }

  reset() {
    this.env = 0;
    this.grEnv = 0;
    this.gr = 0;
    if (this.mode === "limit") {
      this.req.fill(1);
      this.box.fill(1);
      this.boxSum = this.L;
      this.dl.fill(0);
      this.dr.fill(0);
    }
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output[1] || output[0];
    if (!input || input.length === 0) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }
    const inL = input[0];
    const inR = input[1] || input[0];
    if (this.mode === "limit") this.limit(inL, inR, outL, outR, params);
    else this.comp(inL, inR, outL, outR, params);
    return true;
  }

  comp(inL, inR, outL, outR, p) {
    const n = inL.length;
    if (p.enabled[0] < 0.5) {
      outL.set(inL);
      if (outR !== outL) outR.set(inR);
      return;
    }
    const thr = p.threshold[0];
    const ratio = p.ratio[0];
    const knee = p.knee[0];
    const att = onePole(p.attack[0], sampleRate, 0.1);
    const rel = onePole(p.release[0], sampleRate, 1);
    const makeup = p.makeup[0];
    const mix = p.mix[0];
    const slope = 1 / ratio - 1;
    let env = this.env;
    let minGain = 1;
    for (let i = 0; i < n; i++) {
      const l = inL[i];
      const r = inR[i];
      const det = Math.max(Math.abs(l), Math.abs(r));
      const c = det > env ? att : rel;
      env = (1 - c) * det + c * env;
      const envDb = 20 * Math.log10(env + 1e-9);
      const over = envDb - thr;
      let gr = 0;
      if (2 * over < -knee) gr = 0;
      else if (2 * Math.abs(over) <= knee) gr = (slope * (over + knee / 2) ** 2) / (2 * knee);
      else gr = slope * over;
      const g = Math.pow(10, (gr + makeup) / 20);
      const k = 1 - mix + mix * g;
      outL[i] = l * k;
      outR[i] = r * k;
      const gOnly = Math.pow(10, gr / 20);
      if (gOnly < minGain) minGain = gOnly;
    }
    this.env = env;
    this.gr = minGain;
  }

  limit(inL, inR, outL, outR, p) {
    const n = inL.length;
    const ceil = p.ceiling[0];
    const rel = onePole(p.release[0], sampleRate, 1);
    const att = onePole(0.1, sampleRate, 0.1);
    const { L, reqSize, delaySize, D } = this;
    let grEnv = this.grEnv;
    let minGain = 1;
    for (let i = 0; i < n; i++) {
      const l = inL[i];
      const r = inR[i];
      // delay line
      this.dl[this.dPos] = l;
      this.dr[this.dPos] = r;
      // required gain for the newest sample
      const peak = Math.max(Math.abs(l), Math.abs(r));
      this.req[this.reqPos] = Math.min(1, ceil / Math.max(peak, 1e-12));
      // gmin over the last 2L+1 requirements (centered window around t-L)
      let gmin = 1;
      for (let k = 0; k < reqSize; k++) {
        const v = this.req[k];
        if (v < gmin) gmin = v;
      }
      // box average over L of gmin
      this.boxSum += gmin - this.box[this.boxPos];
      this.box[this.boxPos] = gmin;
      this.boxPos = (this.boxPos + 1) % L;
      // requirement at the output index t-D
      const reqOut = this.req[(this.reqPos - D + reqSize * 4) % reqSize];
      const gb = Math.min(this.boxSum / L, reqOut);
      const gr = 1 - gb;
      const c = gr > grEnv ? att : rel;
      grEnv = (1 - c) * gr + c * grEnv;
      const gain = 1 - Math.max(grEnv, gr);
      const outPos = (this.dPos + 1) % delaySize; // oldest sample = t-D
      outL[i] = this.dl[outPos] * gain;
      outR[i] = this.dr[outPos] * gain;
      if (gain < minGain) minGain = gain;
      this.reqPos = (this.reqPos + 1) % reqSize;
      this.dPos = outPos;
    }
    this.grEnv = grEnv;
    this.gr = minGain;
  }
}

registerProcessor("studio-dynamics", StudioDynamics);
