import { describe, it, expect, beforeEach } from 'vitest';

// a tiny localStorage for Node
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = { matchMedia: () => ({ matches: false }) };
globalThis.location = { search: '' };

const store = await import('../src/storage.js');
const { RECORDS } = await import('../src/tracks.js');

describe('saved progress', () => {
  beforeEach(() => {
    mem.clear();
    store.load();
  });

  it('keeps the best score and rank per side', () => {
    store.recordResult('paper-moon', { score: 1000, rank: 'B', acc: 0.8, maxCombo: 20, failed: false });
    const r = store.recordResult('paper-moon', { score: 800, rank: 'A', acc: 0.9, maxCombo: 30, failed: false });
    expect(r.newBest).toBe(false);
    expect(r.newRank).toBe(true);
    const b = store.bestFor('paper-moon');
    expect(b.score).toBe(1000);
    expect(b.rank).toBe('A');
    expect(b.plays).toBe(2);
    store.load(); // survives a reload
    expect(store.bestFor('paper-moon').score).toBe(1000);
  });

  it('unlocks the next record after three cleared sides; failed sides do not count', () => {
    expect(store.recordUnlocked(RECORDS, 0)).toBe(true);
    expect(store.recordUnlocked(RECORDS, 1)).toBe(false);
    const ids = RECORDS[0].tracks.map((t) => t.id);
    store.recordResult(ids[0], { score: 1, rank: 'C', acc: 0.7, maxCombo: 1, failed: false });
    store.recordResult(ids[1], { score: 1, rank: 'D', acc: 0.3, maxCombo: 1, failed: true });
    store.recordResult(ids[2], { score: 1, rank: 'C', acc: 0.7, maxCombo: 1, failed: false });
    expect(store.recordUnlocked(RECORDS, 1)).toBe(false);
    store.recordResult(ids[3], { score: 1, rank: 'C', acc: 0.7, maxCombo: 1, failed: false });
    expect(store.recordUnlocked(RECORDS, 1)).toBe(true);
    expect(store.recordUnlocked(RECORDS, 2)).toBe(false);
  });

  it('the first daily run is the day\'s result', () => {
    store.recordDaily('2026-11-24', { score: 500, records: 2 });
    const d = store.recordDaily('2026-11-24', { score: 900, records: 3 });
    expect(d.first).toBe(500);
    expect(d.best).toBe(900);
  });

  it('survives broken or blocked storage', () => {
    mem.set('needle-drop:v1', '{not json');
    expect(() => store.load()).not.toThrow();
    const saved = globalThis.localStorage.setItem;
    globalThis.localStorage.setItem = () => { throw new Error('blocked'); };
    expect(() => store.setSetting('music', 0.5)).not.toThrow();
    expect(store.settings().music).toBe(0.5);
    globalThis.localStorage.setItem = saved;
  });
});
