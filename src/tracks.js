// The records in the shop: three records of four sides each (Easy, Normal, Hard), the
// tutorial side, the shop radio that plays in the menus, and the Crate Dig generator that
// invents new records from a seed.

import { GENRES, DIG_GENRES } from './audio/genres.js';
import { makeRng } from './rng.js';

export const DIFFICULTIES = {
  easy: { id: 'easy', name: 'Easy', approach: 2.5 },
  normal: { id: 'normal', name: 'Normal', approach: 2.05 },
  hard: { id: 'hard', name: 'Hard', approach: 1.65 },
};

export const RECORDS = [
  {
    id: 'r1',
    difficulty: 'easy',
    title: 'Sunny Side Up',
    artist: 'The Soft Serve Social',
    label: 'Dotty Discs',
    catNo: 'DOT-001',
    sleeveSeed: 'sunny-side-up',
    blurb: 'Slow grooves for warm-up fingers.',
    tracks: [
      { id: 'paper-moon', side: 'A1', title: 'Paper Moon Drizzle', genre: 'lofi', bpm: 86, root: 2, scale: 'dorian', prog: [1, 4, 0, 5] },
      { id: 'corner-cypher', side: 'A2', title: 'Corner Shop Cypher', genre: 'boombap', bpm: 92, root: 9, scale: 'minor', prog: [0, 0, 5, 4], progB: [0, 3, 0, 4] },
      { id: 'lemonade-skank', side: 'B1', title: 'Lemonade Skank', genre: 'reggae', bpm: 96, root: 7, scale: 'major', prog: [0, 3, 0, 4] },
      { id: 'hip-shake', side: 'B2', title: 'Hip Shake Hustle', genre: 'funk', bpm: 104, root: 4, scale: 'dorian', prog: [0, 0, 3, 3], progB: [0, 3, 0, 4] },
    ],
  },
  {
    id: 'r2',
    difficulty: 'normal',
    title: 'Mirrorball Margins',
    artist: 'Duotone Disco Club',
    label: 'Inkwell Hi-Fi',
    catNo: 'INK-77',
    sleeveSeed: 'mirrorball-margins',
    blurb: 'Four-to-the-floor and a little swing.',
    tracks: [
      { id: 'glitter-tax', side: 'A1', title: 'Glitter Tax', genre: 'disco', bpm: 117, root: 5, scale: 'minor', prog: [0, 3, 6, 2] },
      { id: 'pink-slip', side: 'A2', title: 'Pink Slip Jack', genre: 'house', bpm: 122, root: 0, scale: 'minor', prog: [0, 5, 3, 4] },
      { id: 'two-step-taxi', side: 'B1', title: 'Two-Step Taxi', genre: 'garage', bpm: 130, root: 10, scale: 'minor', prog: [0, 5, 2, 6] },
      { id: 'robot-postman', side: 'B2', title: 'Robot Postman', genre: 'electro', bpm: 126, root: 1, scale: 'phrygian', prog: [0, 0, 5, 6] },
    ],
  },
  {
    id: 'r3',
    difficulty: 'hard',
    title: 'Riso Riot',
    artist: 'Big Ink Sound System',
    label: 'Misprint Mfg.',
    catNo: 'MIS-303',
    sleeveSeed: 'riso-riot',
    blurb: 'Breakbeats, rave stabs and fast hands.',
    tracks: [
      { id: 'breaker-breaker', side: 'A1', title: 'Breaker Breaker', genre: 'breakbeat', bpm: 138, root: 4, scale: 'minor', prog: [0, 0, 6, 6] },
      { id: 'rave-receipt', side: 'A2', title: 'Rave Receipt', genre: 'hardcore', bpm: 150, root: 9, scale: 'minor', prog: [0, 5, 3, 4] },
      { id: 'jungle-gym', side: 'B1', title: 'Jungle Gym Riot', genre: 'jungle', bpm: 164, root: 2, scale: 'minor', prog: [0, 0, 5, 5], progB: [0, 3, 0, 3] },
      { id: 'needle-drop', side: 'B2', title: 'Needle Drop', genre: 'dnb', bpm: 174, root: 7, scale: 'minor', prog: [0, 0, 6, 5] },
    ],
  },
];

for (const r of RECORDS) {
  for (const t of r.tracks) {
    t.record = r.id;
    t.difficulty = r.difficulty;
    t.seed = t.seed || `nd-${t.id}`;
    t.artist = r.artist;
    t.label = r.label;
  }
}

export const TRACKS = RECORDS.flatMap((r) => r.tracks);

export function trackById(id) {
  return TRACKS.find((t) => t.id === id) || null;
}

export function recordById(id) {
  return RECORDS.find((r) => r.id === id) || null;
}

