// Chart generation. Notes are picked from the song's own events, so every note lands on
// something you can hear: the inner groove follows the drums (kick, snare, clap, rim), the
// middle groove the bass, the outer groove the lead (or the chords where there is no lead),
// and scratch notes sit on the DJ cuts where the drums drop out. Long bass and lead notes
// become HOLD notes. A difficulty only decides WHICH events become notes, never where.

export const LANES = 3; // grooves: 0 inner, 1 middle, 2 outer
export const SCRATCH = 3; // pseudo-lane for scratch notes

export const CHART_RULES = {
  easy: { grid: 1, laneGapBeats: 1, laneGapSec: 0.5, globalGapBeats: 1, globalGapSec: 0.45, maxSimul: 1, holdMinBeats: 2, perBar: 4, holdOverlap: 'none', scratchClear: 1 },
  normal: { grid: 0.5, laneGapBeats: 0.5, laneGapSec: 0.26, globalGapBeats: 0.5, globalGapSec: 0.2, maxSimul: 2, simulOnBeat: true, holdMinBeats: 1.5, perBar: 7, holdOverlap: 'beats', scratchClear: 0.5 },
  hard: { grid: 0.25, laneGapBeats: 0.25, laneGapSec: 0.14, globalGapBeats: 0, globalGapSec: 0.095, maxSimul: 2, holdMinBeats: 1, perBar: 11, holdOverlap: 'any', scratchClear: 0.5 },
};

const DRUM_LANE = { kick: 0.92, snare: 0.88, clap: 0.86, rim: 0.86 };
const SECTION_WEIGHT = { intro: 0.85, A: 1, B: 1.08, brk: 1, outro: 0.9 };
// Lean away from the drums a little (they have the most events), more so on easier charts.
const LANE_BIAS = { easy: [0.78, 1.06, 1.06, 1], normal: [0.88, 1.02, 1.02, 1], hard: [0.94, 1, 1, 1] };
// Each two-bar phrase has a "focus" groove that follows the arrangement:
// verses lean on the bass, choruses on the melody, breaks on the long notes.
const FOCUS = { intro: [0, 0], A: [1, 0, 1, 2], B: [2, 0, 2, 1], brk: [2, 1], outro: [1, 0] };
const FOCUS_BOOST = { easy: 1.35, normal: 1.25, hard: 1.1 };

/** Small deterministic wobble so equal candidates don't always resolve the same way. */
function jitter(bar, beat, lane) {
  let h = Math.imul((bar * 64 + Math.round(beat * 4)) ^ (lane * 0x9e3779b1), 2654435761) >>> 0;
  h ^= h >>> 15;
  return ((h % 1000) / 1000 - 0.5) * 0.12;
}

function posWeight(beat) {
  const f = (x) => Math.abs(x - Math.round(x)) < 1e-6;
  if (f(beat / 4)) return 1;
  if (f(beat / 2)) return 0.92;
  if (f(beat)) return 0.85;
  if (f(beat * 2)) return 0.62;
  return 0.45;
}

const onGrid = (beat, grid) => Math.abs(beat / grid - Math.round(beat / grid)) < 1e-6;

/** Every event that could become a note, with its lane, type and how important it is. */
export function candidates(song, difficulty) {
  const rules = CHART_RULES[difficulty];
  const leadSections = new Set(song.events.filter((e) => e.inst === 'lead').map((e) => e.sec));
  const out = [];
  for (const ev of song.events) {
    const sec = song.sections[ev.sec];
    const allowed = sec.chart?.lanes;
    let lane = null;
    let base = 0;
    if (ev.inst in DRUM_LANE) {
      lane = 0;
      base = DRUM_LANE[ev.inst] * (ev.vel < 0.5 ? 0.3 : 1);
    } else if (ev.inst === 'bass') {
      lane = 1;
      base = ev.vel < 0.5 ? 0.25 : 0.8;
    } else if (ev.inst === 'lead') {
      lane = 2;
      base = 0.84;
    } else if (ev.inst === 'chord' && !leadSections.has(ev.sec)) {
      lane = 2;
      base = 0.62;
    } else if (ev.inst === 'scratch') {
      lane = SCRATCH;
      base = 2;
    }
    if (lane === null) continue;
    if (allowed && !allowed.includes(lane === SCRATCH ? 'S' : lane)) continue;
    if (ev.final) continue;
    const beats = (ev.lenSteps || 0) / 4;
    const holdsOk = sec.chart ? !!sec.chart.holds : true;
    const isHold = (lane === 1 || lane === 2) && holdsOk && beats >= rules.holdMinBeats && ev.dur >= 0.35;
    const focusList = FOCUS[sec.name] || [0];
    const focus = focusList[Math.floor((ev.bar - sec.startBar) / 2) % focusList.length];
    const sal = base * posWeight(ev.beat) * (0.6 + 0.4 * ev.vel) * (SECTION_WEIGHT[sec.name] || 1) * (isHold ? 1.12 : 1)
      * LANE_BIAS[difficulty][lane] * (lane === focus ? FOCUS_BOOST[difficulty] : 1) + jitter(ev.bar, ev.beat, lane);
    out.push({
      lane,
      type: lane === SCRATCH ? 'scratch' : isHold ? 'hold' : 'tap',
      t: ev.t,
      end: isHold ? ev.t + ev.dur : ev.t,
      beat: ev.beat,
      endBeat: isHold ? ev.beat + beats : ev.beat,
      bar: ev.bar,
      src: ev.id,
      inst: ev.inst,
      sal,
    });
  }
  return out;
}

