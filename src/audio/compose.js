// The composer: turns a track spec (genre, tempo, key, progression, seed) into a full
// song, a sorted list of musical events with exact times in seconds. The sequencer plays
// these events and the chart generator builds notes from the very same list, so every note
// sits on something you can hear. Pure JavaScript: no audio or DOM, so it runs in tests.

import { GENRES } from './genres.js';
import { makeRng } from '../rng.js';

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** MIDI note for a scale degree (0 = tonic; 7 = tonic an octave up; negative goes down). */
export function scaleNote(tonic, scale, degree) {
  const s = SCALES[scale] || SCALES.major;
  const n = s.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return tonic + oct * 12 + s[idx];
}

/** Tonic of `rootPc` (0–11) placed as near as possible to MIDI note `around`. */
function tonicNear(around, rootPc) {
  let t = around - (((around % 12) + 12) % 12) + rootPc;
  if (t > around + 6) t -= 12;
  if (t < around - 6) t += 12;
  return t;
}

const DRUM_VEL = { x: 1, o: 0.7, g: 0.35 };
const BASS_DEG = { R: 0, T: 2, F: 4, S: 6, O: 7, L: -3 };
const DRUM_PARTS = ['kick', 'snare', 'clap', 'rim', 'hat', 'ohat', 'shaker', 'perc', 'ride'];
const HAT_PARTS = new Set(['hat', 'ohat', 'shaker', 'ride']);
const FILL = '....x...x.x.xxxx';

/** Lay out the sections of a song to come close to `lengthSec` seconds. */
export function planSections(bpm, lengthSec = 90) {
  const barSec = 240 / bpm;
  const total = Math.max(16, Math.round(lengthSec / barSec / 4) * 4);
  const out = [{ name: 'intro', bars: 4 }];
  let left = total - 8;
  const cycle = [['A', 8], ['B', 8], ['brk', 4], ['B', 8], ['A', 8], ['B', 8], ['brk', 4], ['B', 8], ['A', 8]];
  let i = 0;
  while (left > 0) {
    const [name, bars] = cycle[i % cycle.length];
    const b = Math.min(bars, left);
    out.push({ name, bars: b });
    left -= b;
    i++;
  }
  out.push({ name: 'outro', bars: 4 });
  return out;
}

function sectionDefaults(name, g) {
  const scratchy = g.scratch.sections.includes(name);
  switch (name) {
    case 'intro': return { drums: 0, bass: 0, bassFrom: 2, keys: 0, lead: null, scratch: false };
    case 'A': return { drums: 1, bass: 1, keys: 1, lead: g.lead.verse === 'none' ? null : 'sparse', scratch: scratchy };
    case 'B': return { drums: 2, bass: 2, keys: 2, lead: 'full', scratch: scratchy };
    case 'brk': return { drums: 'hats', bass: 0, keys: 0, lead: 'long', scratch: false };
    case 'outro': return { drums: 1, bass: 1, keys: 0, lead: null, scratch: false };
    default: return { drums: 1, bass: 1, keys: 1, lead: null, scratch: false };
  }
}

/** Parse a melodic pattern ("R--.O..") into [{step, len, ch}]. */
function parseMelodic(pat) {
  const out = [];
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (ch === '.' || ch === '-') continue;
    let len = 1;
    while (i + len < pat.length && pat[i + len] === '-') len++;
    out.push({ step: i, len, ch });
  }
  return out;
}

function resolveSlots(rng, slots) {
  return (slots || []).map((s) => (Array.isArray(s) ? rng.pick(s) : s || ''));
}

function acidPattern(rng) {
  let s = '';
  for (let i = 0; i < 16; i++) {
    if (i === 0) { s += 'R'; continue; }
    if (rng.chance(0.22) && s[i - 1] !== '.') { s += '-'; continue; }
    if (rng.chance(0.18)) { s += '.'; continue; }
    const l = rng.weighted(['R', 'O', 'F', 'S', 'T'], [4, 2.2, 1.4, 1, 0.8]);
    s += rng.chance(0.3) ? l.toLowerCase() : l;
  }
  return s;
}

