// Generated record sleeves and centre labels. Every sleeve is printed from its seed in the
// three inks (pink, navy, yellow) on paper: bold shapes, halftone, a made-up label name, the
// title in chunky type, slight misregistration, grain and a worn ring where the record sits.

import { makeRng } from './rng.js';
import { makeCanvas, halftone, blobPoints, polyPoints, fillPoly, tracePoly, printText, makeGrain, applyGrain } from './print.js';

const STYLES = ['sunburst', 'stripes', 'dots', 'checker', 'shapes', 'letter'];
let grainTile = null;

function starPoints(cx, cy, ro, ri, n, rng) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const r = (i % 2 ? ri : ro) * (1 + (rng.float() - 0.5) * 0.08);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function inks(P) {
  return { pink: P.pink, navy: P.ink, yellow: P.yellow, paper: P.paper };
}

function wrapWords(g, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Draw a sleeve into a square canvas of `size` px. info: { title, artist, label, catNo, sleeveSeed, difficulty } */
export function drawSleeve(size, info, P) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const rng = makeRng(info.sleeveSeed || info.title);
  const I = inks(P);
  const s = size;
  const combos = [
    { bg: I.pink, a: I.navy, b: I.yellow, text: I.navy },
    { bg: I.yellow, a: I.pink, b: I.navy, text: I.navy },
    { bg: I.paper, a: I.pink, b: I.navy, text: I.navy },
    { bg: I.navy, a: I.yellow, b: I.pink, text: I.paper },
    { bg: I.paper, a: I.navy, b: I.yellow, text: I.navy },
  ];
  const col = info.palette != null ? combos[info.palette % combos.length] : rng.pick(combos);
  const style = info.style || rng.pick(STYLES);
  const mis = s * 0.008;

  g.fillStyle = col.bg;
  g.fillRect(0, 0, s, s);

  const plate = (fn) => {
    // draw a shape twice: the "b" plate out of register, then the "a" ink
    fn(col.b, mis * 1.4, mis);
    fn(col.a, 0, 0);
  };

  if (style === 'sunburst') {
    const cx = s * rng.range(0.25, 0.75);
    const cy = s * rng.range(0.3, 0.6);
    const rays = rng.int(10, 18);
    g.fillStyle = col.a;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = a0 + Math.PI / rays;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a0) * s * 1.5, cy + Math.sin(a0) * s * 1.5);
      g.lineTo(cx + Math.cos(a1) * s * 1.5, cy + Math.sin(a1) * s * 1.5);
      g.fill();
    }
    fillPoly(g, blobPoints(cx + mis * 2, cy + mis, s * 0.18, rng, { wobble: 0.03 }), col.b);
    fillPoly(g, blobPoints(cx, cy, s * 0.15, rng, { wobble: 0.03 }), col.bg);
  } else if (style === 'stripes') {
    const n = rng.int(4, 7);
    const ang = rng.range(-0.7, 0.7);
    g.save();
    g.translate(s / 2, s / 2);
    g.rotate(ang);
    for (let i = 0; i < n; i++) {
      const y = -s + (i * 2 * s) / n;
      g.fillStyle = i % 2 ? col.a : col.b;
      g.fillRect(-s, y, s * 2, (s / n) * 0.55);
    }
    g.restore();
    g.save();
    g.beginPath();
    g.rect(0, s * 0.55, s, s * 0.45);
    g.clip();
    halftone(g, 0, s * 0.5, s, s * 0.5, (x, y) => (y - s * 0.5) / (s * 0.5), { cell: s / 40, color: col.a, angle: 0.3 });
    g.restore();
  } else if (style === 'dots') {
    const cx = s * rng.range(0.3, 0.7);
    const cy = s * rng.range(0.25, 0.55);
    const r = s * rng.range(0.35, 0.5);
    g.save();
    tracePoly(g, blobPoints(cx, cy, r, rng, { n: 40, wobble: 0.015 }));
    g.clip();
    halftone(g, cx - r, cy - r, r * 2, r * 2, (x, y) => 1.15 - Math.hypot(x - cx + r * 0.3, y - cy + r * 0.3) / (r * 1.6), { cell: s / 32, color: col.a, angle: 0.4 });
    g.restore();
    halftone(g, 0, 0, s, s, (x, y) => ((x / s) * 0.6 + (1 - y / s) * 0.3) * 0.5 - 0.15, { cell: s / 60, color: col.b, angle: 1.2 });
  } else if (style === 'checker') {
    const cells = rng.int(6, 10);
    const cw = s / cells;
    const y0 = s * rng.range(0.05, 0.4);
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < cells; i++) {
        if ((i + r) % 2) continue;
        g.fillStyle = col.a;
        g.fillRect(i * cw, y0 + r * cw, cw, cw);
      }
    }
    const star = starPoints(s * 0.7, s * 0.62, s * 0.22, s * 0.1, rng.int(5, 8), makeRng(`${info.title}-star`));
    plate((color, dx, dy) => fillPoly(g, star, color, dx, dy));
  } else if (style === 'shapes') {
    const count = rng.int(4, 7);
    for (let i = 0; i < count; i++) {
      const kind = rng.pick(['circle', 'tri', 'half', 'square']);
      const x = rng.range(0.1, 0.9) * s;
      const y = rng.range(0.1, 0.7) * s;
      const r = rng.range(0.08, 0.22) * s;
      const color = rng.pick([col.a, col.b]);
      const lr = makeRng(`${info.title}-${i}`);
      if (kind === 'circle') fillPoly(g, blobPoints(x, y, r, lr, { wobble: 0.03, n: 24 }), color);
      else if (kind === 'tri') fillPoly(g, polyPoints(x, y, r, 3, lr, { rot: rng.range(0, 6.28) }), color);
      else if (kind === 'square') fillPoly(g, polyPoints(x, y, r, 4, lr, { rot: rng.range(0, 6.28) }), color);
      else {
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI);
        g.fill();
      }
    }
  } else {
    // giant cropped initial
    const letter = (info.title || '?').trim()[0].toUpperCase();
    printText(g, letter, s * rng.range(0.4, 0.6), s * 0.42, { font: `${Math.round(s * 0.95)}px Bungee, sans-serif`, color: col.a, plate: col.b, mx: mis * 2.5, my: mis * 1.5 });
  }

  // worn ring where the record presses through the card
  g.save();
  g.globalAlpha = 0.13;
  g.strokeStyle = col.text === I.paper ? I.paper : I.navy;
  g.lineWidth = s * 0.035;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.43, 0, Math.PI * 2);
  g.stroke();
  g.restore();

  // type: label name, catalogue number, title, artist
  const tf = (px) => `${Math.round(px)}px Rubik, sans-serif`;
  const bf = (px) => `${Math.round(px)}px Bungee, sans-serif`;
  const strip = s * 0.11;
  g.fillStyle = col.text === I.paper ? I.navy : I.paper;
  g.fillRect(0, 0, s, strip);
  printText(g, (info.label || '').toUpperCase(), s * 0.05, strip * 0.52, { font: `700 ${tf(s * 0.045)}`, color: col.text === I.paper ? I.paper : I.navy, align: 'left' });
  printText(g, info.catNo || '', s * 0.95, strip * 0.52, { font: `500 ${tf(s * 0.04)}`, color: col.text === I.paper ? I.yellow : I.pink, align: 'right' });

  let fs = s * 0.12;
  g.font = bf(fs);
  let lines = wrapWords(g, (info.title || '').toUpperCase(), s * 0.88);
  while (lines.length > 3 || lines.some((l) => g.measureText(l).width > s * 0.9)) {
    fs *= 0.9;
    g.font = bf(fs);
    lines = wrapWords(g, (info.title || '').toUpperCase(), s * 0.88);
  }
  const baseY = s * 0.93 - fs * 1.05 * lines.length - s * 0.05;
  const plateCol = col.text === I.navy ? (col.bg === I.yellow ? I.pink : I.yellow) : I.pink;
  lines.forEach((l, i) => printText(g, l, s * 0.06, baseY + i * fs * 1.02 + fs * 0.5, { font: bf(fs), color: col.text, plate: plateCol, mx: mis * 1.6, my: mis, align: 'left' }));
  printText(g, info.artist || '', s * 0.06, s * 0.9, { font: `500 ${tf(s * 0.05)}`, color: col.text, align: 'left' });

  // RPM sticker
  if (info.difficulty) {
    const dr = s * 0.085;
    const dx = s * 0.85;
    const dy = s * 0.24;
    const dcol = { easy: I.yellow, normal: I.paper, hard: I.pink }[info.difficulty] || I.yellow;
    fillPoly(g, blobPoints(dx + 3, dy + 3, dr, makeRng(info.title + 'rpm'), { n: 20, wobble: 0.04 }), I.navy);
    fillPoly(g, blobPoints(dx, dy, dr, makeRng(info.title + 'rpm'), { n: 20, wobble: 0.04 }), dcol);
    printText(g, info.difficulty.toUpperCase(), dx, dy, { font: bf(s * 0.03), color: I.navy });
  }

  if (!grainTile) grainTile = makeGrain(256, 'sleeve');
  applyGrain(g, grainTile, 0, 0, s, s, 0.9);
  return c;
}

