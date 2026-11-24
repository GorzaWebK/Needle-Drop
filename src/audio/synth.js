// Instruments, all synthesised with Web Audio nodes. Every function takes the shared audio
// kit `A` ({ ctx, noise }), a destination node, a start time on the AudioContext clock and
// its own parameters. Nothing here keeps state, so notes can be scheduled freely ahead.

export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

const curveCache = new Map();
export function driveCurve(amount) {
  const k = Math.round(amount * 100) / 100;
  if (curveCache.has(k)) return curveCache.get(k);
  const n = 1024;
  const c = new Float32Array(n);
  const d = 1 + k * 6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * d) / Math.tanh(d);
  }
  curveCache.set(k, c);
  return c;
}

function noiseSource(A, t, dur) {
  const src = A.ctx.createBufferSource();
  src.buffer = A.noise;
  const offset = Math.random() * (A.noise.duration - dur - 0.05);
  src.start(t, Math.max(0, offset), dur + 0.05);
  return src;
}

function env(gainParam, t, peak, attack, decay) {
  gainParam.setValueAtTime(0.0001, t);
  gainParam.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  gainParam.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function filt(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

// ---------------------------------------------------------------- drums

export function kick(A, out, t, vel, p = {}) {
  const { ctx } = A;
  const tune = p.tune || 50;
  const decay = p.decay || 0.4;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(tune * 3.4, t);
  o.frequency.exponentialRampToValueAtTime(tune * 1.4, t + 0.025);
  o.frequency.exponentialRampToValueAtTime(tune, t + 0.09);
  env(g.gain, t, vel * 1.1, 0.003, decay);
  o.connect(g);
  if (p.drive) {
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve(p.drive);
    g.connect(sh).connect(out);
  } else g.connect(out);
  o.start(t);
  o.stop(t + decay + 0.05);
  const click = p.click ?? 0.3;
  if (click > 0) {
    const n = noiseSource(A, t, 0.02);
    const hp = filt(ctx, 'highpass', 1800);
    const ng = ctx.createGain();
    env(ng.gain, t, vel * click * 0.5, 0.001, 0.012);
    n.connect(hp).connect(ng).connect(out);
  }
}

export function snare(A, out, t, vel, p = {}) {
  const { ctx } = A;
  const tone = p.tone || 200;
  const decay = p.decay || 0.18;
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(tone * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(tone, t + 0.03);
  env(og.gain, t, vel * 0.55, 0.002, 0.09);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.15);
  const n = noiseSource(A, t, decay + 0.05);
  const hp = filt(ctx, 'highpass', 1400);
  const lp = filt(ctx, 'lowpass', p.lp || 8000);
  const ng = ctx.createGain();
  env(ng.gain, t, vel * (p.noise ?? 0.75) * 0.75, 0.002, decay);
  n.connect(hp).connect(lp).connect(ng);
  if (p.drive) {
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve(p.drive);
    ng.connect(sh).connect(out);
  } else ng.connect(out);
}

export function clap(A, out, t, vel, p = {}) {
  const { ctx } = A;
  const decay = p.decay || 0.2;
  const n = noiseSource(A, t, decay + 0.06);
  const bp = filt(ctx, 'bandpass', 1150, 1.1);
  const g = ctx.createGain();
  const peak = vel * 0.9;
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 3; i++) {
    const s = t + i * 0.011;
    g.gain.setValueAtTime(peak, s);
    g.gain.exponentialRampToValueAtTime(peak * 0.15, s + 0.009);
  }
  g.gain.setValueAtTime(peak * 0.8, t + 0.034);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.034 + decay);
  n.connect(bp).connect(g).connect(out);
}