/** The practice side: each section teaches one thing, with its own words on screen. */
export const TUTORIAL = {
  id: 'tutorial',
  side: 'P',
  title: 'Practice Pressing',
  artist: 'The Shop Assistant',
  label: 'Dotty Discs',
  genre: 'pop',
  bpm: 90,
  root: 0,
  scale: 'major',
  prog: [0, 4, 5, 3],
  seed: 'tutorial',
  difficulty: 'easy',
  tutorial: true,
  plan: [
    { name: 'intro', bars: 2, drums: 0, bass: null, keys: 0, lead: null, chart: { lanes: [] }, text: 'The needle is down. Notes ride round on the grooves to the needle at the top.' },
    { name: 'A', bars: 4, drums: 1, bass: null, keys: null, lead: null, only: ['kick', 'snare'], chart: { lanes: [0] }, text: 'INNER groove = the drums. Press {0} (or tap the inner ring) as each dot reaches the needle.' },
    { name: 'A', bars: 4, drums: 0, only: ['hat'], bass: 1, keys: null, lead: null, chart: { lanes: [1] }, text: 'MIDDLE groove = the bass. Press {1} (or tap the middle ring) on each diamond.' },
    { name: 'A', bars: 4, drums: 0, only: ['hat'], bass: null, keys: null, lead: 'full', chart: { lanes: [2] }, text: 'OUTER groove = the melody. Press {2} (or tap the outer ring) on each square.' },
    { name: 'A', bars: 4, drums: 0, only: ['hat'], bass: 0, keys: null, lead: 'long', chart: { lanes: [1, 2], holds: true }, text: 'A long arc is a HOLD. Press when it arrives and keep holding until the arc ends.' },
    { name: 'A', bars: 4, drums: 1, bass: null, keys: null, lead: null, scratch: true, scratchEvery: 1, chart: { lanes: ['S'] }, text: 'Zig-zag = SCRATCH. Press {S}, or swipe across the screen, as it passes the needle.' },
    { name: 'B', bars: 8, drums: 1, bass: 1, keys: 1, lead: 'sparse', scratch: true, scratchEvery: 4, chart: { lanes: [0, 1, 2, 'S'], holds: true }, text: 'All together now! Keep the combo going to build your multiplier.' },
    { name: 'outro', bars: 2, drums: 0, bass: null, keys: 0, lead: null, chart: { lanes: [] }, text: 'That’s it. Miss too many and the record skips; three skips and the side is over.' },
  ],
};

/** The shop radio: a gentle loop that keeps the menus moving on the beat. */
export const RADIO = {
  id: 'radio',
  title: 'Shop Radio',
  genre: 'radio',
  bpm: 98,
  root: 5,
  scale: 'major',
  prog: [0, 5, 3, 4],
  seed: 'shop-radio',
  plan: [
    { name: 'A', bars: 4, drums: 0, bass: 1, keys: 1, lead: null },
    { name: 'B', bars: 4, drums: 1, bass: 1, keys: 1, lead: 'sparse' },
    { name: 'B', bars: 4, drums: 1, bass: 1, keys: 1, lead: 'full' },
    { name: 'A', bars: 4, drums: 0, bass: 1, keys: 1, lead: 'long' },
  ],
};

// ---------------------------------------------------------------- Crate Dig

const ADJ = ['Pink', 'Lemon', 'Velvet', 'Static', 'Rubber', 'Paper', 'Sticky', 'Tin', 'Sugar', 'Biscuit', 'Copper', 'Rainy', 'Midnight', 'Sunday', 'Bubble', 'Plastic', 'Cardboard', 'Lucky', 'Saucy', 'Woozy', 'Fizzy', 'Wonky', 'Dizzy', 'Polka', 'Jelly', 'Crunchy', 'Thrift', 'Loose'];
const NOUN = ['Shuffle', 'Strut', 'Stomp', 'Groove', 'Drizzle', 'Bounce', 'Jam', 'Shake', 'Slide', 'Wobble', 'Sermon', 'Hustle', 'Rumble', 'Fizz', 'Stutter', 'Breakdown', 'Parade', 'Picnic', 'Spin', 'Shimmy', 'Riot', 'Boogie', 'Workout', 'Stampede', 'Telegram', 'Dub', 'Rattle'];
const NAME_A = ['Dot', 'Ink', 'Moiré', 'Spindle', 'Halftone', 'Duotone', 'Pinkslip', 'Stencil', 'Lemon Peel', 'Big Print', 'Overprint', 'Platter', 'Wax Paper', 'Crate', 'Sticker'];
const NAME_B = ['Records', 'Discs', 'Wax Co.', 'Sound System', 'Press', 'Platters', 'Hi-Fi', 'Recordings', 'Pressings', 'Music'];
const ARTIST_A = ['DJ', 'MC', 'The', 'Lil', 'Big', 'Sister', 'Uncle', 'Professor', 'Captain'];
const ARTIST_B = ['Scissors', 'Glue Stick', 'Toner', 'Smudge', 'Staple', 'Crayon', 'Kettle', 'Marmalade', 'Biscuit', 'Gumball', 'Sprinkles', 'Polaroid', 'Doodle', 'Pickle', 'Cassette'];

export function digDifficulty(index) {
  if (index < 2) return 'easy';
  if (index < 5) return 'normal';
  return 'hard';
}

export function randomLabelName(rng) {
  return `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`;
}

/** Invent record number `index` of a Crate Dig run. Same seed + index = same record. */
export function genDigTrack(seed, index) {
  const rng = makeRng(`dig/${seed}/${index}`);
  const difficulty = digDifficulty(index);
  const genre = rng.pick(DIG_GENRES[difficulty]);
  const g = GENRES[genre];
  const bpm = rng.int(g.bpm[0], g.bpm[1]);
  const scale = rng.pick(g.scales);
  const prog = rng.pick(g.progs);
  const progB = rng.chance(0.5) ? rng.pick(g.progs) : prog;
  const title = `${rng.pick(ADJ)} ${rng.pick(NOUN)}`;
  const a = rng.pick(ARTIST_A);
  const artist = `${a} ${rng.pick(ARTIST_B)}${a === 'The' ? 's' : ''}`;
  return {
    id: `dig-${seed}-${index}`,
    side: `${String.fromCharCode(65 + (index % 2))}${1 + Math.floor(index / 2)}`,
    title,
    artist,
    label: randomLabelName(rng),
    catNo: `${seed.slice(0, 3)}-${String(index + 1).padStart(2, '0')}`,
    genre,
    bpm,
    root: rng.int(0, 11),
    scale,
    prog,
    progB,
    seed: `dig/${seed}/${index}/song`,
    sleeveSeed: `dig/${seed}/${index}/sleeve`,
    difficulty,
    length: 64,
    dig: true,
  };
}