/** The centre label of a record, as a square canvas of `size` px (the label fills it). */
export function drawLabel(size, info, P) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const rng = makeRng(`${info.sleeveSeed || info.title}-label`);
  const I = inks(P);
  const r = size / 2;
  const opts = [
    { bg: I.yellow, fg: I.navy, acc: I.pink },
    { bg: I.paper, fg: I.navy, acc: I.pink },
    { bg: I.pink, fg: I.navy, acc: I.yellow },
  ];
  const col = opts[info.labelColour ?? rng.int(0, opts.length - 1)];
  fillPoly(g, blobPoints(r, r, r * 0.995, rng, { n: 48, wobble: 0.006 }), col.bg);
  // a band and a little logo
  g.save();
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.clip();
  halftone(g, 0, 0, size, size, (x, y) => (y / size - 0.55) * 1.6, { cell: size / 26, color: col.acc, angle: 0.5 });
  g.restore();
  const bf = (px) => `${Math.round(px)}px Bungee, sans-serif`;
  const tf = (px) => `700 ${Math.round(px)}px Rubik, sans-serif`;
  printText(g, (info.label || '').toUpperCase(), r, r * 0.42, { font: tf(r * 0.16), color: col.fg });
  let fs = r * 0.22;
  g.font = bf(fs);
  const title = (info.title || '').toUpperCase();
  let lines = wrapWords(g, title, r * 1.5);
  while (lines.length > 2 || lines.some((l) => g.measureText(l).width > r * 1.55)) {
    fs *= 0.9;
    g.font = bf(fs);
    lines = wrapWords(g, title, r * 1.5);
  }
  // title sits above the spindle, the side and tempo below
  const top = r * 0.72 - (lines.length - 1) * fs * 0.55;
  lines.forEach((l, i) => printText(g, l, r, top + i * fs * 1.05, { font: bf(fs), color: col.fg, plate: col.acc, mx: 1.5, my: 1 }));
  printText(g, `${info.side ? `SIDE ${info.side}` : ''}${info.bpm ? ` · ${info.bpm} BPM` : ''}`, r, r * 1.38, { font: tf(r * 0.13), color: col.fg });
  printText(g, info.artist || '', r, r * 1.6, { font: `500 ${Math.round(r * 0.12)}px Rubik, sans-serif`, color: col.fg });
  return c;
}