/**
 * Build the chart for one difficulty: { notes, difficulty, count, duration }.
 * Candidates are taken in order of importance and kept if they fit the difficulty's rules.
 */
export function buildChart(song, difficulty = 'normal') {
  const rules = CHART_RULES[difficulty];
  if (!rules) throw new Error(`Unknown difficulty ${difficulty}`);
  const spb = song.spb;
  const laneGap = Math.max(rules.laneGapBeats * spb, rules.laneGapSec) - 0.002;
  const globalGap = Math.max(rules.globalGapBeats * spb, rules.globalGapSec) - 0.002;
  const scratchGap = rules.scratchClear * spb - 0.002;
  const cands = candidates(song, difficulty)
    .filter((c) => c.type === 'scratch' || onGrid(c.beat, rules.grid))
    .sort((a, b) => b.sal - a.sal || a.t - b.t || a.lane - b.lane);

  const kept = [];
  const perBar = new Map();
  const SIM = 0.006;

  const fits = (c) => {
    if ((perBar.get(c.bar) || 0) >= rules.perBar && c.type !== 'scratch') return false;
    let simul = 0;
    for (const n of kept) {
      const dt = Math.abs(c.t - n.t);
      // scratches stand alone
      if (c.type === 'scratch' || n.type === 'scratch') {
        const gap = c.type === 'scratch' && n.type === 'scratch' ? spb * 0.45 : scratchGap;
        const cEnd = c.end, nEnd = n.end;
        if (c.t < nEnd + gap && n.t < cEnd + gap) return false;
        continue;
      }
      if (n.lane === c.lane) {
        if (c.t < n.end + laneGap && n.t < c.end + laneGap) return false;
        continue;
      }
      if (dt < SIM) {
        simul++;
        if (simul >= rules.maxSimul) return false;
        if (rules.simulOnBeat && !onGrid(c.beat, 1)) return false;
        if (c.type === 'hold' && n.type === 'hold' && rules.holdOverlap !== 'any') return false;
      } else if (dt < globalGap) {
        return false;
      }
      // overlapping a hold in another groove
      const overlaps = c.t < n.end - 0.02 && n.t < c.end - 0.02;
      if (overlaps && dt >= SIM) {
        if (rules.holdOverlap === 'none') return false;
        if (rules.holdOverlap === 'beats') {
          if (c.type === 'hold' && n.type === 'hold') return false;
          const tap = c.type === 'hold' ? n : c;
          if (!onGrid(tap.beat, 1)) return false;
        }
      }
    }
    return true;
  };

  for (const c of cands) {
    if (fits(c)) {
      kept.push(c);
      perBar.set(c.bar, (perBar.get(c.bar) || 0) + 1);
    }
  }
  kept.sort((a, b) => a.t - b.t || a.lane - b.lane);
  const notes = kept.map((c, i) => ({
    id: i, lane: c.lane, type: c.type, t: c.t, end: c.end, beat: c.beat, endBeat: c.endBeat, src: c.src, inst: c.inst,
  }));
  const last = notes.length ? Math.max(...notes.map((n) => n.end)) : 0;
  return { difficulty, notes, count: notes.length, lastTime: last, holds: notes.filter((n) => n.type === 'hold').length, scratches: notes.filter((n) => n.type === 'scratch').length };
}

/** How many judgements a chart produces (a hold counts twice: press and release). */
export function judgementCount(chart) {
  return chart.notes.reduce((s, n) => s + (n.type === 'hold' ? 2 : 1), 0);
}
