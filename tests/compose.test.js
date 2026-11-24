import { describe, it, expect } from 'vitest';
import { buildSong, planSections, scaleNote } from '../src/audio/compose.js';
import { GENRES } from '../src/audio/genres.js';
import { TRACKS, TUTORIAL, RADIO, genDigTrack } from '../src/tracks.js';
import { makeRng, dailySeed, dateKey, cleanSeed, randomSeedCode } from '../src/rng.js';

describe('composer', () => {
  it('builds every track with sorted, finite, in-range events', () => {
    for (const t of [...TRACKS, TUTORIAL, RADIO]) {
      const s = buildSong(t);
      for (let i = 1; i < s.events.length; i++) expect(s.events[i].t).toBeGreaterThanOrEqual(s.events[i - 1].t);
      for (const e of s.events) {
        expect(Number.isFinite(e.t)).toBe(true);
        expect(e.t).toBeGreaterThanOrEqual(0);
        if (e.note !== undefined) expect(e.note).toBeGreaterThan(20);
        if (e.note !== undefined) expect(e.note).toBeLessThan(100);
        if (e.notes) for (const n of e.notes) expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it('places events on the beat grid at the track tempo (swing only delays off-beat 16ths)', () => {
    for (const t of TRACKS) {
      const s = buildSong(t);
      for (const e of s.events) {
        const straight = e.beat * s.spb;
        const step = Math.round(e.beat * 4) % 2;
        if (step === 0) expect(e.t).toBeCloseTo(straight, 9);
        else expect(e.t).toBeCloseTo(straight + s.swing * 0.25 * s.spb, 9);
      }
    }
  });

  it('gives each genre a different feel: tempo range, swing and instruments', () => {
    const feels = new Set(Object.values(GENRES).map((g) => `${g.swing}|${g.bass.preset}|${g.keys.preset}|${g.lead.preset}`));
    expect(feels.size).toBe(Object.keys(GENRES).length);
    expect(new Set(TRACKS.map((t) => t.genre)).size).toBe(12);
  });

  it('plans sections that add up to about the requested length', () => {
    for (const bpm of [86, 120, 174]) {
      const bars = planSections(bpm, 90).reduce((a, s) => a + s.bars, 0);
      expect(bars * (240 / bpm)).toBeGreaterThan(80);
      expect(bars * (240 / bpm)).toBeLessThan(100);
    }
  });

  it('maps scale degrees across octaves', () => {
    expect(scaleNote(60, 'major', 0)).toBe(60);
    expect(scaleNote(60, 'major', 7)).toBe(72);
    expect(scaleNote(60, 'minor', 2)).toBe(63);
    expect(scaleNote(60, 'major', -1)).toBe(59);
  });
});

describe('seeds', () => {
  it('the same seed gives the same numbers, different seeds differ', () => {
    const a = makeRng('ABC');
    const b = makeRng('ABC');
    const c = makeRng('ABD');
    const sa = Array.from({ length: 5 }, () => a.float());
    expect(Array.from({ length: 5 }, () => b.float())).toEqual(sa);
    expect(Array.from({ length: 5 }, () => c.float())).not.toEqual(sa);
  });

  it('the daily seed depends only on the local date', () => {
    const d1 = new Date(2026, 10, 24, 8, 0);
    const d2 = new Date(2026, 10, 24, 23, 59);
    expect(dailySeed(d1)).toBe(dailySeed(d2));
    expect(dailySeed(d1)).not.toBe(dailySeed(new Date(2026, 10, 25, 0, 1)));
    expect(dateKey(d1)).toBe('2026-11-24');
    expect(genDigTrack(dailySeed(d1), 0)).toEqual(genDigTrack(dailySeed(d2), 0));
  });

  it('tidies typed seeds and makes readable codes', () => {
    expect(cleanSeed(' k7q-2mx! ')).toBe('K7Q-2MX');
    expect(randomSeedCode(() => 0)).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('crate dig ramps up from easy to hard', () => {
    const diffs = Array.from({ length: 8 }, (_, i) => genDigTrack('X', i).difficulty);
    expect(diffs.slice(0, 2)).toEqual(['easy', 'easy']);
    expect(diffs[3]).toBe('normal');
    expect(diffs[7]).toBe('hard');
  });
});
