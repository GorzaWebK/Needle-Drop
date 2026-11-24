// Seeded random numbers. A string seed is hashed (cyrb128) into four 32-bit words that
// seed an sfc32 generator. The same seed always gives the same track, chart and sleeve.

export function hashString(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a, b, c, d) {
  return function next() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** A small seeded RNG with helpers. `fork(label)` gives an independent stream. */
export function makeRng(seed) {
  const seedStr = String(seed);
  const next = sfc32(...hashString(seedStr));
  for (let i = 0; i < 12; i++) next();
  const rng = {
    seed: seedStr,
    float: next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted(items, weights) {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    fork: (label) => makeRng(`${seedStr}/${label}`),
  };
  return rng;
}

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Everyone playing on the same local date digs the same crate. */
export function dailySeed(d = new Date()) {
  return `DAILY-${dateKey(d)}`;
}

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short, readable seed code for Crate Dig, e.g. "K7Q2MX". */
export function randomSeedCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += SEED_CHARS[Math.floor(rand() * SEED_CHARS.length)];
  return s;
}

/** Tidy a typed seed: upper case, letters/digits/dashes only, max 24 characters. */
export function cleanSeed(str) {
  return String(str || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
}
