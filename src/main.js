// Needle Drop: start-up, the screens of the record shop, the shop radio, the drop onto the
// turntable and the life of a side (play, pause, results). One animation loop draws the
// canvas; the sequencer schedules audio against the AudioContext clock.

import '@fontsource/bungee/latin-400.css';
import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/latin-700.css';
import './style.css';

import { AudioEngine } from './audio/engine.js';
import { Sequencer } from './audio/sequencer.js';
import { buildSong } from './audio/compose.js';
import { GENRES } from './audio/genres.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Play } from './play.js';
import { readPalette, makeCanvas, printText } from './print.js';
import { drawLabel, drawSleeve } from './sleeve.js';
import { dailySeed, dateKey, randomSeedCode, cleanSeed } from './rng.js';
import * as store from './storage.js';
import * as ui from './ui.js';
import { RECORDS, TUTORIAL, RADIO, genDigTrack, recordById } from './tracks.js';

const $ = (id) => document.getElementById(id);
const root = document.documentElement;

store.load();
const canvas = $('stage');
const engine = new AudioEngine();
const seq = new Sequencer(engine);
const renderer = new Renderer(canvas, $('backdrop'));

let mode = 'menu'; // 'menu' | 'drop' | 'play'
let play = null;
let lastPlay = null; // options to replay the last side
let screen = 'scr-title';
const backStack = [];
let radioSong = null;
let radioOn = false;
let lastBeat = -1;
let drop = null;
let currentRecord = null;

const input = new Input(canvas, {
  laneAt: (x, y) => renderer.laneAt(x, y),
  onPause: () => onEscape(),
  onMute: () => toggleMute(),
  onAnyKey: (e) => {
    if (screen === 'scr-cal' && !$('scr-cal').hidden && e.code !== 'Tab' && e.code !== 'Escape' && !e.target.closest?.('button, input')) cal.tap(e.timeStamp);
  },
});

const app = {
  engine, seq, renderer, input,
  settings: () => store.settings(),
  palette: () => renderer.P,
  onFinish: (r) => finishSide(r),
};

const cal = new ui.Calibration(engine, (ms) => {
  store.setSetting('inputOffset', ms);
  store.setSetting('calibrated', true);
  settingsUI.fill();
});

// ---------------------------------------------------------------- settings

function applyLook() {
  const s = store.settings();
  root.dataset.motion = s.reducedMotion ? 'reduced' : 'full';
  root.dataset.contrast = s.highContrast ? 'high' : 'normal';
  renderer.opts.reducedMotion = s.reducedMotion;
  renderer.opts.symbols = s.symbols;
  renderer.setPalette(readPalette());
  document.querySelector('meta[name="theme-color"]').setAttribute('content', renderer.P.bg);
  renderer.setLabel(null, shopLabel());
  if (play && play.track) play.app.renderer.setLabel(play.track, drawLabel(Math.round(renderer.layout.labelR * 2 * renderer.dpr), play.track, renderer.P));
}

function applySound() {
  const s = store.settings();
  engine.setVolumes({ music: s.music, sfx: s.sfx, hits: s.hits });
  engine.setMuted(s.muted);
  $('btn-mute').classList.toggle('off', s.muted);
}

const settingsUI = ui.bindSettings((name, v) => {
  if (['music', 'sfx', 'hits', 'muted'].includes(name)) applySound();
  else if (['reducedMotion', 'highContrast', 'symbols'].includes(name)) {
    applyLook();
    if (screen === 'scr-crate') ui.buildCrate(renderer.P, pickRecord);
  } else if (name === 'rebind') {
    input.capture = (code) => {
      const b = store.settings().bindings;
      const codes = [...b.lanes, b.scratch];
      if (code !== 'Escape' && !['KeyM', 'KeyP', 'Tab', 'Enter'].includes(code)) {
        const clash = codes.indexOf(code);
        if (clash >= 0 && clash !== v.index) codes[clash] = codes[v.index]; // swap
        codes[v.index] = code;
        const nb = { lanes: codes.slice(0, 3), scratch: codes[3] };
        store.setSetting('bindings', nb);
        input.setBindings(nb);
      }
      v.done();
    };
  } else if (name === 'reset') {
    if (screen === 'scr-crate') ui.buildCrate(renderer.P, pickRecord);
    updateTitle();
  }
});

function toggleMute() {
  const m = !store.settings().muted;
  store.setSetting('muted', m);
  applySound();
  settingsUI.fill();
}

// ---------------------------------------------------------------- audio + shop radio