export function hat(A, out, t, vel, p = {}, open = false) {
  const { ctx } = A;
  const decay = open ? (p.decay ? p.decay * 5 : 0.18) : p.decay || 0.03;
  const g = ctx.createGain();
  const hp = filt(ctx, 'highpass', p.hp || 7500);
  env(g.gain, t, vel * (open ? 0.32 : 0.38), 0.001, decay);
  if (p.metal) {
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    for (const r of ratios) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 40 * r * 4;
      const og = ctx.createGain();
      og.gain.value = 0.18;
      o.connect(og).connect(hp);
      o.start(t);
      o.stop(t + decay + 0.03);
    }
  } else {
    noiseSource(A, t, decay + 0.03).connect(hp);
  }
  hp.connect(g).connect(out);
}

export function shaker(A, out, t, vel) {
  const { ctx } = A;
  const n = noiseSource(A, t, 0.06);
  const bp = filt(ctx, 'bandpass', 7000, 1.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(bp).connect(g).connect(out);
}

export function ride(A, out, t, vel) {
  const { ctx } = A;
  const n = noiseSource(A, t, 0.6);
  const bp = filt(ctx, 'bandpass', 6200, 2);
  const g = ctx.createGain();
  env(g.gain, t, vel * 0.25, 0.001, 0.5);
  n.connect(bp).connect(g).connect(out);
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = 3150;
  const og = ctx.createGain();
  env(og.gain, t, vel * 0.03, 0.001, 0.35);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + 0.4);
}

export function crash(A, out, t, vel) {
  const { ctx } = A;
  const n = noiseSource(A, t, 1.6);
  const hp = filt(ctx, 'highpass', 3800);
  const g = ctx.createGain();
  env(g.gain, t, vel * 0.3, 0.002, 1.4);
  n.connect(hp).connect(g).connect(out);
}

export function rim(A, out, t, vel, p = {}) {
  const { ctx } = A;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = p.tone || 900;
  const g = ctx.createGain();
  env(g.gain, t, vel * 0.5, 0.001, 0.04);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.08);
  const n = noiseSource(A, t, 0.02);
  const bp = filt(ctx, 'bandpass', 2400, 2);
  const ng = ctx.createGain();
  env(ng.gain, t, vel * 0.4, 0.001, 0.015);
  n.connect(bp).connect(ng).connect(out);
}

export function perc(A, out, t, vel, p = {}) {
  const { ctx } = A;
  const tone = p.tone || 320;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(tone * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(tone, t + 0.02);
  const g = ctx.createGain();
  env(g.gain, t, vel * 0.45, 0.002, 0.16);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.22);
}

// ---------------------------------------------------------------- melodic voices

