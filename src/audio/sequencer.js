// Look-ahead sequencer. Song events carry exact times in seconds from the start of the song;
// the sequencer maps song time onto the AudioContext clock (songStart) and schedules every
// event a little ahead of when it is due. Nothing is ever timed with setTimeout: tick() can be
// called as often as you like (each animation frame, plus a wake-up interval) and it only
// looks at ctx.currentTime to decide what to schedule.

export const LOOKAHEAD = 0.3; // seconds scheduled ahead of the audio clock

export class Sequencer {
  constructor(engine) {
    this.engine = engine;
    this.song = null;
    this.songStart = 0;
    this.idx = 0;
    this.running = false;
    this.loop = false;
    this.session = null;
    this.onEvent = null; // optional hook: (event, when) for every scheduled event
  }

  load(song, { loop = false } = {}) {
    this.stop();
    this.song = song;
    this.loop = loop;
    this.engine.configureSong(song);
  }

  /** Start (or continue) the song so that song time `fromTime` plays at context time `atCtx`. */
  start(fromTime, atCtx) {
    if (!this.song || !this.engine.ready) return;
    if (this.session) this.session.kill(0.03);
    this.session = this.engine.newSession();
    this.songStart = atCtx - fromTime;
    const ev = this.song.events;
    let i = 0;
    while (i < ev.length && ev[i].t < fromTime - 1e-6) i++;
    this.idx = i;
    this.running = true;
    this.tick();
  }

  stop(fade = 0.04) {
    this.running = false;
    if (this.session) this.session.kill(fade);
    this.session = null;
  }

  /** Song time for a context time (defaults to now on the audio clock). */
  songTime(ctxTime = this.engine.now) {
    return ctxTime - this.songStart;
  }

  /** Context time at which song time `t` plays. */
  ctxTime(t) {
    return this.songStart + t;
  }

  tick() {
    if (!this.running || !this.song) return;
    const now = this.engine.now;
    const horizon = now + LOOKAHEAD;
    const ev = this.song.events;
    for (;;) {
      if (this.idx >= ev.length) {
        if (!this.loop) break;
        // seamless loop: drop the ending hit and start over one song-length later
        this.songStart += this.song.endTime;
        this.idx = 0;
      }
      const e = ev[this.idx];
      if (this.loop && e.t >= this.song.endTime - 1e-6) {
        this.idx = ev.length;
        continue;
      }
      const when = this.songStart + e.t;
      if (when > horizon) break;
      if (when >= now - 0.015) {
        this.engine.playEvent(e, Math.max(when, now), this.song, this.session);
        if (this.onEvent) this.onEvent(e, when);
      }
      this.idx++;
    }
  }
}