function ensureAudio() {
  const fresh = !engine.ready;
  engine.init();
  if (fresh && engine.ready) {
    applySound();
    radioSong = buildSong(RADIO);
  }
  engine.resume();
}

function startRadio() {
  if (!engine.ready || radioOn || mode === 'play') return;
  seq.load(radioSong, { loop: true });
  seq.start(0, engine.now + 0.15);
  engine.setCrackle(0.35);
  radioOn = true;
  lastBeat = -1;
}

function stopRadio(fade = 0.4) {
  if (!radioOn) return;
  seq.stop(fade);
  radioOn = false;
}

// ---------------------------------------------------------------- screens

function go(id, push = true) {
  if (push && screen && screen !== id) backStack.push(screen);
  screen = id;
  ui.show(id);
  if (id === 'scr-cal') {
    stopRadio(0.2);
    cal.open();
  } else {
    cal.close();
    if (mode === 'menu' && id !== 'scr-pause') startRadio();
  }
}

function back() {
  if (screen === 'scr-cal' || screen === 'scr-settings') {
    // return to the pause menu if we came from a paused side
    if (play && play.state === 'paused') {
      backStack.length = 0;
      go('scr-pause', false);
      return;
    }
  }
  const prev = backStack.pop() || 'scr-title';
  if (prev === 'scr-crate') ui.buildCrate(renderer.P, pickRecord);
  if (prev === 'scr-title') updateTitle();
  go(prev, false);
}

function onEscape() {
  if (input.capture) return;
  if (mode === 'play' && play) {
    if (play.state === 'paused') {
      if (screen === 'scr-pause') resumePlay();
      else back();
    } else pausePlay();
    return;
  }
  if (mode === 'menu' && screen !== 'scr-title' && screen !== 'scr-results') back();
}

function updateTitle() {
  const d = store.dailyFor(dateKey());
  $('daily-sub').textContent = d ? `today: ${d.first.toLocaleString()} · ${d.records} rec` : `seed of ${dateKey()}`;
  const tut = document.querySelector('[data-go="tutorial"]');
  const done = store.settings().tutorialDone;
  tut.classList.toggle('pulse', !done);
  tut.querySelector('span').textContent = done ? 'How to play' : 'Start here!';
}

function shopLabel() {
  return drawLabel(Math.round((renderer.layout?.labelR || 80) * 2 * renderer.dpr), { title: 'Needle Drop', label: 'The Shop Radio', artist: 'Dotty Discs', side: 'S', bpm: RADIO.bpm, sleeveSeed: 'shop', labelColour: 0 }, renderer.P);
}

function pickRecord(rec, index, sleeveCanvas) {
  ensureAudio();
  engine.swish();
  currentRecord = rec;
  const label = drawLabel(260, { ...rec.tracks[0], title: rec.title, side: 'A', bpm: null, sleeveSeed: rec.sleeveSeed }, renderer.P);
  ui.showRecord(rec, index, renderer.P, label, (track) => startSide(track, 'side', $('rec-disc')));
  go('scr-record');
  void sleeveCanvas;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  ensureAudio();
  engine.tick();
  const where = b.dataset.go;
  if (where === 'back') back();
  else if (where === 'crate') {
    ui.buildCrate(renderer.P, pickRecord);
    go('scr-crate');
  } else if (where === 'dig') openDig();
  else if (where === 'daily') startDig(dailySeed(), 'daily');
  else if (where === 'tutorial') startSide(TUTORIAL, 'tutorial', null);
  else if (where === 'calibrate') go('scr-cal');
  else if (where === 'settings') {
    settingsUI.fill();
    go('scr-settings');
  }
});

// ---------------------------------------------------------------- Crate Dig setup

function digSeed() {
  return cleanSeed($('dig-seed').value) || randomSeedCode();
}

function updateDigPreview() {
  const seed = digSeed();
  const t = genDigTrack(seed, 0);
  const cv = $('dig-sleeve');
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.drawImage(drawSleeve(cv.width, t, renderer.P), 0, 0);
  $('dig-first').textContent = `First record: “${t.title}” by ${t.artist} · ${GENRES[t.genre].name} · ${t.bpm} BPM`;
  const d = store.get().dig;
  $('dig-best').textContent = d.bestScore ? `Best dig: ${d.bestScore.toLocaleString()} points · ${d.bestRecords} records` : 'No digs yet.';
}

function openDig() {
  $('dig-seed').value = store.get().dig.lastSeed && !store.get().dig.lastSeed.startsWith('DAILY') ? store.get().dig.lastSeed : randomSeedCode();
  updateDigPreview();
  go('scr-dig');
}