/** A four-bar lead phrase: [{step 0..63, len, deg}]. */
function makePhrase(rng, g) {
  const r = rng.pick(g.lead.rhythms);
  const question = r.slice(0, 24) + 'x-x-....';
  const notes = parseMelodic(question + r);
  let deg = rng.int(2, 4);
  const firstHalf = [];
  notes.forEach((n, i) => {
    if (n.step < 32) {
      if (i > 0) deg += rng.weighted([-2, -1, 1, 2, 3, -3, 0], [1, 3, 3, 1.5, 0.5, 0.5, 1]);
      deg = Math.max(0, Math.min(9, deg));
      firstHalf.push(deg);
      n.deg = deg;
    } else {
      // Answer: repeat the opening shape, then wander home to the tonic.
      const j = notes.indexOf(n) - firstHalf.length;
      const isLast = n === notes[notes.length - 1];
      if (isLast) n.deg = rng.pick([0, 2, 4, 7]);
      else if (j < firstHalf.length * 0.6) n.deg = firstHalf[j] ?? deg;
      else {
        deg += rng.weighted([-2, -1, 1, 2], [2, 3, 2, 1]);
        deg = Math.max(0, Math.min(9, deg));
        n.deg = deg;
      }
    }
  });
  return notes;
}

function snapToChord(deg, chordDeg) {
  for (let d = 0; d < 4; d++) {
    for (const cand of [deg - d, deg + d]) {
      const rel = (((cand - chordDeg) % 7) + 7) % 7;
      if (rel === 0 || rel === 2 || rel === 4) return cand;
    }
  }
  return deg;
}

/**
 * Build a song from a track spec:
 *   { id, title, genre, bpm, root (0–11), scale, prog, progB, seed, length, plan }
 * `plan` (optional) overrides the section list; each entry may set drums/bass/keys/lead/scratch.
 */
