import { describe, it, expect } from 'vitest';
import { Session } from '../src/game.js';
import { buildSong } from '../src/audio/compose.js';
import { buildChart, SCRATCH } from '../src/chart.js';
import { TRACKS } from '../src/tracks.js';

const chartOf = (notes) => ({ notes: notes.map((n, i) => ({ id: i, end: n.t, ...n })), lastTime: Math.max(...notes.map((n) => n.end ?? n.t)) });

describe('play session', () => {
  it('judges a press against the nearest note in its groove', () => {
    const s = new Session(chartOf([{ lane: 0, type: 'tap', t: 1 }, { lane: 1, type: 'tap', t: 1 }]));
    const ev = s.press(0, 1.02);
    expect(ev[0].result).toBe('perfect');
    expect(s.notes[1].state).toBe('pending');
    expect(s.press(0, 1.03)[0].type).toBe('ghost');
  });

  it('ignores presses far from any note, without penalty', () => {
    const s = new Session(chartOf([{ lane: 0, type: 'tap', t: 2 }]));
    expect(s.press(0, 1)[0].type).toBe('ghost');
    expect(s.scorer.combo).toBe(0);
    expect(s.scorer.counts.miss).toBe(0);
  });

  it('misses notes that pass the needle', () => {
    const s = new Session(chartOf([{ lane: 2, type: 'tap', t: 1 }]));
    expect(s.update(1.1)).toEqual([]);
    const ev = s.update(1.2);
    expect(ev[0].result).toBe('miss');
  });

  it('handles holds: held to the end counts, letting go early drops it', () => {
    const s = new Session(chartOf([{ lane: 1, type: 'hold', t: 1, end: 2 }, { lane: 2, type: 'hold', t: 3, end: 4 }]));
    s.press(1, 1);
    expect(s.notes[0].state).toBe('holding');
    expect(s.update(2.01).find((e) => e.result === 'holdOk')).toBeTruthy();
    s.press(2, 3);
    const drop = s.release(2, 3.4);
    expect(drop[0].result).toBe('holdDrop');
    expect(s.scorer.combo).toBe(0);
  });

  it('lets a hold go a moment early', () => {
    const s = new Session(chartOf([{ lane: 1, type: 'hold', t: 1, end: 2 }]));
    s.press(1, 1);
    expect(s.release(1, 1.95)[0].result).toBe('holdOk');
  });

  it('judges scratches on the scratch key', () => {
    const s = new Session(chartOf([{ lane: SCRATCH, type: 'scratch', t: 1 }]));
    expect(s.press(0, 1)[0].type).toBe('ghost');
    expect(s.scratch(1.05)[0].result).toBe('perfect');
  });

  it('a perfect run through a real chart gets an S and no skips', () => {
    const song = buildSong(TRACKS[0]);
    const chart = buildChart(song, 'easy');
    const s = new Session(chart, { difficulty: 'easy' });
    for (const n of chart.notes) {
      s.update(n.t - 0.001);
      s.press(n.lane, n.t);
      if (n.type === 'hold') s.update(n.end + 0.001);
    }
    s.update(chart.lastTime + 1);
    expect(s.done).toBe(true);
    expect(s.scorer.rank).toBe('S');
    expect(s.scorer.counts.miss).toBe(0);
    expect(s.scorer.maxCombo).toBe(chart.notes.length + chart.holds);
  });

  it('a player who never presses skips out', () => {
    const chart = buildChart(buildSong(TRACKS[8]), 'hard');
    const s = new Session(chart, { difficulty: 'hard' });
    let failed = false;
    for (let t = 0; t < chart.lastTime + 1 && !failed; t += 1 / 60) failed = s.update(t).some((e) => e.type === 'fail');
    expect(failed).toBe(true);
    expect(s.scorer.skips).toBe(3);
  });
});