$('dig-seed').addEventListener('input', () => updateDigPreview());
$('dig-random').addEventListener('click', () => {
  $('dig-seed').value = randomSeedCode();
  updateDigPreview();
});
$('dig-go').addEventListener('click', () => startDig(digSeed(), 'dig'));

// ---------------------------------------------------------------- starting a side

function startSide(track, kind, fromEl) {
  ensureAudio();
  lastPlay = { mode: kind, track };
  beginDrop(fromEl, track, () => launch(lastPlay));
}

function startDig(seed, kind) {
  ensureAudio();
  lastPlay = { mode: kind, seed };
  beginDrop(null, genDigTrack(seed, 0), () => launch(lastPlay));
}

function beginDrop(fromEl, track, then) {
  stopRadio(0.5);
  engine.swish(engine.now, false);
  ui.hideAll();
  screen = null;
  backStack.length = 0;
  renderer.setLabel(track, drawLabel(Math.round(renderer.layout.labelR * 2 * renderer.dpr), track, renderer.P));
  let from = null;
  if (fromEl) {
    const r = fromEl.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    from = { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2, s: r.width / (2 * renderer.layout.R) };
  }
  drop = { start: performance.now(), dur: store.settings().reducedMotion ? 350 : 900, from, then };
  mode = 'drop';
}

function launch(opts) {
  drop = null;
  mode = 'play';
  $('hud').hidden = false;
  play = new Play(app, opts);
  play.start();
}

function pausePlay() {
  if (!play || !play.pause()) return;
  $('hud').hidden = true;
  backStack.length = 0;
  go('scr-pause', false);
}

function resumePlay() {
  if (!play || play.state !== 'paused') return;
  ui.hideAll();
  screen = null;
  $('hud').hidden = false;
  engine.resume().then(() => play.resume());
}

$('btn-pause').addEventListener('click', () => pausePlay());
$('btn-mute').addEventListener('click', () => toggleMute());
$('pause-resume').addEventListener('click', () => resumePlay());
$('pause-restart').addEventListener('click', () => {
  play.quit();
  ui.hideAll();
  screen = null;
  engine.resume().then(() => launch(lastPlay));
});
$('pause-settings').addEventListener('click', () => {
  settingsUI.fill();
  go('scr-settings');
});
$('pause-quit').addEventListener('click', () => {
  play.quit();
  play = null;
  mode = 'menu';
  $('hud').hidden = true;
  engine.resume();
  backStack.length = 0;
  if (lastPlay.mode === 'side') {
    backStack.push('scr-title');
    ui.buildCrate(renderer.P, pickRecord);
    go('scr-crate', false);
  } else {
    updateTitle();
    go('scr-title', false);
  }
});

// ---------------------------------------------------------------- results

function finishSide(r) {
  mode = 'menu';
  $('hud').hidden = true;
  let newBest = false;
  let unlocked = null;
  let nextTrack = null;
  let daily = null;
  if (r.mode === 'side') {
    const rec = recordById(r.track.record);
    const idx = RECORDS.indexOf(rec);
    const wasUnlocked = RECORDS.map((_, i) => store.recordUnlocked(RECORDS, i));
    const res = store.recordResult(r.track.id, r);
    newBest = res.newBest;
    RECORDS.forEach((rr, i) => {
      if (!wasUnlocked[i] && store.recordUnlocked(RECORDS, i)) unlocked = rr;
    });
    const ti = rec.tracks.indexOf(r.track);
    nextTrack = rec.tracks[ti + 1] || (RECORDS[idx + 1] && store.recordUnlocked(RECORDS, idx + 1) ? RECORDS[idx + 1].tracks[0] : null);
  } else if (r.mode === 'tutorial') {
    store.setSetting('tutorialDone', true);
  } else {
    newBest = store.recordDig(r).newBest;
    if (r.mode === 'daily') daily = store.recordDaily(dateKey(), r);
  }
  lastResult = r;
  lastNext = nextTrack;
  ui.showResults(r, { newBest, unlocked, nextTrack, daily });
  engine.thump(engine.now + 0.05, 0.6, 50);
  backStack.length = 0;
  go('scr-results', false);
}

