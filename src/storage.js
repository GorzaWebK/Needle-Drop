// Saved data: settings, best results per side, unlocks, Crate Dig and daily results.
// Everything goes through try/catch with an in-memory copy, so the game still works where
// storage is blocked (private windows, sandboxed iframes, third-party storage off).

import { DEFAULT_BINDINGS } from './input.js';

const KEY = 'needle-drop:v1';
const RANK_ORDER = ['D', 'C', 'B', 'A', 'S'];
export const CLEARS_TO_UNLOCK = 3;

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function defaults() {
  return {
    settings: {
      music: 0.8,
      sfx: 0.8,
      hits: 0.6,
      muted: false,
      reducedMotion: prefersReducedMotion(),
      highContrast: false,
      symbols: false,
      scroll: 1,
      inputOffset: 0, // ms: positive = you tend to press late
      visualOffset: 0, // ms: positive = draw notes later
      calibrated: false,
      bindings: { lanes: [...DEFAULT_BINDINGS.lanes], scratch: DEFAULT_BINDINGS.scratch },
      tutorialDone: false,
    },
    best: {},
    dig: { bestScore: 0, bestRecords: 0, lastSeed: '' },
    daily: {},
  };
}

function merge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in over)) continue;
    const b = base[k];
    const o = over[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object' && !Array.isArray(o)) base[k] = merge(b, o);
    else if (typeof o === typeof b || b === null) base[k] = o;
  }
  // keep keyed maps (best, daily) whole
  for (const k of ['best', 'daily']) if (over[k] && base[k] && typeof over[k] === 'object') Object.assign(base[k], over[k]);
  return base;
}

let data = defaults();

export function load() {
  data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = merge(defaults(), JSON.parse(raw));
  } catch {
    /* storage unavailable: keep defaults in memory */
  }
  if (!Array.isArray(data.settings.bindings?.lanes) || data.settings.bindings.lanes.length !== 3) {
    data.settings.bindings = { lanes: [...DEFAULT_BINDINGS.lanes], scratch: DEFAULT_BINDINGS.scratch };
  }
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore: the in-memory copy still works this session */
  }
}

export function get() {
  return data;
}

export function settings() {
  return data.settings;
}

export function setSetting(k, v) {
  data.settings[k] = v;
  save();
}

export function rankBetter(a, b) {
  return RANK_ORDER.indexOf(a) > RANK_ORDER.indexOf(b);
}

/** Store a finished side. Returns { newBest, newRank, prev }. */
export function recordResult(trackId, r) {
  const prev = data.best[trackId] ? { ...data.best[trackId] } : null;
  const b = data.best[trackId] || { score: 0, rank: null, acc: 0, maxCombo: 0, plays: 0, clears: 0, fullCombo: false };
  b.plays++;
  const cleared = !r.failed;
  if (cleared) b.clears++;
  const newBest = r.score > b.score;
  if (newBest) b.score = r.score;
  const newRank = cleared && (!b.rank || rankBetter(r.rank, b.rank));
  if (newRank) b.rank = r.rank;
  b.acc = Math.max(b.acc, cleared ? r.acc : 0);
  b.maxCombo = Math.max(b.maxCombo, r.maxCombo);
  if (cleared && r.fullCombo) b.fullCombo = true;
  data.best[trackId] = b;
  save();
  return { newBest, newRank, prev };
}

export function bestFor(trackId) {
  return data.best[trackId] || null;
}

function unlockAll() {
  try {
    return new URLSearchParams(location.search).get('unlock') === 'all';
  } catch {
    return false;
  }
}

/** Record 1 is open; each later record opens once you clear 3 sides of the one before. */
export function recordUnlocked(records, index) {
  if (index <= 0 || unlockAll()) return true;
  const prev = records[index - 1];
  const cleared = prev.tracks.filter((t) => (data.best[t.id]?.clears || 0) > 0).length;
  return cleared >= CLEARS_TO_UNLOCK;
}

export function clearedCount(record) {
  return record.tracks.filter((t) => (data.best[t.id]?.clears || 0) > 0).length;
}

export function recordDig(result) {
  const d = data.dig;
  const newBest = result.score > d.bestScore;
  d.bestScore = Math.max(d.bestScore, result.score);
  d.bestRecords = Math.max(d.bestRecords, result.records);
  d.lastSeed = result.seed;
  save();
  return { newBest };
}

/** The first finished daily run of a date is the day's result; later runs only raise the best. */
export function recordDaily(dateKey, result) {
  const cur = data.daily[dateKey];
  if (!cur) {
    data.daily[dateKey] = { first: result.score, best: result.score, records: result.records, runs: 1 };
  } else {
    cur.best = Math.max(cur.best, result.score);
    cur.records = Math.max(cur.records, result.records);
    cur.runs++;
  }
  // keep the last 60 days only
  const keys = Object.keys(data.daily).sort();
  while (keys.length > 60) delete data.daily[keys.shift()];
  save();
  return data.daily[dateKey];
}

export function dailyFor(dateKey) {
  return data.daily[dateKey] || null;
}

export function resetProgress() {
  const s = data.settings;
  data = defaults();
  data.settings = s;
  save();
}
