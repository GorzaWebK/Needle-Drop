// Timing judgement, scoring, the combo multiplier, the groove meter (which makes the record
// skip) and the S–D rank. Pure functions and one small class, no audio or drawing.

/** Timing windows in seconds either side of the note (press time minus note time). */
export const WINDOWS = { perfect: 0.045, good: 0.09, ok: 0.135 };
/** Scratches are flicks, so they get a little more room. */
export const SCRATCH_WINDOWS = { perfect: 0.065, good: 0.12, ok: 0.17 };
/** A hold may be let go this long before its end and still count. */
export const HOLD_GRACE = 0.12;

export const POINTS = { perfect: 300, good: 200, early: 100, late: 100, miss: 0, holdOk: 150, holdDrop: 0 };
export const ACC_WEIGHT = { perfect: 1, good: 0.7, early: 0.4, late: 0.4, miss: 0, holdOk: 1, holdDrop: 0 };
export const RANKS = [
  ['S', 0.95],
  ['A', 0.88],
  ['B', 0.78],
  ['C', 0.65],
  ['D', 0],
];

export const GROOVE = {
  start: 60,
  max: 100,
  gain: { perfect: 3, good: 2, early: 0.6, late: 0.6, holdOk: 2 },
  missPenalty: { easy: 9, normal: 12, hard: 14 },
  dropPenalty: { easy: 6, normal: 8, hard: 10 },
  afterSkip: 55,
  skipsToFail: 3,
};

export function windowsFor(type) {
  return type === 'scratch' ? SCRATCH_WINDOWS : WINDOWS;
}

/**
 * Judge a press `dt` seconds from its note (negative = early).
 * Returns 'perfect' | 'good' | 'early' | 'late', or null if it is outside every window.
 */
export function judgeOffset(dt, type = 'tap') {
  const w = windowsFor(type);
  const a = Math.abs(dt);
  if (a <= w.perfect) return 'perfect';
  if (a <= w.good) return 'good';
  if (a <= w.ok) return dt < 0 ? 'early' : 'late';
  return null;
}

/** Combo multiplier: x1, then x2 at 10, x3 at 25, x4 at 50. */
export function multiplier(combo) {
  if (combo >= 50) return 4;
  if (combo >= 25) return 3;
  if (combo >= 10) return 2;
  return 1;
}

/** Combo needed for the next multiplier step (or null at x4). */
export function nextMultiplierAt(combo) {
  for (const s of [10, 25, 50]) if (combo < s) return s;
  return null;
}

export function accuracy(counts) {
  let total = 0;
  let got = 0;
  for (const k of Object.keys(ACC_WEIGHT)) {
    const n = counts[k] || 0;
    total += n;
    got += n * ACC_WEIGHT[k];
  }
  return total ? got / total : 0;
}

export function rankFor(acc, failed = false) {
  if (failed) return 'D';
  for (const [r, min] of RANKS) if (acc >= min - 1e-9) return r;
  return 'D';
}

/** Running score for one side (or a whole Crate Dig run). */
export class Scorer {
  constructor(difficulty = 'normal', carry = {}) {
    this.difficulty = difficulty;
    this.score = carry.score || 0;
    this.combo = carry.combo || 0;
    this.maxCombo = carry.maxCombo || 0;
    this.skips = carry.skips || 0;
    this.groove = carry.groove ?? GROOVE.start;
    this.noFail = !!carry.noFail;
    this.failed = false;
    this.counts = { perfect: 0, good: 0, early: 0, late: 0, miss: 0, holdOk: 0, holdDrop: 0 };
  }

  get multiplier() {
    return multiplier(this.combo);
  }

  /** Count a judgement without any other effect (the release of a hold whose press was missed). */
  countOnly(result) {
    this.counts[result]++;
  }

  /** Apply a judgement. Returns what changed: { points, combo, mult, skipped, failed }. */
  apply(result) {
    this.counts[result]++;
    const out = { result, points: 0, skipped: false, failed: false };
    if (result === 'miss' || result === 'holdDrop') {
      this.combo = 0;
      const pen = (result === 'miss' ? GROOVE.missPenalty : GROOVE.dropPenalty)[this.difficulty] || 12;
      this.groove -= pen;
      if (this.groove <= 0) {
        if (this.noFail) this.groove = 1;
        else {
          this.skips++;
          this.groove = GROOVE.afterSkip;
          out.skipped = true;
          if (this.skips >= GROOVE.skipsToFail) {
            this.failed = true;
            out.failed = true;
          }
        }
      }
    } else {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      out.points = POINTS[result] * multiplier(this.combo);
      this.score += out.points;
      this.groove = Math.min(GROOVE.max, this.groove + (GROOVE.gain[result] || 0));
    }
    out.combo = this.combo;
    out.mult = multiplier(this.combo);
    return out;
  }

  get accuracy() {
    return accuracy(this.counts);
  }

  get rank() {
    return rankFor(this.accuracy, this.failed);
  }

  /** State to carry into the next record of a Crate Dig run. */
  carry() {
    return { score: this.score, combo: this.combo, maxCombo: this.maxCombo, skips: this.skips, groove: this.groove, noFail: this.noFail };
  }
}
