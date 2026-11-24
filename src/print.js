// Risograph / screen-print effects for Canvas 2D: halftone dots, paper grain, hand-cut
// "sticker" shapes that wobble a little, and misregistered colour plates (each ink layer
// drawn 1–2 px out of line with the others). Used to pre-render layers and sprites, so the
// per-frame drawing stays cheap.

import { makeRng } from './rng.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Read the palette from the CSS variables, so the canvas and the page always match. */
export function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => (cs.getPropertyValue(n).trim() || d);
  return {
    bg: v('--bg', '#ff48b0'),
    ink: v('--ink', '#1c2373'),
    inkSoft: v('--ink-soft', '#2f3c9e'),
    yellow: v('--yellow', '#ffe800'),
    pink: v('--pink', '#ff48b0'),
    pinkDeep: v('--pink-deep', '#e8268c'),
    paper: v('--paper', '#fff3e8'),
    record: v('--record', '#1c2373'),
    groove: v('--groove', '#2a3591'),
    outline: v('--outline', 'transparent'),
    high: document.documentElement.dataset.contrast === 'high',
  };
}

/** A tile of paper grain: specks and fibres in light and dark. */
export function makeGrain(size = 256, seed = 'grain') {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rng = makeRng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = rng.float();
    const v = n < 0.5 ? 0 : 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(Math.abs(n - 0.5) * 2 * (rng.chance(0.03) ? 90 : 26));
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.08;
  g.strokeStyle = '#000';
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const a = rng.range(0, Math.PI);
    const l = rng.range(4, 14);
    g.lineWidth = rng.range(0.4, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}

/** Lay grain over everything already drawn in a rectangle. */
export function applyGrain(ctx, grain, x, y, w, h, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const pat = ctx.createPattern(grain, 'repeat');
  ctx.fillStyle = pat;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * Halftone dots on a rotated grid. density(x, y) returns 0..1 (dot area).
 * Only draws inside the current clip, so clip first to shade a shape.
 */
export function halftone(ctx, x, y, w, h, density, { cell = 8, angle = 0.38, color = '#000', maxR = null } = {}) {
  const mr = maxR ?? cell * 0.62;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const half = Math.hypot(w, h) / 2 + cell;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let v = -half; v <= half; v += cell) {
    for (let u = -half; u <= half; u += cell) {
      const px = cx + u * ca - v * sa;
      const py = cy + u * sa + v * ca;
      if (px < x - cell || px > x + w + cell || py < y - cell || py > y + h + cell) continue;
      const d = density(px, py);
      if (d <= 0.02) continue;
      const r = mr * Math.sqrt(Math.min(1, d));
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

/** Points of a hand-cut polygon approximating a circle/blob. */
export function blobPoints(cx, cy, r, rng, { n = 16, wobble = 0.05, rx = 1, ry = 1, rot = 0 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const rr = r * (1 + (rng.float() - 0.5) * 2 * wobble);
    pts.push([cx + Math.cos(a) * rr * rx, cy + Math.sin(a) * rr * ry]);
  }
  return pts;
}

/** A regular shape (sides >= 3) cut a little unevenly. */
export function polyPoints(cx, cy, r, sides, rng, { wobble = 0.05, rot = -Math.PI / 2 } = {}) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const rr = r * (1 + (rng.float() - 0.5) * 2 * wobble);
    const aj = a + (rng.float() - 0.5) * wobble * 0.6;
    pts.push([cx + Math.cos(aj) * rr, cy + Math.sin(aj) * rr]);
  }
  return pts;
}

/** A rounded-ish rectangle with every corner nudged, like a sticker cut with scissors. */
export function rectPoints(x, y, w, h, rng, wobble = 3) {
  const j = () => (rng.float() - 0.5) * 2 * wobble;
  const c = Math.min(w, h) * 0.12;
  return [
    [x + c + j(), y + j()], [x + w / 2 + j(), y + j() * 0.6], [x + w - c + j(), y + j()],
    [x + w + j(), y + c + j()], [x + w + j() * 0.6, y + h / 2 + j()], [x + w + j(), y + h - c + j()],
    [x + w - c + j(), y + h + j()], [x + w / 2 + j(), y + h + j() * 0.6], [x + c + j(), y + h + j()],
    [x + j(), y + h - c + j()], [x + j() * 0.6, y + h / 2 + j()], [x + j(), y + c + j()],
  ];
}

export function tracePoly(ctx, pts, dx = 0, dy = 0) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
  ctx.closePath();
}

export function fillPoly(ctx, pts, color, dx = 0, dy = 0) {
  tracePoly(ctx, pts, dx, dy);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Text printed in two inks: a plate in `plate` colour knocked out of register by (mx, my),
 * then the main ink on top. Optional chunky drop shadow in `shadow`.
 */
export function printText(ctx, text, x, y, { font, color, plate = null, mx = 2, my = 1.5, shadow = null, sx = 3, sy = 3, align = 'center', baseline = 'middle' } = {}) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(text, x + sx, y + sy);
  }
  if (plate) {
    ctx.fillStyle = plate;
    ctx.fillText(text, x + mx, y + my);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** A small sticker sprite: a hand-cut shape with a printed shadow, halftone and text. */
export function stickerSprite(text, { font, w, h, bg, fg, plate, shadow, seed = text, dots = null, pad = 10, wobble = 3 }) {
  const c = makeCanvas(w + pad * 2 + 8, h + pad * 2 + 8);
  const g = c.getContext('2d');
  const rng = makeRng(seed);
  const pts = rectPoints(pad, pad, w, h, rng, wobble);
  if (shadow) fillPoly(g, pts, shadow, 6, 6);
  fillPoly(g, pts, bg);
  if (dots) {
    g.save();
    tracePoly(g, pts);
    g.clip();
    halftone(g, pad, pad, w, h, (px, py) => ((px - pad) / w) * 0.55 + ((py - pad) / h) * 0.2 - 0.1, { cell: 6, color: dots });
    g.restore();
  }
  printText(g, text, pad + w / 2, pad + h / 2 + h * 0.04, { font, color: fg, plate, mx: 2.5, my: 2 });
  return c;
}
