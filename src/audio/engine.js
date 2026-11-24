// The audio engine: one AudioContext, the mixing buses, the per-song effects chain
// (low-pass, tape wow, drive, reverb and echo sends), the vinyl crackle layer, and all the
// game's sound effects. It also owns the "heard clock": the AudioContext time that is coming
// out of the speakers right now, which the game uses for drawing and judging.

import * as S from './synth.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volumes = { music: 0.8, sfx: 0.8, hits: 0.6 };
    this.muted = false;
    this._clockOffset = null;
    this.lastSkid = -1;
    // Everything passes through the limiter, whose look-ahead delays the output by 6 ms;
    // the lo-fi tape-wow delay adds a little more to the music. Measured from rendered
    // audio and compensated in the game clock (see Play) and in calibration.
    this.outDelay = 0.006;
    this.musicDelay = 0.006;
  }

  /** Create the context. Must be called from a user gesture (browsers block audio until then). */
  init(existing = null) {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !existing) return;
    const ctx = existing || new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.A = { ctx, noise: S.makeNoiseBuffer(ctx) };

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.connect(this.limiter).connect(ctx.destination);

    // music: sessions -> chainIn -> lowpass -> wow -> drive -> musicVol -> master
    this.chainIn = ctx.createGain();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = Math.min(12000, ctx.sampleRate * 0.45);
    this.lowpass.Q.value = 0.5;
    this.wow = ctx.createDelay(0.05);
    this.wow.delayTime.value = 0;
    this.wowLfo = ctx.createOscillator();
    this.wowLfo.frequency.value = 0.55;
    this.wowDepth = ctx.createGain();
    this.wowDepth.gain.value = 0;
    this.wowLfo.connect(this.wowDepth).connect(this.wow.delayTime);
    this.wowLfo.start();
    this.drive = ctx.createWaveShaper();
    this.drive.curve = S.driveCurve(0.1);
    this.musicVol = ctx.createGain();
    this.chainIn.connect(this.lowpass).connect(this.wow).connect(this.drive).connect(this.musicVol).connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = S.makeImpulse(ctx, 1.8, 3.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.25;
    this.reverbSend.connect(this.reverb).connect(this.chainIn);

    this.delay = ctx.createDelay(1.5);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.38;
    this.delayLp = ctx.createBiquadFilter();
    this.delayLp.type = 'lowpass';
    this.delayLp.frequency.value = 2600;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0;
    this.delaySend.connect(this.delay).connect(this.delayLp).connect(this.delayFb).connect(this.delay);
    this.delayLp.connect(this.chainIn);

    this.sfxVol = ctx.createGain();
    this.sfxVol.connect(this.master);
    this.hitVol = ctx.createGain();
    this.hitVol.connect(this.master);

    // vinyl crackle, always running underneath
    this.crackleVol = ctx.createGain();
    this.crackleVol.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 250;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    this.crackle = ctx.createBufferSource();
    this.crackle.buffer = S.makeCrackleBuffer(ctx);
    this.crackle.loop = true;
    this.crackle.connect(hp).connect(lp).connect(this.crackleVol).connect(this.master);
    this.crackle.start();

    this.scratchBufs = {
      baby: S.makeScratchBuffer(ctx, 'baby'),
      chirp: S.makeScratchBuffer(ctx, 'chirp'),
      skid: S.makeScratchBuffer(ctx, 'skid'),
    };

    this.ready = true;
    this.applyVolumes();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /**
   * AudioContext time that was coming out of the speakers at performance time `perfMs`
   * (an event's timeStamp, or performance.now()). Uses getOutputTimestamp() where the browser
   * has it, so output latency is already taken into account; otherwise subtracts the reported
   * latency. The offset between the clocks is smoothed to remove jitter.
   */
  heardAt(perfMs = performance.now()) {
    const ctx = this.ctx;
    if (!ctx) return 0;
    let off = null;
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.performanceTime > 0 && ts.contextTime > 0) off = ts.contextTime - ts.performanceTime / 1000;
    }
    if (off === null) {
      const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
      off = ctx.currentTime - lat - performance.now() / 1000;
    }
    if (this._clockOffset === null || Math.abs(off - this._clockOffset) > 0.04) this._clockOffset = off;
    else this._clockOffset += (off - this._clockOffset) * 0.04;
    return this._clockOffset + perfMs / 1000;
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  setMuted(m) {
    this.muted = m;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, t, 0.02);
    this.musicVol.gain.setTargetAtTime(this.volumes.music, t, 0.02);
    this.sfxVol.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
    this.hitVol.gain.setTargetAtTime(this.volumes.hits * 0.8, t, 0.02);
  }

  setCrackle(level, ramp = 0.3) {
    if (!this.ready) return;
    this.crackleVol.gain.setTargetAtTime(level * 0.5 * this.volumes.sfx, this.ctx.currentTime, ramp);
  }

  /** Set the effects chain for a song's genre. */
  configureSong(song) {
    if (!this.ready) return;
    const fx = song.fx;
    const t = this.ctx.currentTime;
    this.lowpass.frequency.setTargetAtTime(Math.min(fx.lowpass || 12000, this.ctx.sampleRate * 0.45), t, 0.05);
    const wow = fx.wow || 0;
    this.wowDepth.gain.setValueAtTime(wow, t);
    this.wow.delayTime.setValueAtTime(wow ? wow * 1.3 : 0, t);
    this.musicDelay = this.outDelay + (wow ? wow * 1.3 : 0);
    this.drive.curve = S.driveCurve(fx.drive || 0);
    this.reverbSend.gain.setValueAtTime(fx.reverb ?? 0.2, t);
    this.delay.delayTime.setValueAtTime(Math.min(1.4, song.spb * 0.75), t);
    this.delaySend.gain.setValueAtTime(fx.delay || 0, t);
    this.currentSong = song;
  }

  /** A fresh set of part buses for one playthrough. kill() silences everything scheduled on it. */
  newSession() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.connect(this.chainIn);
    const mk = (rev, del) => {
      const g = ctx.createGain();
      g.connect(out);
      if (rev) {
        const s = ctx.createGain();
        s.gain.value = rev;
        g.connect(s).connect(this.reverbSend);
      }
      if (del) {
        const s = ctx.createGain();
        s.gain.value = del;
        g.connect(s).connect(this.delaySend);
      }
      return g;
    };
    const session = {
      out,
      drums: mk(0, 0),
      drumsWet: mk(0.35, 0.4),
      bass: mk(0, 0),
      keys: mk(0.8, 0.7),
      lead: mk(0.7, 1),
      alive: true,
      kill: (fade = 0.04) => {
        if (!session.alive) return;
        session.alive = false;
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + fade);
        setTimeout(() => out.disconnect(), (fade + 0.1) * 1000); // cleanup only, not timing
      },
    };
    return session;
  }

  /** Schedule one composed event at AudioContext time `when`. */
  playEvent(ev, when, song, session) {
    if (!this.ready || !session.alive) return;
    const A = this.A;
    const mix = song.mix;
    const kit = song.kit || {};
    const dv = ev.vel * mix.drums;
    switch (ev.inst) {
      case 'kick': S.kick(A, session.drums, when, dv, kit.kick); break;
      case 'snare': S.snare(A, session.drumsWet, when, dv * 0.9, kit.snare); break;
      case 'clap': S.clap(A, session.drumsWet, when, dv * 0.8, kit.clap); break;
      case 'rim': S.rim(A, session.drumsWet, when, dv, kit.rim); break;
      case 'hat': S.hat(A, session.drums, when, dv, kit.hat, false); break;
      case 'ohat': S.hat(A, session.drums, when, dv, kit.ohat || kit.hat, true); break;
      case 'shaker': S.shaker(A, session.drums, when, dv); break;
      case 'ride': S.ride(A, session.drums, when, dv); break;
      case 'perc': S.perc(A, session.drumsWet, when, dv, kit.perc); break;
      case 'crash': S.crash(A, session.drums, when, dv * 0.8); break;
      case 'bass': S.voice(A, session.bass, when, ev.dur, ev.note, ev.vel * mix.bass, song.presets.bass); break;
      case 'chord': {
        const k = (ev.vel * mix.keys) / Math.sqrt(ev.notes.length);
        for (const n of ev.notes) S.voice(A, session.keys, when, ev.dur, n, k, song.presets.keys);
        break;
      }
      case 'lead': S.voice(A, session.lead, when, ev.dur, ev.note, ev.vel * mix.lead, song.presets.lead); break;
      default: break; // scratch cues are silent: the player performs them
    }
  }

  /** Briefly chop the music like a skipping record. */
  stutter(session, when, spb) {
    if (!this.ready || !session?.alive) return;
    const g = session.out.gain;
    const step = spb / 4;
    g.cancelScheduledValues(when);
    g.setValueAtTime(1, when);
    for (let i = 0; i < 6; i++) {
      g.setValueAtTime(i % 2 ? 1 : 0.05, when + i * step * 0.5);
    }
    g.setValueAtTime(1, when + 3 * step);
  }

  // ---------------------------------------------------------------- sound effects

  _buf(name, when, gain, rate = 1, dest = this.sfxVol) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.scratchBufs[name];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(when);
  }

  /** A note hit: a small woody tick, pitched per groove. */
  hit(lane, judgement, when = this.now) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const f = [1250, 1650, 2100][lane] || 1500;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 1.25, when);
    o.frequency.exponentialRampToValueAtTime(f, when + 0.015);
    const g = ctx.createGain();
    const v = judgement === 'perfect' ? 0.35 : 0.25;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(v, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g).connect(this.hitVol);
    o.start(when);
    o.stop(when + 0.07);
  }

  /** The player's scratch on a scratch note. */
  scratch(good = true, when = this.now) {
    if (!this.ready) return;
    this._buf(good ? 'baby' : 'chirp', when, 0.9, good ? 1 : 1.2, this.hitVol);
  }

  /** The miss: a needle dragged across the record. Throttled so a burst of misses isn't a wall of noise. */
  miss(when = this.now) {
    if (!this.ready) return;
    if (when - this.lastSkid < 0.22) return;
    const soft = when - this.lastSkid < 0.8;
    this.lastSkid = when;
    this._buf('skid', when, soft ? 0.35 : 0.6, 0.9 + Math.random() * 0.25);
  }

  /** Count-in / calibration click. */
  click(when, accent = false, dest = this.sfxVol) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = accent ? 1900 : 1350;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.42, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    o.connect(g).connect(dest);
    o.start(when);
    o.stop(when + 0.08);
  }

  /** Low thump: the needle landing, a skip, a rank stamp. */
  thump(when = this.now, gain = 0.7, freq = 70) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2, when);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, when + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.25);
    o.connect(g).connect(this.sfxVol);
    o.start(when);
    o.stop(when + 0.3);
    const n = ctx.createBufferSource();
    n.buffer = this.A.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(gain * 0.5, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    n.connect(lp).connect(ng).connect(this.sfxVol);
    n.start(when, Math.random(), 0.15);
  }

  needleDrop(when = this.now) {
    this.thump(when, 0.55, 60);
    if (!this.ready) return;
    const ctx = this.ctx;
    const g = this.crackleVol.gain;
    g.setValueAtTime(g.value, when);
    g.linearRampToValueAtTime(0.5 * this.volumes.sfx, when + 0.02);
    g.setTargetAtTime(0.18 * this.volumes.sfx, when + 0.1, 0.4);
    void ctx;
  }

  /** Paper swish for sleeves sliding. */
  swish(when = this.now, up = true) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.A.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(up ? 900 : 3200, when);
    bp.frequency.exponentialRampToValueAtTime(up ? 3200 : 900, when + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.25, when + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    n.connect(bp).connect(g).connect(this.sfxVol);
    n.start(when, Math.random(), 0.35);
  }

  /** UI tick for buttons. */
  tick(when = this.now) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.06, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.025);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    o.connect(f).connect(g).connect(this.sfxVol);
    o.start(when);
    o.stop(when + 0.04);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') return this.ctx.suspend();
    return Promise.resolve();
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume();
    return Promise.resolve();
  }
}