export function buildSong(spec) {
  const g = GENRES[spec.genre];
  if (!g) throw new Error(`Unknown genre ${spec.genre}`);
  const rng = makeRng(spec.seed ?? spec.id ?? 'song');
  const bpm = spec.bpm;
  const spb = 60 / bpm;
  const stepSec = spb / 4;
  const swing = spec.swing ?? g.swing;
  const scale = spec.scale || g.scales[0];
  const rootPc = spec.root ?? 0;
  const prog = spec.prog || g.progs[0];
  const progB = spec.progB || prog;
  const chordSize = Math.max(3, Math.min(5, g.chordSize || 4));

  const drumPats = {};
  for (const p of DRUM_PARTS) drumPats[p] = resolveSlots(rng.fork(`d-${p}`), g.drums[p]);
  const bassRng = rng.fork('bass');
  const bassPats = resolveSlots(bassRng, g.bass.pat).map((p) => (p === 'acid' ? acidPattern(bassRng) : p));
  const keysPats = resolveSlots(rng.fork('keys'), g.keys.pat);
  const phrase = makePhrase(rng.fork('lead'), g);

  const bassTonic = tonicNear(g.bass.oct + 5, rootPc);
  const keysTonic = tonicNear(g.keys.oct, rootPc);
  const leadTonic = tonicNear(g.lead.oct, rootPc);

  const plan = (spec.plan || planSections(bpm, spec.length || 90)).map((s) => ({ ...sectionDefaults(s.name, g), ...s }));

  const events = [];
  const sections = [];
  const timeOf = (bar, step) => ((bar * 16 + step) / 4 + (step % 2 === 1 ? swing * 0.25 : 0)) * spb;
  const beatOf = (bar, step) => (bar * 16 + step) / 4;
  const human = (v, amt = 0.06) => Math.max(0.05, Math.min(1, v + (rng.float() - 0.5) * amt));

  let bar = 0;
  plan.forEach((sec, si) => {
    const startBar = bar;
    sections.push({ name: sec.name, startBar, bars: sec.bars, startBeat: startBar * 4, t: timeOf(startBar, 0), text: sec.text, chart: sec.chart });
    const isProgB = sec.name === 'B';
    const p = isProgB ? progB : prog;

    for (let b = 0; b < sec.bars; b++, bar++) {
      const chordDeg = p[b % p.length];
      const lastOfSection = b === sec.bars - 1;
      const fillBar = lastOfSection && sec.bars >= 8 && typeof sec.drums === 'number' && sec.drums >= 1;

      // Scratch cues: the drums drop out for a beat and the DJ cuts in.
      const cueSteps = [];
      if (sec.scratch && (b + 1) % (sec.scratchEvery || g.scratch.everyBars) === 0) {
        for (const beat of g.scratch.beats) {
          cueSteps.push(beat * 4);
          if (g.scratch.double) cueSteps.push(beat * 4 + 2);
        }
      }
      if (sec.scratchAt) for (const st of sec.scratchAt) if (st.bar === b) cueSteps.push(st.step);
      const cueBeatStart = cueSteps.length ? Math.min(...cueSteps) : 99;
      const muted = (step) => step >= cueBeatStart && step < cueBeatStart + (g.scratch.double ? 4 : 4);

      for (const st of cueSteps) {
        events.push({ t: timeOf(bar, st), beat: beatOf(bar, st), bar, step: st, sec: si, inst: 'scratch', part: 'cue', vel: 1, dur: stepSec * 2 });
      }

      // Crash on the first beat of a busy section.
      if (b === 0 && si > 0 && typeof sec.drums === 'number' && sec.drums >= 1) {
        events.push({ t: timeOf(bar, 0), beat: beatOf(bar, 0), bar, step: 0, sec: si, inst: 'crash', part: 'drums', vel: 0.8, dur: 1.5 });
      }

      // Drums.
      if (sec.drums !== null && sec.drums !== undefined && sec.drums !== false) {
        const level = sec.drums === 'hats' ? 0 : sec.drums;
        for (const part of DRUM_PARTS) {
          if (sec.drums === 'hats' && !HAT_PARTS.has(part)) continue;
          if (sec.only && !sec.only.includes(part)) continue;
          let pat = drumPats[part][Math.min(level, drumPats[part].length - 1)] || '';
          if (!pat) continue;
          if (pat.length === 32) pat = pat.slice((b % 2) * 16, (b % 2) * 16 + 16);
          if (fillBar && part === 'snare') pat = pat.slice(0, 8) + FILL.slice(8);
          if (fillBar && part === 'kick') pat = pat.slice(0, 8) + '........';
          for (let st = 0; st < 16; st++) {
            const ch = pat[st];
            if (!DRUM_VEL[ch]) continue;
            if (muted(st) && !HAT_PARTS.has(part)) continue;
            let vel = DRUM_VEL[ch];
            if (fillBar && part === 'snare' && st >= 8) vel = 0.45 + (st - 8) * 0.07;
            events.push({ t: timeOf(bar, st), beat: beatOf(bar, st), bar, step: st, sec: si, inst: part, part: 'drums', vel: human(vel), dur: 0.2 });
          }
        }
      }

      // Bass.
      if (sec.bass !== null && sec.bass !== undefined && b >= (sec.bassFrom || 0)) {
        const pat = bassPats[Math.min(sec.bass, bassPats.length - 1)];
        let rootNote = scaleNote(bassTonic, scale, chordDeg);
        if (rootNote >= bassTonic + 8) rootNote -= 12;
        for (const n of parseMelodic(pat)) {
          if (muted(n.step) && cueSteps.length) continue;
          const up = n.ch.toUpperCase();
          const off = BASS_DEG[up] ?? 0;
          const note = rootNote + (scaleNote(bassTonic, scale, chordDeg + off) - scaleNote(bassTonic, scale, chordDeg));
          const ghost = n.ch !== up;
          const len = ghost ? 1 : Math.min(n.len, 16 - n.step);
          events.push({
            t: timeOf(bar, n.step), beat: beatOf(bar, n.step), bar, step: n.step, sec: si, inst: 'bass', part: 'bass',
            note, vel: human(ghost ? 0.4 : n.step % 4 === 0 ? 1 : 0.85), dur: len * stepSec * 0.94, lenSteps: len,
          });
        }
      }

      // Chords.
      if (sec.keys !== null && sec.keys !== undefined) {
        const pat = keysPats[Math.min(sec.keys, keysPats.length - 1)];
        const lo = g.keys.oct - 2;
        const notes = [...new Set(Array.from({ length: chordSize }, (_, i) => {
          let n = scaleNote(keysTonic, scale, chordDeg + i * 2);
          while (n < lo) n += 12;
          while (n > lo + 15) n -= 12;
          return n;
        }))].sort((a, b2) => a - b2);
        for (const n of parseMelodic(pat)) {
          const len = Math.min(n.len, 16 - n.step);
          events.push({
            t: timeOf(bar, n.step), beat: beatOf(bar, n.step), bar, step: n.step, sec: si, inst: 'chord', part: 'keys',
            notes, vel: human(n.step % 4 === 0 ? 0.9 : 0.75), dur: len * stepSec * 0.96, lenSteps: len,
          });
        }
      }

      // Lead.
      if (sec.lead) {
        const phraseBar = b % 4;
        let src = phrase.filter((n) => Math.floor(n.step / 16) === phraseBar);
        if (sec.lead === 'sparse') {
          const kept = phrase.filter((n, i) => n.step % 8 === 0 || i === phrase.length - 1);
          src = kept.map((n, i) => {
            const next = kept[i + 1] ? kept[i + 1].step : 64;
            return { ...n, len: Math.min(12, Math.max(n.len, next - n.step - 2)) };
          }).filter((n) => Math.floor(n.step / 16) === phraseBar);
        } else if (sec.lead === 'long') {
          const near = phrase.reduce((best, n) => (Math.abs(n.step - phraseBar * 16) < Math.abs(best.step - phraseBar * 16) ? n : best), phrase[0]);
          src = [{ step: phraseBar * 16, len: 14, deg: near.deg }];
        }
        for (const n of src) {
          const st = n.step % 16;
          if (muted(st) && cueSteps.length) continue;
          const len = Math.min(n.len, 16 - st + (sec.lead === 'full' ? 0 : 0));
          const deg = st % 8 === 0 ? snapToChord(n.deg, chordDeg) : n.deg;
          events.push({
            t: timeOf(bar, st), beat: beatOf(bar, st), bar, step: st, sec: si, inst: 'lead', part: 'lead',
            note: scaleNote(leadTonic, scale, deg), vel: human(st % 4 === 0 ? 0.95 : 0.8), dur: len * stepSec * 0.92, lenSteps: len,
          });
        }
      }
    }
  });

  // The ending: one big hit on the downbeat after the last bar.
  const endChord = [...new Set(Array.from({ length: chordSize }, (_, i) => scaleNote(keysTonic, scale, prog[0] + i * 2)))];
  const endT = timeOf(bar, 0);
  const endSec = plan.length - 1;
  events.push({ t: endT, beat: bar * 4, bar, step: 0, sec: endSec, inst: 'kick', part: 'drums', vel: 1, dur: 0.3 });
  events.push({ t: endT, beat: bar * 4, bar, step: 0, sec: endSec, inst: 'crash', part: 'drums', vel: 1, dur: 2 });
  events.push({ t: endT, beat: bar * 4, bar, step: 0, sec: endSec, inst: 'bass', part: 'bass', note: scaleNote(bassTonic, scale, prog[0]), vel: 1, dur: spb * 3, lenSteps: 12 });
  events.push({ t: endT, beat: bar * 4, bar, step: 0, sec: endSec, inst: 'chord', part: 'keys', notes: endChord, vel: 0.9, dur: spb * 3, lenSteps: 12, final: true });

  const ORDER = { cue: 0, drums: 1, bass: 2, keys: 3, lead: 4 };
  events.sort((a, b2) => a.t - b2.t || ORDER[a.part] - ORDER[b2.part]);
  events.forEach((e, i) => { e.id = i; });

  return {
    id: spec.id,
    spec,
    genre: spec.genre,
    bpm,
    spb,
    swing,
    scale,
    rootPc,
    bars: bar,
    beats: bar * 4,
    endTime: endT,
    duration: endT + spb * 4,
    events,
    sections,
    kit: g.kit,
    presets: { bass: g.bass.preset, keys: g.keys.preset, lead: spec.leadPreset || g.lead.preset },
    fx: { ...g.fx, ...(spec.fx || {}) },
    mix: g.mix,
  };
}

/** Which section is playing at song time t. */
export function sectionAt(song, t) {
  let cur = song.sections[0];
  for (const s of song.sections) if (s.t <= t + 1e-6) cur = s;
  return cur;
}
