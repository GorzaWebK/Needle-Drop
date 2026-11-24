// A side on the turntable: builds the song and chart, drops the needle, counts in, runs the
// session against the heard audio clock, turns judgements into sound and drawing, handles
// pause/resume (with a 3-beat count-in) and, in Crate Dig, pulls the next record.

import { buildSong, sectionAt } from './audio/compose.js';
import { buildChart } from './chart.js';
import { Session } from './game.js';
import { DIFFICULTIES, genDigTrack } from './tracks.js';
import { drawLabel } from './sleeve.js';
import { keyName } from './input.js';
import { accuracy } from './judge.js';

const COUNT_BEATS = 3;

export class Play {
  /**
   * app: { engine, seq, renderer, input, settings: () => settings, onFinish(result), palette: () => P }
   * opts: { mode: 'side' | 'tutorial' | 'dig' | 'daily', track, seed }
   */
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.mode = opts.mode;
    this.state = 'idle';
    this.digIndex = 0;
    this.digTotals = { perfect: 0, good: 0, early: 0, late: 0, miss: 0, holdOk: 0, holdDrop: 0 };
    this.digRecords = [];
    this.banner = null;
    this.spin = 1;
  }

  get isDig() {
    return this.mode === 'dig' || this.mode === 'daily';
  }

  start() {
    const track = this.isDig ? genDigTrack(this.opts.seed, 0) : this.opts.track;
    this.begin(track, {});
  }

  begin(track, carry) {
    const { engine, seq, renderer } = this.app;
    const s = this.app.settings();
    this.track = track;
    this.difficulty = track.difficulty || 'normal';
    this.song = buildSong(track);
    this.chart = buildChart(this.song, this.difficulty);
    this.session = new Session(this.chart, { difficulty: this.difficulty, carry, noFail: !!track.tutorial });
    this.approach = DIFFICULTIES[this.difficulty].approach / (s.scroll || 1);
    renderer.keyLabels = [...s.bindings.lanes.map(keyName), keyName(s.bindings.scratch)];
    renderer.setLabel(track, drawLabel(Math.round(renderer.layout.labelR * 2 * renderer.dpr), track, this.app.palette()));
    seq.load(this.song);
    engine.setCrackle((this.song.fx.crackle || 0.4) * 0.4, 0.5);
    const now = engine.now;
    engine.needleDrop(now + 0.05);
    this.countFrom(0, now + 0.45);
    this.ended = false;
  }

  /** Count in for 3 beats, then play from song time `fromT`, the first click at context time `at`. */
  countFrom(fromT, at) {
    const { engine, seq } = this.app;
    const spb = this.song.spb;
    const musicAt = at + COUNT_BEATS * spb;
    for (let i = 0; i < COUNT_BEATS; i++) engine.click(at + i * spb, i === 0);
    seq.start(fromT, musicAt);
    this.resumeT = fromT;
    this.countShown = -1;
    this.state = 'countin';
    this.app.input.enabled = true;
  }

  /** Song time as heard (for drawing). */
  heardSongTime(perf = performance.now()) {
    const { engine, seq } = this.app;
    return engine.heardAt(perf) - seq.songStart - (this.app.settings().visualOffset || 0) / 1000;
  }

  /** Song time on the judging timeline (heard time, corrected by the calibrated input offset). */
  judgeTime(perf) {
    const { engine, seq } = this.app;
    return engine.heardAt(perf) - seq.songStart - (this.app.settings().inputOffset || 0) / 1000;
  }

  frame(perfNow) {
    const { engine, seq, renderer, input } = this.app;
    if (this.state === 'idle' || this.state === 'done') return;
    input.pollGamepads();
    seq.tick();
    if (this.state === 'paused') {
      input.drain();
      this.draw(this.pausedDrawT ?? 0, perfNow);
      return;
    }
    const t = this.heardSongTime(perfNow);
    const tj = this.judgeTime(perfNow);
    const spb = this.song.spb;

    if (this.state === 'countin') {
      const k = Math.floor((t - (this.resumeT - COUNT_BEATS * spb)) / spb);
      if (k !== this.countShown && k >= 0) {
        this.countShown = k;
        renderer.showCount(k < COUNT_BEATS ? COUNT_BEATS - k : 'go');
      }
      if (t >= this.resumeT - 0.05) this.state = 'playing';
      input.drain();
    }

    if (this.state === 'playing') {
      for (const ev of input.drain()) {
        const et = this.judgeTime(ev.perf);
        if (ev.type === 'down') {
          renderer.onPress(ev.lane);
          this.handle(this.session.press(ev.lane, et), ev.lane);
        } else this.handle(this.session.release(ev.lane, et), ev.lane);
      }
      this.handle(this.session.update(tj));
      if (this.session.scorer.failed && !this.ended) this.fail(t);
      else if (this.session.done && !this.ended && t > this.song.endTime + 0.4) this.sideEnded();
    }

    if (this.state === 'ending') {
      input.drain();
      if (this.failing) this.spin = Math.max(0, this.spin - (perfNow - (this.lastPerf || perfNow)) / 1400);
      if (perfNow >= this.endAt) this.afterEnd();
    }
    this.lastPerf = perfNow;
    this.lastT = t;
    this.draw(t, perfNow);
  }

  draw(t, perfNow) {
    const { renderer, input } = this.app;
    const sc = this.session.scorer;
    const sec = sectionAt(this.song, Math.max(0, t));
    let text = this.banner && perfNow < this.banner.until ? this.banner.text : null;
    if (!text && this.track.tutorial && sec?.text) text = this.formatKeys(sec.text);
    const beatPos = t / this.song.spb;
    const pulse = this.state === 'playing' || this.state === 'countin' ? Math.exp(-(beatPos - Math.floor(beatPos)) * 5) : 0;
    const spinT = this.failing ? this.failT + (t - this.failT) * this.spin * 0.5 : t;
    renderer.drawPlay({
      clock: perfNow / 1000,
      t: this.state === 'paused' ? this.pausedDrawT : spinT,
      approach: this.approach,
      spb: this.song.spb,
      notes: this.session.notes,
      progress: Math.max(0, Math.min(1, t / this.song.endTime)),
      laneDown: input.down,
      pulse,
      text,
      armSwing: 1,
      hud: { score: sc.score, combo: sc.combo, mult: sc.multiplier, groove: sc.groove, skips: sc.skips, title: this.titleLine() },
    });
  }

  titleLine() {
    const t = this.track;
    const d = DIFFICULTIES[this.difficulty]?.name || '';
    if (this.isDig) return `RECORD ${this.digIndex + 1} · ${t.title} · ${t.bpm} BPM · ${d}`;
    return `${t.side} · ${t.title} · ${t.bpm} BPM · ${d}`;
  }

  formatKeys(text) {
    const b = this.app.settings().bindings;
    return text.replace('{0}', keyName(b.lanes[0])).replace('{1}', keyName(b.lanes[1])).replace('{2}', keyName(b.lanes[2])).replace('{S}', keyName(b.scratch));
  }

  handle(evs, lane = null) {
    const { engine, renderer, seq } = this.app;
    for (const e of evs) {
      if (e.type === 'judge') {
        renderer.onJudge(e);
        if (e.result === 'miss') engine.miss();
        else if (e.result === 'holdDrop') engine.miss();
        else if (e.lane === 3) engine.scratch(true);
        else if (e.hold === 'end') engine.hit(e.lane, 'good');
        else engine.hit(e.lane, e.result);
      } else if (e.type === 'ghost') {
        if (e.lane === 3) engine.scratch(false);
        else engine.hit(e.lane, 'ghost');
      } else if (e.type === 'skip') {
        renderer.onSkip();
        engine.stutter(seq.session, engine.now + 0.02, this.song.spb);
        engine.thump(engine.now, 0.5, 55);
      }
    }
    void lane;
  }

  fail(t) {
    const { engine, seq } = this.app;
    this.ended = true;
    this.failing = true;
    this.failT = t;
    this.state = 'ending';
    this.app.input.enabled = false;
    this.app.input.releaseAll(performance.now());
    engine.miss(engine.now);
    seq.stop(1.2);
    this.endAt = performance.now() + 1800;
  }

  sideEnded() {
    this.ended = true;
    this.state = 'ending';
    this.app.input.enabled = false;
    this.endAt = performance.now() + (this.isDig ? 700 : 1300);
  }

  afterEnd() {
    const { seq } = this.app;
    const sc = this.session.scorer;
    if (this.isDig) {
      for (const k of Object.keys(this.digTotals)) this.digTotals[k] += sc.counts[k];
      this.digRecords.push({ title: this.track.title, genre: this.track.genre, bpm: this.track.bpm, cleared: !sc.failed });
      if (!sc.failed) {
        // next record from the crate
        seq.stop(0.3);
        this.digIndex++;
        const next = genDigTrack(this.opts.seed, this.digIndex);
        this.begin(next, sc.carry());
        this.banner = { text: `Record ${this.digIndex + 1}: “${next.title}” by ${next.artist} (${next.bpm} BPM)`, until: performance.now() + 4000 };
        return;
      }
    }
    seq.stop(0.5);
    this.state = 'done';
    this.app.input.enabled = false;
    this.app.onFinish(this.result());
  }

  result() {
    const sc = this.session.scorer;
    const counts = this.isDig ? this.digTotals : sc.counts;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const misses = counts.miss + counts.holdDrop;
    const acc = this.isDig ? accuracy(counts) : sc.accuracy;
    return {
      mode: this.mode,
      track: this.track,
      difficulty: this.difficulty,
      score: sc.score,
      rank: this.isDig ? null : sc.rank,
      acc,
      counts,
      total,
      maxCombo: sc.maxCombo,
      failed: sc.failed,
      fullCombo: !sc.failed && misses === 0 && total > 0,
      records: this.isDig ? this.digRecords.filter((r) => r.cleared).length : 0,
      digRecords: this.digRecords,
      seed: this.opts.seed,
    };
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'countin') return false;
    const { seq, engine, input } = this.app;
    const tj = this.judgeTime(performance.now());
    this.pausedAt = this.state === 'countin' ? Math.min(tj, this.resumeT) : tj;
    this.pausedDrawT = this.heardSongTime();
    this.handle(this.session.settleHolds(tj));
    seq.stop(0.05);
    input.releaseAll(performance.now());
    input.drain();
    input.enabled = false;
    engine.setCrackle(0.12);
    this.state = 'paused';
    return true;
  }

  resume() {
    if (this.state !== 'paused') return;
    const { engine } = this.app;
    const spb = this.song.spb;
    // restart on the beat before where you stopped, after a 3-beat count-in
    const from = this.pausedAt <= 0 ? 0 : Math.max(0, Math.floor(this.pausedAt / spb) * spb);
    engine.setCrackle((this.song.fx.crackle || 0.4) * 0.4);
    this.countFrom(from, engine.now + 0.25);
  }

  quit() {
    this.app.seq.stop(0.2);
    this.app.input.enabled = false;
    this.state = 'done';
  }
}