let lastResult = null;
let lastNext = null;
$('res-again').addEventListener('click', () => {
  ensureAudio();
  if (lastPlay.mode === 'side' || lastPlay.mode === 'tutorial') startSide(lastPlay.track, lastPlay.mode, null);
  else startDig(lastPlay.seed, lastPlay.mode);
});
$('res-next').addEventListener('click', () => {
  if (lastNext) startSide(lastNext, 'side', null);
});
$('res-back').addEventListener('click', () => {
  backStack.length = 0;
  if (lastResult?.mode === 'side') {
    backStack.push('scr-title');
    ui.buildCrate(renderer.P, pickRecord);
    go('scr-crate', false);
  } else {
    updateTitle();
    go('scr-title', false);
  }
});
$('res-copy').addEventListener('click', async () => {
  const text = `Needle Drop · Crate Dig seed ${lastResult.seed}: ${lastResult.records} records, ${lastResult.score} points`;
  const span = $('res-copy').querySelector('span');
  try {
    await navigator.clipboard.writeText(text);
    span.textContent = 'Copied!';
  } catch {
    span.textContent = `Seed: ${lastResult.seed}`;
  }
});

// ---------------------------------------------------------------- the loop

let lastFrame = 0;
function frame() {
  const now = performance.now();
  if (lastFrame && renderer.watchFrame(now - lastFrame) && play?.track) {
    renderer.setLabel(play.track, drawLabel(Math.round(renderer.layout.labelR * 2 * renderer.dpr), play.track, renderer.P));
  }
  lastFrame = now;
  renderer.resize();
  if (mode === 'play' && play && play.state !== 'done') {
    play.frame(now);
  } else if (mode === 'drop' && drop) {
    const k = Math.min(1, (now - drop.start) / drop.dur);
    renderer.drawMenu({ clock: now / 1000, pulse: 0, drop: k, from: drop.from });
    if (k >= 1) drop.then();
  } else {
    let pulse = 0;
    if (radioOn) {
      seq.tick();
      const t = engine.heardAt(now) - seq.songStart;
      const beat = Math.floor(t / radioSong.spb);
      if (beat !== lastBeat && t >= 0) {
        lastBeat = beat;
        if (!store.settings().reducedMotion) root.dataset.beat = String(beat % 2);
      }
      pulse = t >= 0 ? Math.exp(-((t / radioSong.spb) % 1) * 5) : 0;
    }
    input.pollGamepads();
    cal.frame();
    renderer.drawMenu({ clock: now / 1000, pulse });
  }
  requestAnimationFrame(frame);
}

// Wakes the scheduler while the page is visible but frames are slow; timing itself comes from ctx.currentTime.
setInterval(() => seq.tick(), 50);

// ---------------------------------------------------------------- page life

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (mode === 'play' && play && (play.state === 'playing' || play.state === 'countin')) pausePlay();
    engine.suspend();
  } else if (!(mode === 'play' && play?.state === 'paused')) engine.resume();
});
window.addEventListener('blur', () => {
  if (mode === 'play' && play && (play.state === 'playing' || play.state === 'countin')) pausePlay();
});
// first gesture anywhere wakes the audio and the shop radio
const wake = () => {
  ensureAudio();
  if (mode === 'menu' && screen !== 'scr-cal') startRadio();
};
window.addEventListener('pointerdown', wake, { once: true });
window.addEventListener('keydown', wake, { once: true });

function makeFavicon() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const P = renderer.P;
  g.fillStyle = P.pink;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = P.yellow;
  g.beginPath();
  g.arc(34, 34, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = P.ink;
  g.beginPath();
  g.arc(31, 31, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = P.yellow;
  g.beginPath();
  g.arc(31, 31, 10, 0, Math.PI * 2);
  g.fill();
  printText(g, 'N', 31, 32, { font: '13px Bungee, sans-serif', color: P.ink });
  try {
    $('favicon').href = c.toDataURL('image/png');
  } catch {
    /* keep the SVG one */
  }
}

async function boot() {
  try {
    await Promise.race([
      Promise.all(['40px Bungee', '700 20px Rubik', '500 20px Rubik', '400 20px Rubik'].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* system fonts will do */
  }
  input.setBindings(store.settings().bindings);
  renderer.resize();
  applyLook();
  updateTitle();
  makeFavicon();
  go('scr-title', false);
  requestAnimationFrame(frame);
}

// Handy for testing in the console.
window.needleDrop = {
  engine, seq, renderer, input, store, cal,
  get play() { return play; },
  get mode() { return mode; },
  get screen() { return screen; },
  startSide: (id, kind = 'side') => startSide(id === 'tutorial' ? TUTORIAL : RECORDS.flatMap((r) => r.tracks).find((t) => t.id === id), kind, null),
  startDig,
};
boot();
