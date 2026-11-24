// Stage 1 harness: play any track through the engine and sequencer.
import { AudioEngine } from './audio/engine.js';
import { Sequencer } from './audio/sequencer.js';
import { buildSong } from './audio/compose.js';
import { TRACKS, TUTORIAL, RADIO } from './tracks.js';

const engine = new AudioEngine();
const seq = new Sequencer(engine);
const list = document.getElementById('list');
const status = document.getElementById('status');
let played = 0;
seq.onEvent = () => { played++; };

for (const t of [RADIO, TUTORIAL, ...TRACKS]) {
  const b = document.createElement('button');
  b.textContent = `${t.title} (${t.genre}, ${t.bpm})`;
  b.onclick = () => {
    engine.init();
    engine.setCrackle(0.4);
    const song = buildSong(t);
    seq.load(song, { loop: t === RADIO });
    seq.start(0, engine.now + 0.1);
  };
  list.append(b, document.createElement('br'));
}
const stop = document.createElement('button');
stop.textContent = 'Stop';
stop.onclick = () => seq.stop();
list.append(stop);

function frame() {
  seq.tick();
  if (seq.running) status.textContent = `song time ${seq.songTime().toFixed(2)} s, events scheduled ${played}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => seq.tick(), 50); // wake-up only; timing comes from ctx.currentTime
window.nd = { engine, seq, buildSong, TRACKS, TUTORIAL, RADIO, AudioEngine };