export const PRESETS = {
  // bass
  round: { osc: [{ type: 'triangle' }, { type: 'sine', oct: -1, gain: 0.7 }], filter: { type: 'lowpass', freq: 700, q: 1, env: 700, decay: 0.2 }, amp: { a: 0.005, d: 0.3, s: 0.7, r: 0.08 }, gain: 0.6 },
  sub: { osc: [{ type: 'sine' }, { type: 'triangle', gain: 0.22 }], amp: { a: 0.004, d: 0.1, s: 0.92, r: 0.06 }, gain: 0.75 },
  dub: { osc: [{ type: 'sine' }, { type: 'triangle', gain: 0.45 }], filter: { type: 'lowpass', freq: 520, q: 1.5, env: 200, decay: 0.2 }, amp: { a: 0.012, d: 0.3, s: 0.85, r: 0.1 }, gain: 0.8 },
  slap: { osc: [{ type: 'sawtooth' }, { type: 'square', gain: 0.3, detune: 5 }], filter: { type: 'lowpass', freq: 380, q: 4, env: 2600, decay: 0.08 }, amp: { a: 0.002, d: 0.18, s: 0.5, r: 0.05 }, gain: 0.42 },
  pluckbass: { osc: [{ type: 'sawtooth' }, { type: 'sine', oct: -1, gain: 0.5 }], filter: { type: 'lowpass', freq: 300, q: 2.5, env: 1600, decay: 0.12 }, amp: { a: 0.003, d: 0.2, s: 0.55, r: 0.05 }, gain: 0.45 },
  fmbass: { osc: [{ type: 'sine' }], fm: { ratio: 1, index: 3.2, decay: 0.14 }, amp: { a: 0.002, d: 0.15, s: 0.6, r: 0.05 }, gain: 0.6 },
  acid: { osc: [{ type: 'sawtooth' }], filter: { type: 'lowpass', freq: 260, q: 13, env: 2800, decay: 0.15, velEnv: true }, amp: { a: 0.002, d: 0.1, s: 0.8, r: 0.04 }, gain: 0.32 },
  reese: { osc: [{ type: 'sawtooth', detune: -16 }, { type: 'sawtooth', detune: 16 }, { type: 'sine', oct: -1, gain: 0.7 }], filter: { type: 'lowpass', freq: 520, q: 2, lfo: { rate: 0.35, depth: 260 } }, amp: { a: 0.02, d: 0.2, s: 0.9, r: 0.12 }, gain: 0.3 },
  // keys
  rhodes: { osc: [{ type: 'sine' }], fm: { ratio: 1, index: 1.5, decay: 0.7 }, amp: { a: 0.004, d: 1.4, s: 0.4, r: 0.3 }, tremolo: { rate: 4.2, depth: 0.25 }, gain: 0.24 },
  piano: { osc: [{ type: 'triangle' }, { type: 'sine', oct: 1, gain: 0.25 }], filter: { type: 'lowpass', freq: 2200, q: 0.7, env: 1500, decay: 0.3 }, amp: { a: 0.003, d: 0.8, s: 0.2, r: 0.2 }, gain: 0.26 },
  organ: { osc: [{ type: 'square' }, { type: 'sine', oct: 1, gain: 0.5 }, { type: 'sine', oct: -1, gain: 0.5 }], filter: { type: 'lowpass', freq: 2400, q: 0.8 }, amp: { a: 0.004, d: 0.12, s: 0.6, r: 0.05 }, gain: 0.25 },
  skank: { osc: [{ type: 'square' }, { type: 'sine', oct: 1, gain: 0.5 }], filter: { type: 'bandpass', freq: 1500, q: 1.2 }, amp: { a: 0.002, d: 0.09, s: 0.25, r: 0.04 }, gain: 1.0 },
  strings: { osc: [{ type: 'sawtooth', detune: -9 }, { type: 'sawtooth', detune: 9 }], filter: { type: 'lowpass', freq: 3000, q: 0.6 }, amp: { a: 0.22, d: 0.5, s: 0.8, r: 0.4 }, vibrato: { rate: 5, depth: 6, delay: 0.3 }, gain: 0.09 },
  pad: { osc: [{ type: 'sawtooth', detune: -11 }, { type: 'sawtooth', detune: 11 }, { type: 'triangle', oct: 1, gain: 0.4 }], filter: { type: 'lowpass', freq: 1500, q: 0.7 }, amp: { a: 0.45, d: 0.6, s: 0.8, r: 0.6 }, gain: 0.08 },
  clav: { osc: [{ type: 'square' }, { type: 'sawtooth', gain: 0.4 }], filter: { type: 'bandpass', freq: 1500, q: 2.5, env: 900, decay: 0.05 }, amp: { a: 0.001, d: 0.1, s: 0.05, r: 0.03 }, gain: 0.7 },
  stab: { osc: [{ type: 'sawtooth', detune: -10 }, { type: 'sawtooth', detune: 10 }], filter: { type: 'lowpass', freq: 900, q: 4, env: 3600, decay: 0.12 }, amp: { a: 0.002, d: 0.2, s: 0.25, r: 0.06 }, gain: 0.25 },
  ravepiano: { osc: [{ type: 'square' }, { type: 'triangle', oct: 1, gain: 0.5 }], filter: { type: 'lowpass', freq: 3200, q: 0.8, env: 2500, decay: 0.2 }, amp: { a: 0.001, d: 0.5, s: 0.12, r: 0.1 }, gain: 0.13 },
  // leads
  vibes: { osc: [{ type: 'sine' }], fm: { ratio: 3.5, index: 1.1, decay: 0.25 }, amp: { a: 0.002, d: 1.0, s: 0.2, r: 0.35 }, tremolo: { rate: 5.2, depth: 0.3 }, gain: 0.3 },
  horn: { osc: [{ type: 'sawtooth' }, { type: 'sawtooth', detune: 7 }], filter: { type: 'lowpass', freq: 800, q: 1, env: 2000, decay: 0.1, swell: true }, amp: { a: 0.025, d: 0.2, s: 0.75, r: 0.08 }, gain: 0.15 },
  melodica: { osc: [{ type: 'square' }, { type: 'sawtooth', gain: 0.4 }], filter: { type: 'lowpass', freq: 2200, q: 0.7 }, vibrato: { rate: 5, depth: 7, delay: 0.15 }, amp: { a: 0.03, d: 0.1, s: 0.8, r: 0.08 }, gain: 0.12 },
  brightlead: { osc: [{ type: 'sawtooth', detune: -6 }, { type: 'sawtooth', detune: 6 }], filter: { type: 'lowpass', freq: 4200, q: 0.8 }, vibrato: { rate: 5.5, depth: 8, delay: 0.2 }, amp: { a: 0.01, d: 0.2, s: 0.7, r: 0.12 }, gain: 0.1 },
  pluck: { osc: [{ type: 'square' }, { type: 'sawtooth', detune: 7, gain: 0.5 }], filter: { type: 'lowpass', freq: 800, q: 3, env: 4200, decay: 0.12 }, amp: { a: 0.001, d: 0.32, s: 0.15, r: 0.1 }, gain: 0.16 },
  vox: { osc: [{ type: 'sawtooth' }], formants: [800, 1250], vibrato: { rate: 5.5, depth: 10, delay: 0.1 }, amp: { a: 0.01, d: 0.15, s: 0.65, r: 0.08 }, gain: 0.55 },
  square: { osc: [{ type: 'square' }, { type: 'square', oct: -1, gain: 0.3 }], filter: { type: 'lowpass', freq: 3400, q: 0.7 }, amp: { a: 0.005, d: 0.2, s: 0.6, r: 0.05 }, gain: 0.1 },
  hoover: { osc: [{ type: 'sawtooth', detune: -22 }, { type: 'sawtooth' }, { type: 'sawtooth', detune: 22 }, { type: 'sawtooth', oct: -1, gain: 0.6 }], glide: 0.09, filter: { type: 'lowpass', freq: 2400, q: 1 }, amp: { a: 0.03, d: 0.2, s: 0.8, r: 0.15 }, gain: 0.07 },
  flute: { osc: [{ type: 'sine' }, { type: 'triangle', oct: 1, gain: 0.15 }], vibrato: { rate: 5.5, depth: 9, delay: 0.18 }, filter: { type: 'lowpass', freq: 3000, q: 0.6 }, amp: { a: 0.06, d: 0.2, s: 0.8, r: 0.12 }, gain: 0.34 },
  // effects
  click: { osc: [{ type: 'sine' }], amp: { a: 0.001, d: 0.04, s: 0, r: 0.02 }, gain: 0.6 },
};

