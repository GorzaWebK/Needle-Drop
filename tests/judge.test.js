import { describe, it, expect } from 'vitest';
import { judgeOffset, multiplier, accuracy, rankFor, Scorer, WINDOWS, SCRATCH_WINDOWS, GROOVE } from '../src/judge.js';

describe('timing judgement', () => {
  it('sorts presses into the right windows', () => {
    expect(judgeOffset(0)).toBe('perfect');
    expect(judgeOffset(WINDOWS.perfect)).toBe('perfect');
    expect(judgeOffset(-0.03)).toBe('perfect');
    expect(judgeOffset(0.06)).toBe('good');
    expect(judgeOffset(-0.08)).toBe('good');
    expect(judgeOffset(-0.12)).toBe('early');
    expect(judgeOffset(0.12)).toBe('late');
    expect(judgeOffset(WINDOWS.ok + 0.001)).toBe(null);
    expect(judgeOffset(-0.5)).toBe(null);
  });

  it('gives scratches wider windows', () => {
    expect(judgeOffset(0.06, 'tap')).toBe('good');
    expect(judgeOffset(0.06, 'scratch')).toBe('perfect');
    expect(judgeOffset(0.16, 'tap')).toBe(null);
    expect(judgeOffset(0.16, 'scratch')).toBe('late');
    expect(SCRATCH_WINDOWS.ok).toBeGreaterThan(WINDOWS.ok);
  });
});

describe('scoring', () => {
  it('steps the multiplier up with the combo', () => {
    expect(multiplier(0)).toBe(1);
    expect(multiplier(9)).toBe(1);
    expect(multiplier(10)).toBe(2);
    expect(multiplier(25)).toBe(3);
    expect(multiplier(49)).toBe(3);
    expect(multiplier(50)).toBe(4);
    expect(multiplier(500)).toBe(4);
  });

  it('scores hits with the multiplier and resets combo on a miss', () => {
    const s = new Scorer('normal');
    for (let i = 0; i < 9; i++) s.apply('perfect');
    expect(s.score).toBe(9 * 300);
    s.apply('perfect'); // 10th hit: x2
    expect(s.score).toBe(9 * 300 + 600);
    expect(s.combo).toBe(10);
    s.apply('miss');
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(10);
    s.apply('good');
    expect(s.score).toBe(9 * 300 + 600 + 200);
  });

  it('computes accuracy and ranks', () => {
    expect(accuracy({ perfect: 10 })).toBe(1);
    expect(accuracy({ perfect: 5, miss: 5 })).toBe(0.5);
    expect(accuracy({ good: 10 })).toBeCloseTo(0.7);
    expect(rankFor(1)).toBe('S');
    expect(rankFor(0.95)).toBe('S');
    expect(rankFor(0.9)).toBe('A');
    expect(rankFor(0.8)).toBe('B');
    expect(rankFor(0.7)).toBe('C');
    expect(rankFor(0.3)).toBe('D');
    expect(rankFor(1, true)).toBe('D');
  });

  it('skips the record when the groove runs out, and ends the side after three skips', () => {
    const s = new Scorer('normal');
    let skips = 0;
    let failed = false;
    for (let i = 0; i < 100 && !failed; i++) {
      const r = s.apply('miss');
      if (r.skipped) skips++;
      if (r.failed) failed = true;
    }
    expect(skips).toBe(3);
    expect(failed).toBe(true);
    expect(s.rank).toBe('D');
    // first skip after start/penalty misses
    const s2 = new Scorer('normal');
    const missesToSkip = Math.ceil(GROOVE.start / GROOVE.missPenalty.normal);
    for (let i = 0; i < missesToSkip - 1; i++) expect(s2.apply('miss').skipped).toBe(false);
    expect(s2.apply('miss').skipped).toBe(true);
  });

  it('never fails in no-fail mode (the tutorial)', () => {
    const s = new Scorer('easy', { noFail: true });
    for (let i = 0; i < 200; i++) expect(s.apply('miss').failed).toBe(false);
    expect(s.skips).toBe(0);
  });

  it('carries score, combo and skips into the next record', () => {
    const s = new Scorer('hard');
    for (let i = 0; i < 30; i++) s.apply('perfect');
    const next = new Scorer('hard', s.carry());
    expect(next.score).toBe(s.score);
    expect(next.combo).toBe(30);
    expect(next.multiplier).toBe(3);
  });
});
