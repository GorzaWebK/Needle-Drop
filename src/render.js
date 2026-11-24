// The turntable renderer (Canvas 2D). The record is seen from straight above and spins
// clockwise; notes are printed on its three grooves and ride round to the needle at
// 12 o'clock. Heavy things (background, record, label, sheen, note shapes, stamps) are
// pre-rendered into sprites on resize, so each frame is mostly drawImage calls.

import { makeCanvas, makeGrain, applyGrain, halftone, blobPoints, polyPoints, rectPoints, fillPoly, tracePoly, printText, stickerSprite } from './print.js';
import { makeRng } from './rng.js';
import { SCRATCH } from './chart.js';

export const ARC = (285 / 180) * Math.PI; // how far round the record a note travels on approach
const TAU = Math.PI * 2;
const SHAPES = ['circle', 'diamond', 'square'];

const ease = {
  outBack: (x) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2,
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = { reducedMotion: false, symbols: false };
    this.P = null;
    this.grain = makeGrain(256, 'paper');
    this.labelArt = null;
    this.labelInfo = null;
    this.keyLabels = ['F', 'J', 'K', 'SPACE'];
    this.fx = { particles: [], stamp: null, sub: null, shake: 0, pops: [0, 0, 0, 0], flash: [0, 0, 0, 0], skipFlash: 0, skipJolt: 0, comboPop: 0 };
    this.lastTime = 0;
    this.W = 1;
    this.H = 1;
    this.dpr = 1;
  }

  // ---------------------------------------------------------------- setup

  setPalette(P) {
    this.P = P;
    this.rebuild();
  }

  setOptions(o) {
    Object.assign(this.opts, o);
    this.rebuild();
  }

  setLabel(info, art) {
    this.labelInfo = info;
    this.labelArt = art;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const H = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    if (W === this.W && H === this.H && dpr === this.dpr && this.bg) return false;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.rebuild();
    return true;
  }

  get layout() {
    return this.L;
  }

  computeLayout() {
    const { W, H } = this;
    const portrait = H > W * 1.05;
    let R;
    let cx;
    let cy;
    if (portrait) {
      R = Math.min(W * 0.44, H * 0.31);
      cx = W / 2;
      cy = H * 0.47;
    } else {
      R = Math.min(H * 0.37, W * 0.28);
      cx = W / 2;
      cy = H * 0.51;
    }
    R = Math.max(R, 60);
    const laneR = [0.47, 0.655, 0.84].map((k) => k * R);
    const band = 0.165 * R;
    this.L = {
      W, H, portrait, R, cx, cy, laneR, band,
      labelR: 0.33 * R,
      zones: [(laneR[0] + laneR[1]) / 2, (laneR[1] + laneR[2]) / 2],
      pivot: { x: cx + R * 1.02, y: cy - R * 1.08 },
    };
  }

  rebuild() {
    if (!this.P) return;
    this.computeLayout();
    const { dpr } = this;
    const L = this.L;
    const P = this.P;
    const rng = makeRng('layers');

    // background: flood of ink, halftone towards the corners, grain
    const bw = Math.ceil(L.W * dpr);
    const bh = Math.ceil(L.H * dpr);
    this.bg = makeCanvas(bw, bh);
    const g = this.bg.getContext('2d');
    g.fillStyle = P.bg;
    g.fillRect(0, 0, bw, bh);
    const maxD = Math.hypot(bw, bh) / 2;
    // high contrast keeps the background clean so the HUD type stays crisp
    if (!P.high) halftone(g, 0, 0, bw, bh, (x, y) => ((Math.hypot(x - bw / 2, y - bh / 2) / maxD) ** 1.8) * 0.55, { cell: 11 * dpr, color: P.pinkDeep, angle: 0.4 });
    applyGrain(g, this.grain, 0, 0, bw, bh, P.high ? 0.35 : 1);

    // sunburst behind the record
    const sr = L.R * 1.55 * dpr;
    this.sun = makeCanvas(sr * 2, sr * 2);
    const sg = this.sun.getContext('2d');
    const rays = 18;
    const sunPts = blobPoints(sr, sr, sr * 0.97, rng, { n: 72, wobble: 0.012 });
    sg.save();
    tracePoly(sg, sunPts);
    sg.clip();
    sg.fillStyle = P.yellow;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * TAU;
      const a1 = a0 + TAU / rays / 2;
      sg.beginPath();
      sg.moveTo(sr, sr);
      sg.lineTo(sr + Math.cos(a0) * sr * 1.5, sr + Math.sin(a0) * sr * 1.5);
      sg.lineTo(sr + Math.cos(a1) * sr * 1.5, sr + Math.sin(a1) * sr * 1.5);
      sg.fill();
    }
    sg.restore();
    applyGrain(sg, this.grain, 0, 0, sr * 2, sr * 2, 0.6);

    // the record itself
    const rr = L.R * dpr;
    const pad = 4 * dpr;
    this.rec = makeCanvas((rr + pad) * 2, (rr + pad) * 2);
    const rg = this.rec.getContext('2d');
    const c0 = rr + pad;
    rg.fillStyle = P.record;
    rg.beginPath();
    rg.arc(c0, c0, rr, 0, TAU);
    rg.fill();
    // micro grooves
    rg.strokeStyle = P.groove;
    rg.lineWidth = Math.max(1, 0.6 * dpr);
    rg.globalAlpha = 0.5;
    for (let r = L.labelR * dpr + 6 * dpr; r < rr - 5 * dpr; r += 2.2 * dpr) {
      rg.beginPath();
      rg.arc(c0, c0, r, 0, TAU);
      rg.stroke();
    }
    rg.globalAlpha = 1;
    // the three playing grooves: lighter bands with a fine dot texture
    for (let i = 0; i < 3; i++) {
      const r = L.laneR[i] * dpr;
      const bwid = L.band * dpr;
      rg.save();
      rg.beginPath();
      rg.arc(c0, c0, r + bwid / 2, 0, TAU);
      rg.arc(c0, c0, r - bwid / 2, 0, TAU, true);
      rg.fillStyle = P.groove;
      rg.globalAlpha = 0.75;
      rg.fill();
      rg.clip('evenodd');
      rg.globalAlpha = P.high ? 0.25 : 0.32;
      halftone(rg, c0 - r - bwid, c0 - r - bwid, (r + bwid) * 2, (r + bwid) * 2, () => 0.35, { cell: 5 * dpr, color: [P.yellow, P.pink, P.paper][i], angle: 0.3 + i });
      rg.restore();
    }
    rg.strokeStyle = P.paper;
    rg.globalAlpha = 0.25;
    rg.lineWidth = 1.5 * dpr;
    rg.beginPath();
    rg.arc(c0, c0, rr - 2 * dpr, 0, TAU);
    rg.stroke();
    rg.globalAlpha = 1;
    // printed rim marks so you can see it spin
    rg.fillStyle = P.paper;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      rg.globalAlpha = i % 6 === 0 ? 0.55 : 0.22;
      rg.beginPath();
      rg.arc(c0 + Math.cos(a) * (rr - 7 * dpr), c0 + Math.sin(a) * (rr - 7 * dpr), (i % 6 === 0 ? 2.4 : 1.4) * dpr, 0, TAU);
      rg.fill();
    }
    rg.globalAlpha = 1;
    rg.save();
    rg.beginPath();
    rg.arc(c0, c0, rr, 0, TAU);
    rg.clip();
    applyGrain(rg, this.grain, 0, 0, c0 * 2, c0 * 2, 0.7);
    rg.restore();

    // light catching the vinyl: two static halftone wedges (they stay put while the record turns)
    this.sheen = makeCanvas((rr + pad) * 2, (rr + pad) * 2);
    const hg = this.sheen.getContext('2d');
    for (const a of [-2.3, 0.84]) {
      hg.save();
      hg.beginPath();
      hg.moveTo(c0, c0);
      hg.arc(c0, c0, rr - 3 * dpr, a - 0.32, a + 0.32);
      hg.closePath();
      hg.arc(c0, c0, L.labelR * dpr + 4 * dpr, 0, TAU, true);
      hg.clip('evenodd');
      halftone(hg, 0, 0, c0 * 2, c0 * 2, (x, y) => {
        const ang = Math.atan2(y - c0, x - c0);
        const d = Math.abs(((ang - a + Math.PI * 3) % TAU) - Math.PI);
        return (1 - d / 0.32) * 0.3;
      }, { cell: 7 * dpr, color: P.paper, angle: 0.8 });
      hg.restore();
    }

    // notes: three hand-cut variants per groove, so they "boil" like stop-motion stickers
    const nsz = L.band * 1.08 * dpr;
    this.noteSprites = [0, 1, 2].map((lane) => [0, 1, 2].map((v) => this.makeNoteSprite(lane, v, nsz)));
    this.ghostSprites = [0, 1, 2].map((lane) => this.makeNoteSprite(lane, 0, nsz, true));
    this.scratchSprites = [0, 1, 2].map((v) => this.makeScratchSprite(v));
    this.dotPattern = this.makeDotPattern();

    // stamps
    const fs = Math.max(18, L.R * 0.2);
    const font = `${Math.round(fs * dpr)}px Bungee, sans-serif`;
    const st = (text, bg, fg, plate, shadow, scale = 1) => {
      const g2 = makeCanvas(10, 10).getContext('2d');
      g2.font = font;
      const w = g2.measureText(text).width + fs * 0.9 * dpr;
      return stickerSprite(text, { font, w: w * scale, h: fs * 1.45 * dpr * scale, bg, fg, plate, shadow, dots: shadow, seed: text, pad: 8 * dpr, wobble: 3 * dpr });
    };
    this.stamps = {
      perfect: st('PERFECT', P.yellow, P.ink, P.pink, P.ink),
      good: st('GOOD', P.paper, P.ink, P.yellow, P.ink),
      early: st('EARLY', P.ink, P.yellow, P.pink, P.pinkDeep),
      late: st('LATE', P.ink, P.yellow, P.pink, P.pinkDeep),
      miss: st('MISS', P.pinkDeep, P.paper, P.ink, P.ink),
      holdOk: st('HELD!', P.yellow, P.ink, P.pink, P.ink),
      holdDrop: st('DROPPED', P.pinkDeep, P.paper, P.ink, P.ink),
      skip: st('SKIP!', P.yellow, P.ink, P.pink, P.ink),
      3: st('3', P.paper, P.ink, P.pink, P.ink),
      2: st('2', P.paper, P.ink, P.yellow, P.ink),
      1: st('1', P.paper, P.ink, P.pink, P.ink),
      go: st('GO!', P.yellow, P.ink, P.pink, P.ink),
    };

    this.labelSprite = null;
  }

  makeNoteSprite(lane, variant, size, ghost = false) {
    const P = this.P;
    const dpr = this.dpr;
    const pad = 6 * dpr;
    const c = makeCanvas(size + pad * 2, size + pad * 2);
    const g = c.getContext('2d');
    const m = size / 2 + pad;
    const rng = makeRng(`note-${lane}-${variant}`);
    const wob = this.opts.reducedMotion ? 0.03 : 0.07;
    let pts;
    if (lane === 0) pts = blobPoints(m, m, size * 0.4, rng, { n: 14, wobble: wob });
    else if (lane === 1) pts = polyPoints(m, m + size * 0.06, size * 0.54, 3, rng, { wobble: wob, rot: -Math.PI / 2 });
    else pts = polyPoints(m, m, size * 0.47, 4, rng, { wobble: wob, rot: -Math.PI / 4 });
    const fill = [P.yellow, P.pink, P.paper][lane];
    const plate = [P.pink, P.yellow, P.pink][lane];
    if (ghost) {
      // the target socket under the needle: dark hollow with a solid paper rim
      fillPoly(g, pts, P.ink);
      tracePoly(g, pts);
      g.strokeStyle = P.paper;
      g.lineWidth = 3 * dpr;
      g.lineJoin = 'round';
      g.stroke();
      g.globalAlpha = 0.5;
      tracePoly(g, pts, 1.5 * dpr, 1.5 * dpr);
      g.strokeStyle = [P.yellow, P.pink, P.yellow][lane];
      g.stroke();
      return c;
    }
    fillPoly(g, pts, plate, 1.8 * dpr, 1.4 * dpr);
    fillPoly(g, pts, fill);
    g.save();
    tracePoly(g, pts);
    g.clip();
    halftone(g, 0, 0, c.width, c.height, (x, y) => ((x + y) / (c.width + c.height) - 0.45) * 1.6, { cell: 4 * dpr, color: P.ink, angle: 0.7 });
    g.restore();
    if (P.high || this.opts.symbols) {
      tracePoly(g, pts);
      g.strokeStyle = P.ink;
      g.lineWidth = 2 * dpr;
      g.stroke();
    }
    if (this.opts.symbols) {
      // a pattern per groove as well as the shape: one dot, two bars, a cross
      g.fillStyle = P.ink;
      g.strokeStyle = P.ink;
      g.lineWidth = 2.4 * dpr;
      if (lane === 0) {
        g.beginPath();
        g.arc(m, m, size * 0.09, 0, TAU);
        g.fill();
      } else if (lane === 1) {
        g.beginPath();
        g.moveTo(m - size * 0.12, m - size * 0.16);
        g.lineTo(m - size * 0.12, m + size * 0.16);
        g.moveTo(m + size * 0.12, m - size * 0.16);
        g.lineTo(m + size * 0.12, m + size * 0.16);
        g.stroke();
      } else {
        g.beginPath();
        g.moveTo(m - size * 0.14, m - size * 0.14);
        g.lineTo(m + size * 0.14, m + size * 0.14);
        g.moveTo(m + size * 0.14, m - size * 0.14);
        g.lineTo(m - size * 0.14, m + size * 0.14);
        g.stroke();
      }
    }
    return c;
  }

  makeScratchSprite(variant) {
    const P = this.P;
    const L = this.L;
    const dpr = this.dpr;
    const rIn = (L.laneR[0] - L.band * 0.6) * dpr;
    const rOut = (L.laneR[2] + L.band * 0.6) * dpr;
    const len = rOut - rIn;
    const w = L.band * 0.75 * dpr;
    const pad = 8 * dpr;
    const c = makeCanvas(w + pad * 2, len + pad * 2);
    const g = c.getContext('2d');
    const rng = makeRng(`scr-${variant}`);
    const zig = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const y = pad + (i / n) * len;
      const x = pad + w / 2 + (i % 2 ? 1 : -1) * w * 0.38 * (i === 0 || i === n ? 0.3 : 1) + (rng.float() - 0.5) * w * 0.1;
      zig.push([x, y]);
    }
    const stroke = (color, dx, dy, lw) => {
      g.beginPath();
      g.moveTo(zig[0][0] + dx, zig[0][1] + dy);
      for (const p of zig.slice(1)) g.lineTo(p[0] + dx, p[1] + dy);
      g.strokeStyle = color;
      g.lineWidth = lw;
      g.lineJoin = 'miter';
      g.lineCap = 'square';
      g.stroke();
    };
    const lw = L.band * 0.26 * dpr;
    stroke(P.ink, 3 * dpr, 3 * dpr, lw);
    stroke(P.pink, 1.8 * dpr, 1.2 * dpr, lw);
    stroke(P.yellow, 0, 0, lw);
    if (this.opts.symbols || P.high) stroke(P.ink, 0, 0, lw * 0.25);
    return c;
  }

  makeDotPattern() {
    const dpr = this.dpr;
    const s = Math.round(6 * dpr);
    const c = makeCanvas(s, s);
    const g = c.getContext('2d');
    g.fillStyle = this.P.ink;
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.22, 0, TAU);
    g.fill();
    return this.ctx.createPattern(c, 'repeat');
  }

  ensureLabel() {
    if (this.labelSprite || !this.labelArt) return;
    this.labelSprite = this.labelArt;
  }

  // ---------------------------------------------------------------- feedback from the game

  onJudge(ev) {
    const lane = ev.lane;
    const res = ev.result;
    this.fx.stamp = { key: res, born: this.lastTime, rot: (Math.random() - 0.5) * 0.25 };
    if (res === 'miss' || res === 'holdDrop') return;
    if (ev.hold === 'end') return;
    if (lane === SCRATCH) {
      for (let i = 0; i < 3; i++) this.fx.pops[i] = 1;
      this.burst(SCRATCH, res);
    } else {
      this.fx.pops[lane] = 1;
      this.burst(lane, res);
    }
    this.fx.comboPop = 1;
  }

  onPress(lane) {
    if (lane >= 0 && lane < 4) this.fx.flash[lane] = 1;
  }

  onSkip() {
    this.fx.stamp = { key: 'skip', born: this.lastTime, rot: -0.12, big: true };
    if (!this.opts.reducedMotion) {
      this.fx.shake = 1;
      this.fx.skipFlash = 1;
    }
    this.fx.skipJolt = 1;
  }

  showCount(key) {
    this.fx.stamp = { key: String(key), born: this.lastTime, rot: (Math.random() - 0.5) * 0.2, big: true };
  }

  burst(lane, res) {
    const L = this.L;
    const P = this.P;
    const lanes = lane === SCRATCH ? [0, 1, 2] : [lane];
    const count = res === 'perfect' ? 7 : 4;
    for (const ln of lanes) {
      const x = L.cx;
      const y = L.cy - L.laneR[ln];
      for (let i = 0; i < count; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const sp = (120 + Math.random() * 220) * (L.R / 250);
        this.fx.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.45 + Math.random() * 0.25,
          color: [P.yellow, P.pink, P.paper][Math.floor(Math.random() * 3)], size: (3 + Math.random() * 5) * (L.R / 250),
          rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, kind: Math.floor(Math.random() * 3),
        });
      }
    }
    if (this.fx.particles.length > 160) this.fx.particles.splice(0, this.fx.particles.length - 160);
  }

  // ---------------------------------------------------------------- drawing

  /** Screen position of song time `noteT` on groove `lane` at song time `t`. */
  angleFor(noteT, t, approach) {
    return -((noteT - t) / approach) * ARC;
  }

  drawBackground(time, pulse) {
    const { ctx } = this;
    const L = this.L;
    ctx.drawImage(this.bg, 0, 0, L.W, L.H);
    const sw = this.sun.width / this.dpr;
    const scale = 1 + (this.opts.reducedMotion ? 0 : 0.045 * pulse);
    ctx.save();
    ctx.translate(L.cx, L.cy);
    ctx.rotate(this.opts.reducedMotion ? 0 : time * 0.06);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.sun, -sw / 2, -sw / 2, sw, sw);
    ctx.restore();
  }

  drawRecord(cx, cy, scale, rot, pulse, { label = true } = {}) {
    const { ctx } = this;
    const L = this.L;
    const R = L.R * scale * (1 + (this.opts.reducedMotion ? 0 : 0.006 * pulse));
    const mis = this.misprint();
    // misregistered yellow plate peeking out from under the black
    ctx.fillStyle = this.P.yellow;
    ctx.beginPath();
    ctx.arc(cx + mis.x * 1.6, cy + mis.y * 1.6, R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.P.ink;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx + R * 0.035, cy + R * 0.05, R, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    const rw = this.rec.width / this.dpr;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(R / L.R, R / L.R);
    ctx.drawImage(this.rec, -rw / 2, -rw / 2, rw, rw);
    if (label && this.labelArt) {
      const lr = L.labelR;
      ctx.drawImage(this.labelArt, -lr, -lr, lr * 2, lr * 2);
    }
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(R / L.R, R / L.R);
    ctx.drawImage(this.sheen, -rw / 2, -rw / 2, rw, rw);
    ctx.restore();
    // spindle
    ctx.fillStyle = this.P.paper;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, R * 0.03), 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.P.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.5, R * 0.014), 0, TAU);
    ctx.fill();
  }

  misprint() {
    if (this.opts.reducedMotion) return { x: 1.5, y: 1 };
    const t = this.lastTime;
    return { x: 1.5 + Math.sin(t * 0.9) * 0.7, y: 1 + Math.cos(t * 0.7) * 0.6 };
  }

  /** The tonearm. `swing` 0 = parked off the record, 1 = needle down at 12 o'clock. */
  drawArm(cx, cy, R, swing) {
    const { ctx } = this;
    const P = this.P;
    const pivot = { x: cx + R * 1.02, y: cy - R * 1.08 };
    const head = { x: cx + R * 0.03, y: cy - R * 1.01 };
    const ang0 = Math.atan2(head.y - pivot.y, head.x - pivot.x);
    const len = Math.hypot(head.x - pivot.x, head.y - pivot.y);
    const ang = ang0 - (1 - swing) * 0.9;
    const hx = pivot.x + Math.cos(ang) * len;
    const hy = pivot.y + Math.sin(ang) * len;
    const mis = this.misprint();
    const lw = Math.max(5, R * 0.045);
    const line = (color, dx, dy, w) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pivot.x + dx, pivot.y + dy);
      ctx.quadraticCurveTo(pivot.x - R * 0.25 + dx, pivot.y - R * 0.02 + dy, hx + dx, hy + dy);
      ctx.stroke();
    };
    line(P.ink, 4, 5, lw);
    line(P.pink, mis.x, mis.y, lw);
    line(P.paper, 0, 0, lw);
    // pivot base
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.arc(pivot.x + 3, pivot.y + 4, R * 0.12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = P.yellow;
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, R * 0.12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, R * 0.05, 0, TAU);
    ctx.fill();
    // headshell
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang + Math.PI / 2 - 0.1);
    ctx.fillStyle = P.ink;
    ctx.fillRect(-R * 0.06 + 3, -R * 0.02 + 4, R * 0.12, R * 0.1);
    ctx.fillStyle = P.yellow;
    ctx.fillRect(-R * 0.06, -R * 0.02, R * 0.12, R * 0.1);
    ctx.restore();
    return { hx, hy };
  }

  /** The stylus line and the three target shapes it reads at. */
  drawNeedle(cx, cy, laneDown) {
    const { ctx } = this;
    const L = this.L;
    const P = this.P;
    const top = cy - L.R * 0.99;
    const bottom = cy - L.laneR[0] + L.band * 0.6;
    ctx.save();
    ctx.strokeStyle = P.paper;
    ctx.lineWidth = Math.max(2, L.R * 0.012);
    ctx.setLineDash([L.R * 0.03, L.R * 0.025]);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, bottom);
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      const y = cy - L.laneR[i];
      const pop = this.fx.pops[i];
      const press = laneDown[i] ? 1 : this.fx.flash[i];
      const s = (L.band * 1.08) * (1 + 0.35 * pop);
      const spr = this.ghostSprites[i];
      const sw = spr.width / this.dpr;
      const k = s / (L.band * 1.08);
      if (press > 0.05) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.5 * press;
        ctx.fillStyle = [P.yellow, P.pink, P.paper][i];
        ctx.beginPath();
        ctx.arc(cx, y, L.band * 0.62 * (1 + 0.2 * press), 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(spr, cx - (sw * k) / 2, y - (sw * k) / 2, sw * k, sw * k);
      if (this.opts.symbols) {
        printText(ctx, this.keyLabels[i], cx + L.band * 0.95, y, { font: `${Math.round(L.band * 0.42)}px Bungee, sans-serif`, color: P.paper, plate: P.ink, mx: 1.5, my: 1.5 });
      }
    }
  }

  drawNotes(t, approach, notes, cx, cy, rot) {
    const { ctx } = this;
    const L = this.L;
    const P = this.P;
    const boil = this.opts.reducedMotion ? 0 : Math.floor(this.lastTime * 6);
    const fadeStart = approach * 0.82;
    const mis = this.misprint();
    // hold bodies first, so heads sit on top
    for (const n of notes) {
      if (n.type !== 'hold') continue;
      if (n.state !== 'pending' && n.state !== 'holding' && n.state !== 'dropped' && n.state !== 'missed') continue;
      if (n.t - t > approach) continue;
      if (n.end < t - 0.3) continue;
      const r = L.laneR[n.lane];
      const startT = n.state === 'holding' ? Math.max(t, n.t) : n.t;
      const a0 = this.angleFor(startT, t, approach);
      const a1 = Math.max(-ARC, this.angleFor(n.end, t, approach));
      if (a1 >= a0) continue;
      const faded = n.state === 'dropped' || n.state === 'missed';
      const lw = L.band * 0.5;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.globalAlpha = faded ? 0.3 : 1;
      const col = [P.yellow, P.pink, P.paper][n.lane];
      const plate = [P.pink, P.yellow, P.pink][n.lane];
      ctx.lineWidth = lw;
      ctx.strokeStyle = plate;
      ctx.beginPath();
      ctx.arc(cx + mis.x, cy + mis.y, r, a1 - Math.PI / 2, a0 - Math.PI / 2);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a1 - Math.PI / 2, a0 - Math.PI / 2);
      ctx.stroke();
      ctx.globalAlpha = faded ? 0.15 : 0.4;
      ctx.strokeStyle = this.dotPattern;
      ctx.lineWidth = lw * 0.62;
      ctx.stroke();
      if (n.state === 'holding') {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = P.paper;
        ctx.lineWidth = lw * 0.18;
        ctx.setLineDash([L.R * 0.02, L.R * 0.03]);
        ctx.lineDashOffset = -this.lastTime * L.R * 0.4;
        ctx.stroke();
      }
      ctx.restore();
      // tail cap
      if (n.end - t <= approach) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a1);
        ctx.fillStyle = P.ink;
        ctx.globalAlpha = faded ? 0.3 : 1;
        ctx.fillRect(-L.band * 0.08, -r - lw * 0.6, L.band * 0.16, lw * 1.2);
        ctx.restore();
      }
    }
    for (const n of notes) {
      const dt = n.t - t;
      if (dt > approach || dt < -0.35) continue;
      let alpha = 1;
      if (n.state === 'done') continue;
      if (n.state === 'holding' && n.type === 'hold') {
        // head stays pinned under the needle while held
      } else if (n.state === 'missed' || n.state === 'dropped') {
        alpha = 0.3 * Math.max(0, 1 + dt / 0.35);
      } else if (n.state !== 'pending') continue;
      if (dt > fadeStart) alpha *= 1 - (dt - fadeStart) / (approach - fadeStart);
      const a = n.state === 'holding' ? 0 : this.angleFor(n.t, t, approach);
      const v = (n.id + boil) % 3;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(cx, cy);
      ctx.rotate(a);
      if (n.type === 'scratch') {
        const spr = this.scratchSprites[v];
        const w = spr.width / this.dpr;
        const h = spr.height / this.dpr;
        const rOut = L.laneR[2] + L.band * 0.6;
        ctx.drawImage(spr, -w / 2, -rOut - 8, w, h);
      } else {
        const spr = this.noteSprites[n.lane][v];
        const w = spr.width / this.dpr;
        const r = L.laneR[n.lane];
        ctx.drawImage(spr, -w / 2, -r - w / 2, w, w);
        if (this.opts.symbols) {
          ctx.translate(0, -r);
          ctx.rotate(-a);
          printText(ctx, this.keyLabels[n.lane], 0, 1, { font: `${Math.round(L.band * 0.34)}px Bungee, sans-serif`, color: P.ink });
        }
      }
      ctx.restore();
    }
    void rot;
  }

  drawBeatTicks(t, approach, spb, cx, cy) {
    if (!spb) return;
    const { ctx } = this;
    const L = this.L;
    const first = Math.ceil((t - 0.3) / spb);
    const last = Math.floor((t + approach) / spb);
    ctx.save();
    ctx.strokeStyle = this.P.yellow;
    ctx.lineCap = 'round';
    for (let b = first; b <= last; b++) {
      const a = this.angleFor(b * spb, t, approach) - Math.PI / 2;
      const bar = b % 4 === 0;
      ctx.globalAlpha = bar ? 0.9 : 0.45;
      ctx.lineWidth = bar ? 3 : 2;
      const r0 = L.R * 0.93;
      const r1 = L.R * (bar ? 0.985 : 0.965);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawProgress(cx, cy, p) {
    const { ctx } = this;
    const L = this.L;
    const r = L.R * 1.07;
    ctx.save();
    ctx.lineWidth = Math.max(3, L.R * 0.022);
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.P.ink;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.P.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, Math.min(1, p)));
    ctx.stroke();
    ctx.restore();
  }

  drawParticles(dt) {
    const { ctx } = this;
    const ps = this.fx.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        ps.splice(i, 1);
        continue;
      }
      p.vy += 600 * dt * (this.L.R / 250);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.kind === 0) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.6, 0, TAU);
        ctx.fill();
      } else if (p.kind === 1) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      else {
        ctx.beginPath();
        ctx.moveTo(0, -p.size * 0.7);
        ctx.lineTo(p.size * 0.6, p.size * 0.5);
        ctx.lineTo(-p.size * 0.6, p.size * 0.5);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawStamp(cx, cy, pulse) {
    const s = this.fx.stamp;
    if (!s) return;
    const spr = this.stamps[s.key];
    if (!spr) return;
    const age = this.lastTime - s.born;
    const life = s.big ? 0.75 : 0.5;
    if (age > life) {
      this.fx.stamp = null;
      return;
    }
    const { ctx } = this;
    const rm = this.opts.reducedMotion;
    const inT = Math.min(1, age / 0.11);
    let scale = rm ? 1 : 1.7 - 0.7 * ease.outBack(inT);
    scale *= (s.big ? 1.25 : 0.85) * (1 + (rm ? 0 : 0.03 * pulse));
    const alpha = age > life - 0.15 ? (life - age) / 0.15 : 1;
    const w = spr.width / this.dpr;
    const h = spr.height / this.dpr;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(cx, cy);
    ctx.rotate(s.rot);
    ctx.scale(scale, scale);
    ctx.drawImage(spr, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  drawHUD(st, pulse) {
    const { ctx } = this;
    const L = this.L;
    const P = this.P;
    const m = Math.max(14, Math.min(L.W, L.H) * 0.035);
    const big = Math.round(Math.max(22, Math.min(L.W * (L.portrait ? 0.075 : 0.042), 46)));
    const small = Math.round(Math.max(11, big * 0.36));
    const mis = this.misprint();
    const bungee = (px) => `${px}px Bungee, sans-serif`;
    const rubik = (px, w = 700) => `${w} ${px}px Rubik, sans-serif`;

    // score (top left)
    printText(ctx, 'SCORE', m, m + small * 0.6, { font: rubik(small), color: P.ink, align: 'left' });
    printText(ctx, String(st.score).padStart(6, '0'), m, m + small * 1.4 + big * 0.5, { font: bungee(big), color: P.ink, plate: P.yellow, mx: mis.x + 0.5, my: mis.y + 0.5, align: 'left' });

    // combo + multiplier (top right)
    const cp = this.fx.comboPop;
    const comboScale = 1 + (this.opts.reducedMotion ? 0 : 0.12 * cp + 0.03 * pulse);
    const rx = L.W - m;
    printText(ctx, 'COMBO', rx, m + small * 0.6, { font: rubik(small), color: P.ink, align: 'right' });
    ctx.save();
    ctx.translate(rx, m + small * 1.4 + big * 0.5);
    ctx.scale(comboScale, comboScale);
    printText(ctx, String(st.combo), 0, 0, { font: bungee(big), color: P.ink, plate: P.yellow, mx: mis.x + 0.5, my: mis.y + 0.5, align: 'right' });
    ctx.restore();
    ctx.font = bungee(big);
    const cw = ctx.measureText(String(st.combo)).width;
    const mr = big * 0.62;
    const mx = rx - cw - mr - big * 0.35;
    const my = m + small * 1.4 + big * 0.5;
    const mults = { 1: P.paper, 2: P.yellow, 3: P.yellow, 4: P.yellow };
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(-0.12);
    const ms = 1 + (this.opts.reducedMotion ? 0 : 0.08 * pulse);
    ctx.scale(ms, ms);
    const mp = blobPoints(0, 0, mr, makeRng(`mult${st.mult}`), { n: 14, wobble: 0.06 });
    fillPoly(ctx, mp, P.ink, 3, 3);
    fillPoly(ctx, mp, mults[st.mult] || P.paper);
    printText(ctx, `×${st.mult}`, 0, 1, { font: bungee(Math.round(mr * 0.8)), color: P.ink, plate: st.mult >= 3 ? P.pink : null, mx: 1.5, my: 1 });
    ctx.restore();

    // groove meter + skips (under the record)
    const meterW = Math.min(L.W * 0.72, 380);
    const meterH = Math.max(12, small * 1.1);
    let meterY = L.cy + L.R * 1.17 + meterH;
    if (!L.portrait) meterY = Math.min(L.H - m - meterH, L.cy + L.R * 1.12 + meterH);
    const meterX = L.cx - meterW / 2;
    const segs = 20;
    const filled = Math.round((st.groove / 100) * segs);
    const danger = st.groove < 25;
    printText(ctx, 'GROOVE', meterX, meterY - meterH * 0.95, { font: rubik(small), color: P.ink, align: 'left', baseline: 'bottom' });
    const sw = meterW / segs;
    ctx.fillStyle = P.ink;
    ctx.fillRect(meterX + 3, meterY + 3, meterW, meterH);
    for (let i = 0; i < segs; i++) {
      const on = i < filled;
      let col = on ? (danger ? P.paper : P.yellow) : P.pinkDeep;
      if (on && danger && !this.opts.reducedMotion && Math.floor(this.lastTime * 6) % 2) col = P.yellow;
      ctx.fillStyle = col;
      ctx.fillRect(meterX + i * sw + 1, meterY, sw - 2, meterH);
    }
    // skip counters: three little records, struck through when used
    const sr = meterH * 0.75;
    for (let i = 0; i < 3; i++) {
      const x = meterX + meterW - i * sr * 2.6 - sr;
      const y = meterY - meterH * 0.95 - sr;
      const used = i < st.skips;
      ctx.fillStyle = used ? P.pinkDeep : P.ink;
      ctx.beginPath();
      ctx.arc(x, y, sr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = used ? P.ink : P.yellow;
      ctx.beginPath();
      ctx.arc(x, y, sr * 0.38, 0, TAU);
      ctx.fill();
      if (used) {
        ctx.strokeStyle = P.paper;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x - sr * 1.1, y + sr * 1.1);
        ctx.lineTo(x + sr * 1.1, y - sr * 1.1);
        ctx.stroke();
      }
    }
    printText(ctx, 'SKIPS', meterX + meterW - 3 * sr * 2.6 - sr * 0.2, meterY - meterH * 0.95 - sr, { font: rubik(small), color: P.ink, align: 'right' });

    // what's playing
    if (st.title) {
      const ty = L.portrait ? meterY + meterH + small * 2.2 : L.H - m * 0.8;
      const tx = L.portrait ? L.cx : m;
      printText(ctx, st.title, tx, ty, { font: rubik(small, 500), color: P.ink, align: L.portrait ? 'center' : 'left', baseline: 'bottom' });
    }
  }

  drawTextPanel(text, pulse) {
    if (!text) return;
    const { ctx } = this;
    const L = this.L;
    const P = this.P;
    const fs = Math.round(Math.max(14, Math.min(20, L.W * 0.04)));
    ctx.font = `500 ${fs}px Rubik, sans-serif`;
    let maxW;
    let x;
    let y;
    if (L.portrait) {
      maxW = Math.min(L.W - 40, 460);
      x = L.W / 2;
      y = L.cy - L.R * 1.32;
    } else {
      const side = L.cx - L.R * 1.25 - 30;
      if (side > 170) {
        maxW = Math.min(side, 300);
        x = 24 + maxW / 2;
        y = L.cy - 30;
      } else {
        maxW = Math.min(L.W - 40, 520);
        x = L.W / 2;
        y = L.cy - L.R * 1.2;
      }
    }
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW - 24 && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    const lh = fs * 1.3;
    const h = lines.length * lh + 18;
    const w = maxW;
    const top = L.portrait ? Math.max(8 + fs * 4.2, y - h) : y - h / 2;
    const pts = rectPoints(x - w / 2, top, w, h, makeRng(text.slice(0, 12)), 2.5);
    fillPoly(ctx, pts, P.ink, 4, 4);
    fillPoly(ctx, pts, P.paper);
    lines.forEach((l, i) => printText(ctx, l, x, top + 9 + lh * (i + 0.5), { font: `500 ${fs}px Rubik, sans-serif`, color: P.ink }));
    void pulse;
  }

  /** One frame of play. */
  drawPlay(st) {
    const { ctx } = this;
    const L = this.L;
    const P = this.P;
    const now = st.clock;
    const dt = Math.min(0.05, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    this.decay(dt);
    const pulse = st.pulse || 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.fx.shake > 0 && !this.opts.reducedMotion) {
      const k = this.fx.shake * L.R * 0.05;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    this.drawBackground(now, pulse);
    const jolt = this.fx.skipJolt * 0.35 * Math.sin(this.fx.skipJolt * 20);
    const rot = (st.t / st.approach) * ARC * (st.spin ?? 1) + jolt;
    this.drawProgress(L.cx, L.cy, st.progress);
    this.drawRecord(L.cx, L.cy, 1, rot, pulse);
    this.drawBeatTicks(st.t, st.approach, st.spb, L.cx, L.cy);
    if (st.notes) this.drawNotes(st.t, st.approach, st.notes, L.cx, L.cy, rot);
    this.drawArm(L.cx, L.cy, L.R, st.armSwing ?? 1);
    this.drawNeedle(L.cx, L.cy, st.laneDown || []);
    this.drawParticles(dt);
    this.drawStamp(L.cx, L.cy, pulse);
    if (st.hud) this.drawHUD(st.hud, pulse);
    this.drawTextPanel(st.text, pulse);
    if (this.fx.skipFlash > 0) {
      ctx.fillStyle = P.paper;
      ctx.globalAlpha = this.fx.skipFlash * 0.35;
      ctx.fillRect(0, 0, L.W, L.H);
      ctx.globalAlpha = 1;
    }
  }

  /** Menus: the record shop poster with a record turning slowly behind the crate. */
  drawMenu(st) {
    const { ctx } = this;
    const L = this.L;
    const now = st.clock;
    const dt = Math.min(0.05, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    this.decay(dt);
    const pulse = st.pulse || 0;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(now, pulse);
    const k = st.drop ?? 0; // 0 = poster position, 1 = on the turntable
    const e = ease.inOut(Math.min(1, k));
    let restX = L.portrait ? L.W * 0.5 : L.W * 0.8;
    let restY = L.portrait ? L.H * 1.02 : L.H * 0.86;
    let restS = L.portrait ? 1.2 : 1.05;
    if (k > 0 && st.from) {
      // the drop starts from where the record sat on the page
      restX = st.from.x;
      restY = st.from.y;
      restS = st.from.s;
    }
    const x = restX + (L.cx - restX) * e;
    const y = restY + (L.cy - restY) * e;
    const s = restS + (1 - restS) * e;
    this.drawRecord(x, y, s, now * 0.9, pulse);
    if (k > 0) this.drawArm(L.cx, L.cy, L.R, Math.max(0, (k - 0.6) / 0.4));
  }

  decay(dt) {
    const f = this.fx;
    for (let i = 0; i < 4; i++) {
      f.pops[i] = Math.max(0, f.pops[i] - dt * 5);
      f.flash[i] = Math.max(0, f.flash[i] - dt * 7);
    }
    f.shake = Math.max(0, f.shake - dt * 2.5);
    f.skipFlash = Math.max(0, f.skipFlash - dt * 3);
    f.skipJolt = Math.max(0, f.skipJolt - dt * 2.2);
    f.comboPop = Math.max(0, f.comboPop - dt * 6);
  }

  /** Which groove a point (CSS px) is over: 0 inner, 1 middle, 2 outer. */
  laneAt(x, y) {
    const L = this.L;
    const d = Math.hypot(x - L.cx, y - L.cy);
    if (d < L.zones[0]) return 0;
    if (d < L.zones[1]) return 1;
    return 2;
  }
}