/** Play one note of a preset. */
export function voice(A, out, t, dur, midi, vel, presetName) {
  const { ctx } = A;
  const p = PRESETS[presetName] || PRESETS.pluck;
  const f = mtof(midi);
  const amp = ctx.createGain();
  let head = amp;
  let tail = amp;
  const end = t + Math.max(dur, p.amp.a + 0.01);
  const stopAt = end + p.amp.r * 3 + 0.05;

  // filter or formant bank in front of the amp
  let input;
  if (p.formants) {
    input = ctx.createGain();
    for (const ff of p.formants) {
      const bp = filt(ctx, 'bandpass', ff, 6);
      input.connect(bp).connect(amp);
    }
  } else if (p.filter) {
    const fl = filt(ctx, p.filter.type, p.filter.freq, p.filter.q);
    const base = p.filter.freq;
    const envAmt = (p.filter.env || 0) * (p.filter.velEnv ? vel * 1.4 : 1);
    if (envAmt) {
      if (p.filter.swell) {
        fl.frequency.setValueAtTime(base, t);
        fl.frequency.linearRampToValueAtTime(base + envAmt, t + 0.06);
        fl.frequency.setTargetAtTime(base + envAmt * 0.4, t + 0.06, p.filter.decay);
      } else {
        fl.frequency.setValueAtTime(base + envAmt, t);
        fl.frequency.setTargetAtTime(base, t, p.filter.decay / 2);
      }
    }
    if (p.filter.lfo) {
      const l = ctx.createOscillator();
      l.frequency.value = p.filter.lfo.rate;
      const lg = ctx.createGain();
      lg.gain.value = p.filter.lfo.depth;
      l.connect(lg).connect(fl.frequency);
      l.start(t);
      l.stop(stopAt);
    }
    fl.connect(amp);
    input = fl;
  } else input = amp;

  // tremolo after the amp
  if (p.tremolo) {
    const trem = ctx.createGain();
    trem.gain.value = 1 - p.tremolo.depth / 2;
    const l = ctx.createOscillator();
    l.frequency.value = p.tremolo.rate;
    const lg = ctx.createGain();
    lg.gain.value = p.tremolo.depth / 2;
    l.connect(lg).connect(trem.gain);
    l.start(t);
    l.stop(stopAt);
    amp.connect(trem);
    tail = trem;
  }
  tail.connect(out);

  let vib = null;
  if (p.vibrato) {
    vib = ctx.createOscillator();
    vib.frequency.value = p.vibrato.rate;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(p.vibrato.depth, t + (p.vibrato.delay || 0) + 0.15);
    vib.connect(vg);
    vib.start(t);
    vib.stop(stopAt);
    vib = vg;
  }

  let fmGain = null;
  if (p.fm) {
    const mod = ctx.createOscillator();
    mod.frequency.value = f * p.fm.ratio;
    fmGain = ctx.createGain();
    const idx = p.fm.index * f;
    fmGain.gain.setValueAtTime(idx, t);
    fmGain.gain.setTargetAtTime(idx * 0.15, t, p.fm.decay / 2);
    mod.connect(fmGain);
    mod.start(t);
    mod.stop(stopAt);
  }

  for (const o of p.osc) {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    const of = f * 2 ** (o.oct || 0);
    if (p.glide) {
      osc.frequency.setValueAtTime(of * 0.84, t);
      osc.frequency.exponentialRampToValueAtTime(of, t + p.glide);
    } else osc.frequency.value = of;
    osc.detune.value = o.detune || 0;
    if (vib) vib.connect(osc.detune);
    if (fmGain) fmGain.connect(osc.frequency);
    if (o.gain !== undefined && o.gain !== 1) {
      const og = ctx.createGain();
      og.gain.value = o.gain;
      osc.connect(og).connect(input);
    } else osc.connect(input);
    osc.start(t);
    osc.stop(stopAt);
  }

  // ADSR
  const peak = vel * p.gain;
  const { a, d, s, r } = p.amp;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + a);
  amp.gain.setTargetAtTime(Math.max(0.00001, peak * s), t + a, Math.max(0.005, d / 3));
  amp.gain.setTargetAtTime(0, end, Math.max(0.005, r / 3));
  void head;
}

