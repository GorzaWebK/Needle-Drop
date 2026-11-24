// One side being played: the chart's notes, what has been hit or missed, and the scorer.
// Pure logic driven by song time (seconds), so it can be tested without audio or a screen.
// Inputs: press(lane, t), release(lane, t), scratch(t); update(t) handles misses and holds.
// Every call returns a list of feedback events for the sound and the drawing.

import { judgeOffset, windowsFor, HOLD_GRACE, Scorer } from './judge.js';
import { SCRATCH } from './chart.js';

export class Session {
  constructor(chart, { difficulty = 'normal', carry = {}, noFail = false } = {}) {
    this.chart = chart;
    this.difficulty = difficulty;
    this.scorer = new Scorer(difficulty, { ...carry, noFail });
    this.notes = chart.notes.map((n) => ({ ...n, state: 'pending', result: null, hitT: null }));
    this.byLane = [[], [], [], []];
    for (const n of this.notes) this.byLane[n.lane].push(n);
    this.cursor = 0; // first note that may still need judging
    this.done = false;
  }

  _pendingInWindow(lane, t) {
    const list = this.byLane[lane];
    let best = null;
    for (const n of list) {
      if (n.state !== 'pending') continue;
      const w = windowsFor(n.type).ok;
      if (n.t - t > w) break;
      if (t - n.t <= w) {
        best = n;
        break;
      }
    }
    return best;
  }

  _judge(n, result, t, out, extra = {}) {
    const r = this.scorer.apply(result);
    out.push({ type: 'judge', note: n, lane: n.lane, result, t, ...r, ...extra });
    if (r.skipped) out.push({ type: 'skip', skips: this.scorer.skips, t });
    if (r.failed) out.push({ type: 'fail', t });
  }

  press(lane, t) {
    if (lane === SCRATCH) return this.scratch(t);
    const out = [];
    const n = this._pendingInWindow(lane, t);
    if (!n || n.type === 'scratch') {
      out.push({ type: 'ghost', lane, t });
      return out;
    }
    const dt = t - n.t;
    const result = judgeOffset(dt, n.type);
    n.hitT = t;
    n.result = result;
    if (n.type === 'hold') {
      n.state = 'holding';
      this._judge(n, result, t, out, { dt, hold: 'start' });
    } else {
      n.state = 'done';
      this._judge(n, result, t, out, { dt });
    }
    return out;
  }

  release(lane, t) {
    const out = [];
    if (lane === SCRATCH) return out;
    for (const n of this.byLane[lane]) {
      if (n.state !== 'holding') continue;
      if (t >= n.end - HOLD_GRACE) {
        n.state = 'done';
        this._judge(n, 'holdOk', t, out, { hold: 'end' });
      } else {
        n.state = 'dropped';
        n.dropT = t;
        this._judge(n, 'holdDrop', t, out, { hold: 'drop' });
      }
    }
    return out;
  }

  scratch(t) {
    const out = [];
    const n = this._pendingInWindow(SCRATCH, t);
    if (!n) {
      out.push({ type: 'ghost', lane: SCRATCH, t });
      return out;
    }
    const dt = t - n.t;
    n.hitT = t;
    n.result = judgeOffset(dt, 'scratch');
    n.state = 'done';
    this._judge(n, n.result, t, out, { dt });
    return out;
  }

  /** Advance to song time t: miss notes that slipped past, finish holds that reached their end. */
  update(t) {
    const out = [];
    while (this.cursor < this.notes.length && this.notes[this.cursor].state !== 'pending' && this.notes[this.cursor].state !== 'holding') this.cursor++;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > t + 1) break;
      if (n.state === 'pending' && t - n.t > windowsFor(n.type).ok) {
        n.state = 'missed';
        n.result = 'miss';
        this._judge(n, 'miss', t, out);
        if (n.type === 'hold') this.scorer.countOnly('holdDrop');
      } else if (n.state === 'holding' && t >= n.end) {
        n.state = 'done';
        this._judge(n, 'holdOk', t, out, { hold: 'end' });
      }
    }
    if (!this.done && (this.scorer.failed || (t > this.chart.lastTime + 0.3 && this.cursor >= this.notes.length))) this.done = true;
    return out;
  }

  /** Finish any hold in progress (used when pausing): counted as held. */
  settleHolds(t) {
    const out = [];
    for (const n of this.notes) {
      if (n.state === 'holding') {
        n.state = 'done';
        this._judge(n, 'holdOk', t, out, { hold: 'end' });
      }
    }
    return out;
  }

  get holding() {
    return this.notes.filter((n) => n.state === 'holding');
  }
}
