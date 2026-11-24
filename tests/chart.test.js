import { describe, it, expect } from 'vitest';
import { buildSong } from '../src/audio/compose.js';
import { buildChart, CHART_RULES, SCRATCH } from '../src/chart.js';
import { TRACKS, TUTORIAL, genDigTrack } from '../src/tracks.js';

const DIFFS = ['easy', 'normal', 'hard'];

describe('chart generation', () => {
  for (const track of TRACKS) {
    it(`${track.id}: every note sits on a real musical event`, () => {
      const song = buildSong(track);
      const byId = new Map(song.events.map((e) => [e.id, e]));
      for (const d of DIFFS) {
        const chart = buildChart(song, d);
        expect(chart.count).toBeGreaterThan(20);
        for (const n of chart.notes) {
          const ev = byId.get(n.src);
          expect(ev).toBeTruthy();
          expect(n.t).toBe(ev.t);
          const expectInst = { 0: ['kick', 'snare', 'clap', 'rim'], 1: ['bass'], 2: ['lead', 'chord'], 3: ['scratch'] }[n.lane];
          expect(expectInst).toContain(ev.inst);
          if (n.type === 'hold') expect(n.end).toBeCloseTo(ev.t + ev.dur, 9);
        }
      }
    });
  }

  it('is deterministic for the same song and difficulty', () => {
    const a = buildChart(buildSong(TRACKS[5]), 'hard');
    const b = buildChart(buildSong(TRACKS[5]), 'hard');
    expect(a.notes).toEqual(b.notes);
  });

  it('gets denser from easy to normal to hard', () => {
    for (const track of TRACKS) {
      const song = buildSong(track);
      const [e, n, h] = DIFFS.map((d) => buildChart(song, d).count);
      expect(e).toBeLessThan(n);
      expect(n).toBeLessThan(h);
    }
  });

  it('respects each difficulty\'s spacing rules', () => {
    for (const track of TRACKS) {
      const song = buildSong(track);
      for (const d of DIFFS) {
        const r = CHART_RULES[d];
        const notes = buildChart(song, d).notes;
        const laneGap = Math.max(r.laneGapBeats * song.spb, r.laneGapSec) - 0.003;
        for (let lane = 0; lane < 4; lane++) {
          const ln = notes.filter((x) => x.lane === lane);
          for (let i = 1; i < ln.length; i++) {
            if (lane !== SCRATCH) expect(ln[i].t - ln[i - 1].end).toBeGreaterThanOrEqual(laneGap);
          }
        }
        // never more simultaneous notes than allowed
        const groups = new Map();
        for (const x of notes) {
          const k = Math.round(x.t * 200);
          groups.set(k, (groups.get(k) || 0) + 1);
        }
        for (const c of groups.values()) expect(c).toBeLessThanOrEqual(r.maxSimul);
        // easy and normal stay on their grid
        for (const x of notes) {
          if (x.type === 'scratch') continue;
          const g = x.beat / r.grid;
          expect(Math.abs(g - Math.round(g))).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('keeps scratch notes clear of other notes', () => {
    for (const track of TRACKS) {
      const song = buildSong(track);
      const notes = buildChart(song, 'normal').notes;
      for (const s of notes.filter((x) => x.type === 'scratch')) {
        for (const o of notes) {
          if (o === s || o.type === 'scratch') continue;
          const clear = o.end < s.t - song.spb * 0.49 || o.t > s.t + song.spb * 0.49;
          expect(clear).toBe(true);
        }
      }
    }
  });

  it('includes every note type on every difficulty of the main tracks', () => {
    for (const d of DIFFS) {
      const types = new Set();
      for (const track of TRACKS.filter((t) => t.difficulty === d)) for (const n of buildChart(buildSong(track), d).notes) types.add(n.type);
      expect([...types].sort()).toEqual(['hold', 'scratch', 'tap']);
    }
  });

  it('tutorial sections only use the grooves they teach', () => {
    const song = buildSong(TUTORIAL);
    const chart = buildChart(song, 'easy');
    for (const n of chart.notes) {
      const ev = song.events[n.src];
      const lanes = song.sections[ev.sec].chart.lanes;
      expect(lanes).toContain(n.lane === SCRATCH ? 'S' : n.lane);
    }
    expect(chart.notes.some((n) => n.type === 'hold')).toBe(true);
    expect(chart.notes.some((n) => n.type === 'scratch')).toBe(true);
  });

  it('crate dig tracks are reproducible from their seed', () => {
    const a = genDigTrack('K7Q2MX', 3);
    const b = genDigTrack('K7Q2MX', 3);
    expect(a).toEqual(b);
    expect(genDigTrack('K7Q2MX', 4).title === a.title && genDigTrack('K7Q2MX', 4).bpm === a.bpm).toBe(false);
    const chart = buildChart(buildSong(a), a.difficulty);
    expect(chart.count).toBeGreaterThan(20);
  });

  it('keeps every track between 85 and 175 BPM and near 90 seconds', () => {
    for (const track of TRACKS) {
      expect(track.bpm).toBeGreaterThanOrEqual(85);
      expect(track.bpm).toBeLessThanOrEqual(175);
      const song = buildSong(track);
      expect(song.duration).toBeGreaterThan(80);
      expect(song.duration).toBeLessThan(100);
    }
  });
});
