// Keyboard, touch/mouse and gamepad input. Every press and release is queued with the
// moment it happened (event.timeStamp, on the performance.now() clock); the game converts
// that to song time through the audio engine's heard clock, so judging doesn't depend on
// when the next animation frame comes round.
//
// Lanes: 0 inner, 1 middle, 2 outer groove, 3 scratch.

export const DEFAULT_BINDINGS = { lanes: ['KeyF', 'KeyJ', 'KeyK'], scratch: 'Space' };
const SWIPE_PX = 26;
const GAMEPAD_LANES = [[2, 14], [0, 13], [1, 15]]; // X / D-left, A / D-down, B / D-right
const GAMEPAD_SCRATCH = [3, 4, 5, 6, 7, 12]; // Y, bumpers, triggers, D-up
const GAMEPAD_PAUSE = 9;

export function keyName(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = { Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', Enter: 'ENTER' };
  return names[code] || code.replace(/(Left|Right)$/, '').toUpperCase();
}

export class Input {
  constructor(canvas, { laneAt, onPause, onMute, onAnyKey }) {
    this.canvas = canvas;
    this.laneAt = laneAt;
    this.onPause = onPause;
    this.onMute = onMute;
    this.onAnyKey = onAnyKey;
    this.bindings = { ...DEFAULT_BINDINGS, lanes: [...DEFAULT_BINDINGS.lanes] };
    this.queue = [];
    this.down = [false, false, false, false];
    this.enabled = false; // only queue game input while a side is playing
    this.capture = null; // rebinding: function(code) that eats the next key
    this.pointers = new Map();
    this.padPrev = [];
    this.padAxisArmed = true;
    this.usedTouch = false;
    this.usedPad = false;

    window.addEventListener('keydown', (e) => this.keydown(e), { passive: false });
    window.addEventListener('keyup', (e) => this.keyup(e), { passive: false });
    canvas.addEventListener('pointerdown', (e) => this.pdown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.pmove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.pup(e), { passive: false });
    window.addEventListener('pointercancel', (e) => this.pup(e), { passive: false });
    window.addEventListener('blur', () => this.releaseAll(performance.now()));
  }

  setBindings(b) {
    this.bindings = { lanes: [...b.lanes], scratch: b.scratch };
  }

  laneForCode(code) {
    const i = this.bindings.lanes.indexOf(code);
    if (i >= 0) return i;
    if (code === this.bindings.scratch) return 3;
    return -1;
  }

  push(type, lane, perf) {
    if (!this.enabled) return;
    this.queue.push({ type, lane, perf });
  }

  keydown(e) {
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    const tag = e.target && e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.code === 'Escape' || (e.code === 'KeyP' && !typing)) {
      e.preventDefault();
      if (!e.repeat) this.onPause?.();
      return;
    }
    if (typing) return;
    if (e.code === 'KeyM' && !e.repeat && this.laneForCode('KeyM') < 0) {
      this.onMute?.();
      return;
    }
    const lane = this.laneForCode(e.code);
    if (lane >= 0 && this.enabled) {
      e.preventDefault();
      if (e.repeat || this.down[lane]) return;
      this.down[lane] = true;
      this.push('down', lane, e.timeStamp);
    } else if (!e.repeat) this.onAnyKey?.(e);
  }

  keyup(e) {
    const lane = this.laneForCode(e.code);
    if (lane < 0) return;
    if (this.enabled) e.preventDefault();
    if (!this.down[lane]) return;
    this.down[lane] = false;
    this.push('up', lane, e.timeStamp);
  }

  pdown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.usedTouch = true;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const lane = this.laneAt(x, y);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    this.pointers.set(e.pointerId, { lane, x, y, ax: x, ay: y, t: e.timeStamp, swiped: false, dist: 0 });
    this.down[lane] = true;
    this.push('down', lane, e.timeStamp);
  }

  pmove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    p.dist += Math.hypot(x - p.x, y - p.y);
    p.x = x;
    p.y = y;
    // a flick: enough travel since the last scratch counts as another scratch
    if (p.dist >= SWIPE_PX) {
      p.dist = 0;
      if (!p.swiped) {
        // a swipe isn't a hold: let go of the groove it started on
        p.swiped = true;
        if (this.down[p.lane]) {
          this.down[p.lane] = false;
          this.push('up', p.lane, e.timeStamp);
        }
      }
      this.push('down', 3, e.timeStamp);
      this.push('up', 3, e.timeStamp);
    }
  }

  pup(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (!p.swiped && this.down[p.lane]) {
      const still = [...this.pointers.values()].some((q) => q.lane === p.lane && !q.swiped);
      if (!still) {
        this.down[p.lane] = false;
        this.push('up', p.lane, e.timeStamp);
      }
    }
  }

  releaseAll(perf) {
    for (let i = 0; i < 4; i++) {
      if (this.down[i]) {
        this.down[i] = false;
        this.push('up', i, perf);
      }
    }
    this.pointers.clear();
  }

  /** Poll gamepads once per frame (they have no events for buttons). */
  pollGamepads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const now = performance.now();
    for (const pad of pads) {
      if (!pad) continue;
      const prev = this.padPrev[pad.index] || [];
      const cur = pad.buttons.map((b) => b.pressed || b.value > 0.5);
      const edge = (i) => cur[i] && !prev[i];
      const fall = (i) => !cur[i] && prev[i];
      if (cur.some(Boolean)) this.usedPad = true;
      GAMEPAD_LANES.forEach((btns, lane) => {
        const isDown = btns.some((b) => cur[b]);
        if (isDown && !this.down[lane]) {
          this.down[lane] = true;
          this.push('down', lane, now);
        } else if (!isDown && this.down[lane] && btns.some((b) => fall(b))) {
          this.down[lane] = false;
          this.push('up', lane, now);
        }
      });
      if (GAMEPAD_SCRATCH.some((b) => edge(b))) {
        this.push('down', 3, now);
        this.push('up', 3, now);
      }
      // a flick of either stick also scratches
      const mag = Math.max(Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0), Math.hypot(pad.axes[2] || 0, pad.axes[3] || 0));
      if (mag > 0.75 && this.padAxisArmed) {
        this.padAxisArmed = false;
        this.push('down', 3, now);
        this.push('up', 3, now);
      } else if (mag < 0.35) this.padAxisArmed = true;
      if (edge(GAMEPAD_PAUSE)) this.onPause?.();
      this.padPrev[pad.index] = cur;
    }
  }

  drain() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