// ---------------------------------------------------------------- generated sample buffers

/** Hiss and pops: the vinyl surface noise layer (loops seamlessly). */
export function makeCrackleBuffer(ctx, seconds = 6) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += (Math.random() * 2 - 1 - lp) * 0.25;
    d[i] = lp * 0.035;
  }
  const pops = Math.floor(seconds * 9);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(Math.random() * (len - 400));
    const big = Math.random() < 0.12;
    const amp = (big ? 0.5 : 0.12) * (0.4 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1);
    const ring = big ? 140 : 40;
    for (let k = 0; k < ring; k++) d[at + k] += amp * Math.exp(-k / (ring / 5)) * (k % 2 ? -0.6 : 1);
  }
  // fade the loop seam
  const fade = Math.floor(sr * 0.02);
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    d[i] = d[i] * w + d[len - fade + i] * (1 - w);
  }
  return buf;
}

/** An "aah" source sample (additive formant tone with a little breath) for the scratches. */
function makeScratchSource(sr) {
  const len = Math.floor(sr * 0.9);
  const src = new Float32Array(len);
  const f0 = 170;
  const harmonics = [];
  for (let k = 1; k <= 28; k++) {
    const fk = f0 * k;
    const w = Math.exp(-(((fk - 720) / 260) ** 2)) + 0.75 * Math.exp(-(((fk - 1180) / 320) ** 2)) + 0.12 + 0.2 * Math.exp(-(((fk - 2600) / 500) ** 2));
    harmonics.push([fk, w / k ** 0.55, Math.random() * 6.28]);
  }
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let s = 0;
    for (const [fk, a, ph] of harmonics) s += a * Math.sin(6.2832 * fk * t + ph);
    src[i] = s * 0.12 + (Math.random() * 2 - 1) * 0.05;
  }
  return src;
}

