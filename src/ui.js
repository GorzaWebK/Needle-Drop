// The record shop's DOM: screens, the crate of sleeves, the tracklist on the back of a
// sleeve, results, settings and calibration. Game logic lives elsewhere; this file only
// builds and wires the page and calls back into main.js.

import { drawSleeve } from './sleeve.js';
import { RECORDS, DIFFICULTIES } from './tracks.js';
import { GENRES } from './audio/genres.js';
import * as store from './storage.js';
import { keyName } from './input.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['scr-title', 'scr-crate', 'scr-record', 'scr-dig', 'scr-results', 'scr-pause', 'scr-settings', 'scr-cal'];

export function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  if (id) {
    const first = $(id).querySelector('[data-autofocus], .tag.big, .sleeve:not(.locked), .side, .tag');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }
}

export function hideAll() {
  for (const s of SCREENS) $(s).hidden = true;
}

export function announce(text) {
  $('live').textContent = text;
}

function paintCanvas(canvas, src) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(src, 0, 0, canvas.width, canvas.height);
}

/** A record disc for the DOM (the part that slides out of the sleeve). */
export function drawDisc(canvas, info, P, labelCanvas) {
  const g = canvas.getContext('2d');
  const s = canvas.width;
  const r = s / 2;
  g.clearRect(0, 0, s, s);
  g.fillStyle = P.ink;
  g.beginPath();
  g.arc(r, r, r * 0.98, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = P.groove;
  g.lineWidth = 1;
  for (let rr = r * 0.36; rr < r * 0.95; rr += 3) {
    g.beginPath();
    g.arc(r, r, rr, 0, Math.PI * 2);
    g.stroke();
  }
  if (labelCanvas) g.drawImage(labelCanvas, r - r * 0.34, r - r * 0.34, r * 0.68, r * 0.68);
  g.fillStyle = P.paper;
  g.beginPath();
  g.arc(r, r, r * 0.03, 0, Math.PI * 2);
  g.fill();
  void info;
}

// ---------------------------------------------------------------- crate

export function buildCrate(P, onPick) {
  const crate = $('crate');
  crate.textContent = '';
  RECORDS.forEach((rec, i) => {
    const unlocked = store.recordUnlocked(RECORDS, i);
    const cleared = store.clearedCount(rec);
    const b = document.createElement('button');
    b.className = 'sleeve' + (unlocked ? '' : ' locked');
    b.setAttribute('aria-label', `${rec.title} by ${rec.artist}, ${DIFFICULTIES[rec.difficulty].name}${unlocked ? `, ${cleared} of 4 sides cleared` : ', locked'}`);
    const cv = document.createElement('canvas');
    cv.width = 360;
    cv.height = 360;
    paintCanvas(cv, drawSleeve(360, { ...rec, palette: i === 0 ? 1 : i === 1 ? 2 : 3, style: ['sunburst', 'dots', 'stripes'][i] }, P));
    const info = document.createElement('span');
    info.className = 'sleeve-info';
    info.innerHTML = `<span><b>${rec.title}</b><br>${rec.artist}</span><span>${DIFFICULTIES[rec.difficulty].name}<br>${cleared}/4 cleared</span>`;
    b.append(cv, info);
    if (!unlocked) {
      const note = document.createElement('span');
      note.className = 'lock-note';
      const prev = RECORDS[i - 1];
      note.innerHTML = `Locked<small>Clear ${store.CLEARS_TO_UNLOCK} sides of “${prev.title}” (${store.clearedCount(prev)}/${store.CLEARS_TO_UNLOCK})</small>`;
      b.append(note);
      b.setAttribute('aria-disabled', 'true');
    }
    b.addEventListener('click', () => {
      if (!unlocked) {
        b.animate([{ translate: '-6px 0' }, { translate: '6px 0' }, { translate: '0 0' }], { duration: 220 });
        return;
      }
      onPick(rec, i, cv);
    });
    crate.append(b);
  });
}

// ---------------------------------------------------------------- one record

export function showRecord(rec, index, P, label, onSide) {
  $('rec-heading').textContent = rec.title;
  $('rec-meta').innerHTML = `<b>${rec.artist}</b> · ${rec.label} · ${rec.catNo} · <b>${DIFFICULTIES[rec.difficulty].name}</b><br>${rec.blurb}`;
  paintCanvas($('rec-sleeve'), drawSleeve(400, { ...rec, palette: index === 0 ? 1 : index === 1 ? 2 : 3, style: ['sunburst', 'dots', 'stripes'][index] }, P));
  drawDisc($('rec-disc'), rec, P, label);
  const stack = $('sleeve-stack');
  stack.classList.remove('dropping');
  // restart the slide-out
  const disc = $('rec-disc');
  disc.style.animation = 'none';
  void disc.offsetWidth;
  disc.style.animation = '';
  const list = $('rec-sides');
  list.textContent = '';
  for (const t of rec.tracks) {
    const best = store.bestFor(t.id);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'side';
    const rank = best?.rank;
    b.innerHTML = `<span class="side-id">${t.side}</span>
      <span><span class="side-title">${t.title}</span><span class="side-sub">${GENRES[t.genre].name} · ${t.bpm} BPM</span></span>
      <span class="side-best">${rank ? `<span class="rank-badge r-${rank}">${rank}</span>` : '<span class="rank-badge none">new</span>'}<br>${best ? best.score.toLocaleString() : ''}${best?.fullCombo ? ' ★' : ''}</span>`;
    b.setAttribute('aria-label', `Side ${t.side}: ${t.title}, ${GENRES[t.genre].name}, ${t.bpm} BPM${rank ? `, best rank ${rank}, ${best.score} points` : ', not played yet'}`);
    b.addEventListener('click', () => onSide(t));
    li.append(b);
    list.append(li);
  }
}

// ---------------------------------------------------------------- results

export function showResults(r, { newBest, unlocked, nextTrack, daily }) {
  const isDig = r.mode === 'dig' || r.mode === 'daily';
  const stamp = $('res-rank');
  stamp.className = 'rank-stamp';
  if (isDig) {
    stamp.textContent = `${r.records}`;
    stamp.classList.add('r-A');
    stamp.setAttribute('aria-label', `${r.records} records dug`);
  } else {
    stamp.textContent = r.rank;
    stamp.classList.add(`r-${r.rank}`);
    stamp.setAttribute('aria-label', `Rank ${r.rank}`);
  }
  // restart the slam
  stamp.style.animation = 'none';
  void stamp.offsetWidth;
  stamp.style.animation = '';
  $('res-new').hidden = !newBest;
  const t = r.track;
  if (isDig) {
    $('res-title').textContent = r.mode === 'daily' ? "Today's dig is done" : 'The dig is over';
    $('res-sub').textContent = `${r.records} record${r.records === 1 ? '' : 's'} cleared · seed ${r.seed}`;
  } else if (r.mode === 'tutorial') {
    $('res-title').textContent = 'Lesson learned!';
    $('res-sub').textContent = 'You know the grooves. The crate is waiting.';
  } else {
    $('res-title').textContent = r.failed ? 'Skipped out!' : r.fullCombo ? 'Full combo!' : 'Side cleared!';
    $('res-sub').textContent = `${t.side} · ${t.title} · ${DIFFICULTIES[r.difficulty].name}`;
  }
  $('res-score').textContent = r.score.toLocaleString();
  const c = r.counts;
  const rows = [
    ['Perfect', c.perfect], ['Good', c.good], ['Early', c.early], ['Late', c.late], ['Miss', c.miss],
    ['Holds', `${c.holdOk}/${c.holdOk + c.holdDrop}`], ['Max combo', r.maxCombo], ['Accuracy', `${(r.acc * 100).toFixed(1)}%`],
  ];
  $('res-stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  let note = '';
  if (unlocked) note = `New record in the crate: “${unlocked.title}”!`;
  else if (r.failed && !isDig) note = 'Three skips ends the side. Missing notes drains the groove meter; hits fill it back up.';
  if (daily) note += `${note ? ' ' : ''}Today's first result: ${daily.first.toLocaleString()} · best today: ${daily.best.toLocaleString()}.`;
  $('res-note').textContent = note;
  $('res-next').hidden = !nextTrack;
  $('res-copy').hidden = !isDig;
  $('res-back').querySelector('span').textContent = isDig || r.mode === 'tutorial' ? 'Back to the shop' : 'Back to the crate';
  $('res-again').querySelector('span').textContent = isDig ? 'Dig again' : 'Play again';
  announce(isDig ? `Dig over. ${r.records} records, ${r.score} points.` : `Rank ${r.rank}. ${r.score} points.`);
}

// ---------------------------------------------------------------- settings

export function bindSettings(onChange) {
  const form = $('settings-form');
  const s = store.settings();
  const fmtMs = (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ms`;
  const outputs = () => {
    $('out-scroll').textContent = `×${Number(form.scroll.value).toFixed(2)}`;
    $('out-input').textContent = fmtMs(Number(form.inputOffset.value));
    $('out-visual').textContent = fmtMs(Number(form.visualOffset.value));
  };
  const fill = () => {
    const cur = store.settings();
    for (const el of form.elements) {
      if (!el.name || !(el.name in cur)) continue;
      if (el.type === 'checkbox') el.checked = !!cur[el.name];
      else el.value = cur[el.name];
    }
    outputs();
    renderBinds();
  };
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.name) return;
    const v = el.type === 'checkbox' ? el.checked : Number(el.value);
    store.setSetting(el.name, v);
    outputs();
    onChange(el.name, v);
  });

  const labels = ['Inner groove', 'Middle groove', 'Outer groove', 'Scratch'];
  function renderBinds() {
    const b = store.settings().bindings;
    const codes = [...b.lanes, b.scratch];
    const box = $('binds');
    box.textContent = '';
    codes.forEach((code, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bind';
      btn.innerHTML = `${labels[i]}<b>${keyName(code)}</b>`;
      btn.setAttribute('aria-label', `${labels[i]}: ${keyName(code)}. Press to change.`);
      btn.addEventListener('click', () => {
        btn.classList.add('listening');
        btn.querySelector('b').textContent = 'press a key…';
        onChange('rebind', { index: i, done: renderBinds });
      });
      box.append(btn);
    });
  }

  const reset = $('reset-progress');
  let armed = false;
  reset.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      reset.classList.add('armed');
      reset.querySelector('span').textContent = 'Press again to wipe scores';
      setTimeout(() => {
        armed = false;
        reset.classList.remove('armed');
        reset.querySelector('span').textContent = 'Reset progress';
      }, 4000);
      return;
    }
    armed = false;
    reset.classList.remove('armed');
    reset.querySelector('span').textContent = 'Progress wiped';
    store.resetProgress();
    onChange('reset', true);
  });
  void s;
  return { fill };
}

// ---------------------------------------------------------------- calibration

/**
 * Tap-along calibration: a click every 0.6 s (100 BPM). The first 4 are a lead-in; taps on
 * the next 16 are measured against the heard click times. The median difference becomes the
 * input offset. The pad flashes on each click, shifted by the visual offset slider.
 */
export class Calibration {
  constructor(engine, onSave) {
    this.engine = engine;
    this.onSave = onSave;
    this.active = false;
    this.spb = 0.6;
    this.clicks = [];
    this.next = 0;
    this.offsets = [];
    this.measuring = false;
    this.result = null;
    $('cal-start').addEventListener('click', () => this.start());
    $('cal-save').addEventListener('click', () => {
      if (this.result !== null) this.onSave(Math.round(this.result));
      $('cal-save').disabled = true;
      $('cal-result').textContent = `Saved: input offset ${this.fmt(this.result)}.`;
    });
    $('cal-pad').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.tap(e.timeStamp);
    });
    const vis = $('cal-vis');
    vis.addEventListener('input', () => {
      store.setSetting('visualOffset', Number(vis.value));
      $('cal-vis-out').textContent = this.fmt(Number(vis.value));
    });
  }

  fmt(v) {
    return `${v > 0 ? '+' : ''}${Math.round(v)} ms`;
  }

  open() {
    this.active = true;
    this.measuring = false;
    this.clicks = [];
    this.next = this.engine.now + 0.4;
    this.index = 0;
    $('cal-vis').value = store.settings().visualOffset;
    $('cal-vis-out').textContent = this.fmt(store.settings().visualOffset);
    $('cal-marks').textContent = '';
    $('cal-count').textContent = 'TAP';
    $('cal-save').disabled = true;
    const cur = store.settings().inputOffset;
    $('cal-result').textContent = `Current input offset: ${this.fmt(cur)}${store.settings().calibrated ? '' : ' (not calibrated yet)'}.`;
  }

  close() {
    this.active = false;
    this.measuring = false;
  }

  start() {
    this.measuring = true;
    this.offsets = [];
    this.result = null;
    this.startIndex = this.index + 4; // four clicks to get the feel
    $('cal-marks').textContent = '';
    $('cal-save').disabled = true;
    $('cal-result').textContent = 'Listen… then tap along.';
    $('cal-start').querySelector('span').textContent = 'Restart';
  }

  /** A tap (any key or the pad), with its event timestamp. */
  tap(perf) {
    if (!this.active) return;
    $('cal-pad').animate([{ translate: '0 4px' }, { translate: '0 0' }], { duration: 120 });
    if (!this.measuring) return;
    const heard = this.engine.heardAt(perf) - this.engine.outDelay;
    let best = null;
    for (const c of this.clicks) {
      if (c.i < this.startIndex) continue;
      const d = heard - c.t;
      if (Math.abs(d) < this.spb / 2 && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, c };
    }
    if (!best || best.c.tapped) return;
    best.c.tapped = true;
    const ms = best.d * 1000;
    this.offsets.push(ms);
    const mark = document.createElement('span');
    mark.style.left = `${50 + Math.max(-48, Math.min(48, ms / 4))}%`;
    if (Math.abs(ms) < 45) mark.className = 'ok';
    $('cal-marks').append(mark);
    $('cal-count').textContent = String(this.offsets.length);
    if (this.offsets.length >= 16) this.finish();
  }

  finish() {
    this.measuring = false;
    if (this.offsets.length < 6) {
      $('cal-count').textContent = 'TAP';
      $('cal-result').textContent = 'Not enough taps landed near the clicks. Try again: tap on every click.';
      $('cal-start').querySelector('span').textContent = 'Try again';
      return;
    }
    const sorted = this.offsets.slice().sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const spread = sorted[Math.floor(sorted.length * 0.8)] - sorted[Math.floor(sorted.length * 0.2)];
    this.result = med;
    $('cal-count').textContent = 'DONE';
    $('cal-result').textContent = `You tap ${Math.abs(Math.round(med))} ms ${med >= 0 ? 'late' : 'early'} on average (spread ±${Math.round(spread / 2)} ms). Use this as your input offset?`;
    $('cal-save').disabled = false;
    $('cal-start').querySelector('span').textContent = 'Try again';
  }

  /** Called every frame while the screen is open: schedule clicks ahead, flash the pad. */
  frame() {
    if (!this.active || !this.engine.ready) return;
    const now = this.engine.now;
    while (this.next < now + 0.25) {
      this.engine.click(this.next, this.index % 4 === 0);
      this.clicks.push({ t: this.next, i: this.index, tapped: false });
      if (this.clicks.length > 40) this.clicks.shift();
      this.next += this.spb;
      this.index++;
      if (this.measuring && this.index > this.startIndex + 22) this.finish();
    }
    const heard = this.engine.heardAt(performance.now()) - this.engine.outDelay - store.settings().visualOffset / 1000;
    let k = 0;
    for (const c of this.clicks) {
      const d = heard - c.t;
      if (d >= 0 && d < 0.15) k = Math.max(k, 1 - d / 0.15);
    }
    $('cal-flash').style.scale = String(0.2 + 0.8 * k);
    if (this.measuring && this.index <= this.startIndex) $('cal-count').textContent = String(Math.max(1, this.startIndex - this.index + 1));
  }
}
