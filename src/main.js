// Stage 2 harness: one playable side. ?track=<id> picks the side.
import '@fontsource/bungee/400.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/rubik/700.css';
import './style.css';
import { AudioEngine } from './audio/engine.js';
import { Sequencer } from './audio/sequencer.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Play } from './play.js';
import { readPalette } from './print.js';
import * as store from './storage.js';
import { TRACKS, TUTORIAL, trackById } from './tracks.js';

store.load();
const canvas = document.getElementById('stage');
const engine = new AudioEngine();
const seq = new Sequencer(engine);
const renderer = new Renderer(canvas);
let play = null;
const input = new Input(canvas, {
  laneAt: (x, y) => renderer.laneAt(x, y),
  onPause: () => { if (play?.state === 'paused') engine.resume().then(() => play.resume()); else play?.pause(); },
  onMute: () => engine.setMuted(!engine.muted),
});

const app = {
  engine, seq, renderer, input,
  settings: () => store.settings(),
  palette: () => renderer.P,
  onFinish: (r) => { window.lastResult = r; document.getElementById('go').hidden = false; document.getElementById('go').textContent = `${r.rank} · ${r.score} · AGAIN?`; },
};

async function boot() {
  try { await Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('700 20px Rubik'), document.fonts.load('500 20px Rubik')]); } catch { /* fonts optional */ }
  renderer.setPalette(readPalette());
  renderer.resize();
  requestAnimationFrame(frame);
}

function frame(ts) {
  renderer.resize();
  if (play && play.state !== 'done') play.frame(performance.now());
  else renderer.drawMenu({ clock: performance.now() / 1000, pulse: 0 });
  requestAnimationFrame(frame);
}
setInterval(() => seq.tick(), 50); // wake-up only: scheduling is timed from ctx.currentTime

document.getElementById('go').onclick = () => {
  engine.init();
  const params = new URLSearchParams(location.search);
  const id = params.get('track') || 'pink-slip';
  const track = id === 'tutorial' ? TUTORIAL : trackById(id) || TRACKS[0];
  document.getElementById('go').hidden = true;
  play = new Play(app, { mode: 'side', track });
  play.start();
};
document.addEventListener('visibilitychange', () => { if (document.hidden) play?.pause(); });
window.needleDrop = { engine, seq, renderer, input, get play() { return play; }, store };
boot();