/**
 * Turntable scratches: the source sample is read with a moving "hand" position, so pitch
 * follows the speed of the record just like a real scratch.
 *   kind: 'baby' (forward-back), 'chirp' (quick cut), 'skid' (the miss: a needle dragged across)
 */
export function makeScratchBuffer(ctx, kind) {
  const sr = ctx.sampleRate;
  const src = makeScratchSource(sr);
  const dur = kind === 'skid' ? 0.55 : kind === 'chirp' ? 0.16 : 0.26;
  const len = Math.floor(sr * dur);
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  let lastPos = 0.3;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const u = t / dur;
    let pos;
    let gate = 1;
    if (kind === 'baby') {
      const half = u < 0.5 ? u * 2 : (1 - u) * 2;
      pos = 0.25 + 0.17 * (1 - Math.cos(Math.PI * half)) / 2;
    } else if (kind === 'chirp') {
      pos = 0.25 + 0.15 * Math.sin(Math.PI * u);
      gate = u < 0.55 ? 1 : Math.max(0, 1 - (u - 0.55) * 6);
    } else {
      // skid: a fast drag back, a jerk forward, then the needle grinds to a stop
      const a = Math.min(1, u * 4);
      pos = 0.6 - 0.42 * (a * a) + (u > 0.3 ? 0.18 * Math.sin((u - 0.3) * 9) * (1 - u) : 0);
      gate = 1 - u * 0.6;
    }
    const speed = Math.abs(pos - lastPos) * sr;
    lastPos = pos;
    const idx = Math.max(0, Math.min(src.length - 2, pos * sr));
    const i0 = Math.floor(idx);
    const fr = idx - i0;
    let s = src[i0] * (1 - fr) + src[i0 + 1] * fr;
    const loud = Math.min(1, speed / 0.9);
    s *= loud;
    if (kind === 'skid') s += (Math.random() * 2 - 1) * 0.35 * loud * (1 - u) + (Math.random() < 0.004 ? (Math.random() - 0.5) * 1.2 : 0);
    const edge = Math.min(1, i / (sr * 0.004), (len - i) / (sr * 0.01));
    out[i] = s * gate * edge * 0.9;
  }
  return buf;
}

/** Short convolution reverb impulse (stereo, decaying noise). */
export function makeImpulse(ctx, seconds = 1.8, decay = 3) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

export function makeNoiseBuffer(ctx, seconds = 2) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
