# Needle Drop

A rhythm game played on a spinning vinyl record: tap, hold and scratch the notes printed on its grooves as they come round to the needle.

**Play:** https://gorzawebk.github.io/Needle-Drop/

Plays on PC (keyboard or gamepad) and on phones and tablets (touch, portrait or landscape). Everything is made in code: the music, the sound effects, the record, the sleeves, the print effects and the favicon. There are no image or audio files.

> "Needle Drop" is a working title.

## Controls

| Input | Action |
| --- | --- |
| F | Inner groove (drums) |
| J | Middle groove (bass) |
| K | Outer groove (melody) |
| Space | Scratch |
| Esc (or P) | Pause / resume (resuming counts you back in for 3 beats) |
| M | Mute |

F, J, K and Space can be changed in **Settings → Keys**.

**Touch:** the record is split into three rings. Tap the inner, middle or outer ring for that groove (anywhere outside the record counts as the outer ring), keep your finger down for holds, and swipe anywhere for a scratch.

**Gamepad:** X / A / B (or D-pad left / down / right) for the three grooves; Y, a bumper, a trigger or a flick of either stick to scratch; Start pauses.

## How to play

The record spins in the middle of the screen with the tonearm's needle at 12 o'clock. Notes are printed on the record's three grooves and ride round with it, clockwise, to the needle. Hit each one as it passes under the needle.

- **Tap** notes: press once. Each groove has its own shape, so they never rely on colour alone: **circles** on the inner groove, **triangles** on the middle, **squares** on the outer.
- **Hold** notes: a long arc on a groove. Press when it arrives and keep holding until the arc ends.
- **Scratch** notes: a zig-zag across all three grooves. Press Space or swipe as it passes.

Every note comes from the music itself. The inner groove plays the drums (kick, snare, clap), the middle the bass line and the outer the melody (or the chords where there's no melody). Long bass and melody notes become holds. Scratches land on the DJ cuts, where the drums drop out for a beat.

### Timing and score

| Judgement | Window | Points |
| --- | --- | --- |
| PERFECT | within 45 ms | 300 |
| GOOD | within 90 ms | 200 |
| EARLY / LATE | within 135 ms | 100 |
| MISS | outside that, or not pressed | 0 |

Scratches get a bit more room (65 / 120 / 170 ms). A hold you keep down to the end adds 150; letting go early drops it. Each judgement thumps onto the record as a printed stamp.

The **combo** builds a multiplier: ×2 at 10 hits in a row, ×3 at 25 and ×4 at 50. A miss resets it.

The **groove meter** under the record fills as you hit and drains when you miss. When it runs dry, the **record skips** (the music stutters and the needle jumps). Three skips and the side is over.

Each side ends with a **rank** from accuracy: **S** 95%+, **A** 88%+, **B** 78%+, **C** 65%+, otherwise **D** (and always D if the record skipped out).

### Records and modes

- **Dig the crate:** three records of four sides each, about 90 seconds a side.
  - *Sunny Side Up* (Easy): lo-fi, boom-bap, one-drop reggae and funk (86–104 BPM).
  - *Mirrorball Margins* (Normal): disco, house, UK garage and electro (117–130 BPM).
  - *Riso Riot* (Hard): big beat, rave hardcore, jungle and drum & bass (138–174 BPM).

  The first record is open. Clear 3 sides of a record to unlock the next.
- **Crate Dig:** endless records nobody has heard before, invented from a seed (type one in or shuffle). Records last about a minute and get faster and harder as you dig: Easy for the first two, Normal for the next three, then Hard. Score, combo and skips carry over from record to record.
- **Today's dig:** Crate Dig with the seed for today's date, so everyone digs the same crate on the same day. Your first finished dig of the day is your daily result; later digs that day only raise your best.
- **How to play:** a practice side that teaches each groove, holds and scratches one at a time, with words on screen. It can't fail.

Best scores, ranks, full combos, unlocks, Crate Dig bests, daily results and settings are saved in `localStorage` (wrapped in try/catch, so the game still works where storage is blocked).

## Settings

- Music, effects & crackle, and hit-sound volumes; mute.
- **Reduced motion:** turns off the shake, the misprint wobble, the flashing and the beat pulses. It is on by default if your system asks for reduced motion.
- **High-contrast colours:** a paper-white background with deep navy ink and outlined notes.
- **Note symbols:** a pattern on every note (a dot, two bars or a cross) and the key letters by the needle.
- Note speed (×0.7 to ×1.5).
- Key bindings.
- Input offset and visual offset, plus **Calibrate**: tap along to a click (four to get the feel, sixteen measured). The median difference becomes your input offset. A flashing pad helps you set the visual offset.

## Look and sound

- **Print:** a loud risograph poster in three inks on paper: fluorescent pink `#ff48b0`, navy `#1c2373` and lemon yellow `#ffe800` (plus paper `#fff3e8` and a deeper pink `#e8268c`). They are all CSS variables, and the canvas reads them from there. Halftone dots, paper grain, colour plates printed 1–2 px out of register, and notes cut like stickers that "boil" a little from frame to frame. No black backgrounds, no orange, no glow: inks never mix into new colours, not even in the dimmed overlays.
- **Type:** Bungee for titles and stamps, Rubik for reading. Both are bundled with @fontsource (Latin subsets), so nothing loads from a font CDN.
- **The record shop:** the menus are price-sticker buttons. Pick a record from the crate, it slides out of its sleeve to show the tracklist, and when you pick a side it drops onto the turntable. Every sleeve and centre label is generated from a seed: bold shapes, halftone, a made-up label name and catalogue number, and a worn ring where the record presses through the card.
- **On the beat:** the sunburst behind the record, the stamps, the multiplier sticker and the menu buttons all pulse with the music. In the menus the shop radio plays.
- **Music:** made with the Web Audio API by a small sequencer. Each genre has its own drum patterns, swing, drum kit, bass, chord and lead instruments and effects (tape wow and low-pass for lo-fi, echo for reggae and house, drive for big beat). Each track is composed from its tempo, key, chord progression and seed: intro, verses, choruses, breakdown and outro.
- **Sound effects:** woody hit ticks pitched per groove, a vinyl crackle layer, real scratches (a generated "aah" sample read back at the speed of a moving hand), a needle dragged across the record on a miss, a needle-drop thump and count-in clicks.

## How it's built

- Plain JavaScript modules, HTML5 Canvas 2D and [Vite](https://vite.dev). No framework, no 3D. The only runtime dependencies are the two @fontsource fonts.
- **One source of truth for music and notes:** the composer turns a track into a list of events with exact times. The sequencer plays that list and the chart generator picks notes from the very same list, so a note always sits on a sound. Difficulty only decides *which* events become notes (grid, spacing, chords, holds), never *when*. Unit tests check every note against its event, and a test render confirmed each note's sound starts where its note is.
- **Timing:** everything is scheduled on `AudioContext.currentTime` with a 300 ms look-ahead. `setInterval` only wakes the scheduler; nothing is timed with it. Presses are stamped with the event's own `timeStamp`, and both drawing and judging use the **heard clock** (`getOutputTimestamp()`, so output latency is already allowed for), corrected by the calibrated offsets and the limiter's measured 6 ms look-ahead.
- **Pause:** the game pauses when the tab is hidden or the page loses focus (e.g. a click outside the iframe). Resume rewinds to the last beat and counts in for 3 beats.
- **Iframe-friendly:** no ads, no popups (no `alert`/`confirm`), no fullscreen, and no reaching into the parent page. It sizes itself to whatever box it is given, and game keys don't scroll the host page.
- **Performance:** the background is drawn once onto its own canvas. The record, label, sheen, note stickers and stamps are pre-rendered sprites, so a frame is mostly `drawImage` calls (about 0.5 ms of JavaScript). Pixel ratio is capped at 2 and drops automatically to 1.5, then 1, if frames run slow.

| File | What it does |
| --- | --- |
| `src/main.js` | Start-up, screens of the record shop, shop radio, drop onto the turntable, pause and results |
| `src/play.js` | A side on the turntable: count-in, judging against the heard clock, feedback, Crate Dig chaining |
| `src/game.js` | One side's notes and state: presses, releases, scratches, holds, misses (pure logic) |
| `src/judge.js` | Timing windows, points, combo multiplier, groove meter and skips, ranks |
| `src/chart.js` | Chart generation from the song's events, per difficulty |
| `src/tracks.js` | The three records and their twelve sides, the tutorial, the shop radio and the Crate Dig generator |
| `src/audio/genres.js` | Genre templates: drum patterns, bass/chord/lead rhythms, kits, presets, effects and mix |
| `src/audio/compose.js` | The composer: track spec → timed musical events |
| `src/audio/sequencer.js` | Look-ahead scheduler mapping song time onto the AudioContext clock |
| `src/audio/synth.js` | Synthesised drums and instrument presets; generated crackle, scratch and reverb buffers |
| `src/audio/engine.js` | AudioContext, buses and effects chain, sound effects, the heard clock |
| `src/render.js` | Canvas renderer: backdrop, sunburst, record, notes, needle, stamps, particles, HUD |
| `src/print.js` | Print effects: halftone, grain, hand-cut shapes, misregistered text, stickers |
| `src/sleeve.js` | Generated sleeves and centre labels |
| `src/ui.js` | DOM screens: crate, tracklist, results, settings, calibration |
| `src/input.js` | Keyboard, touch rings and swipes, gamepad; rebindable keys |
| `src/storage.js` | Settings, bests, unlocks, Crate Dig and daily results (localStorage) |
| `src/rng.js` | Seeded random numbers (cyrb128 + sfc32), seed codes and the daily seed |
| `src/style.css` | Palette variables, price stickers, crate, panels, high-contrast and reduced-motion rules |
| `tests/` | Vitest tests for chart generation, timing judgement, scoring, the session, the composer, seeds and saving |

### Decisions made along the way

The brief asked for a game that looks, sounds and feels unlike the six existing GorzaWebK games. These are the changes made for that, and other choices:

- **Yellow:** the brief's `#ffd400` sits right among the warm golds four of the other games already use as accents (`#ffcf33`, `#ffcf3f`, `#ffd23f`, `#ffd24d`, `#ffd25a`, `#ffd36b`). Needle Drop uses a cooler riso lemon, `#ffe800`.
- **Pink:** a riso fluorescent pink, `#ff48b0`, used as a flat printed background. It is not Orb Dash's glowing magenta on black.
- **Stamps and paper:** Paper Tides already has ink-stamp buttons, torn paper and double-drawn wobbly ink outlines. Here the judgement "stamps" are printed sticker labels (flat ink, misregistered plates, halftone shadow), the buttons are record-shop price stickers, and nothing has outlines (except in high-contrast mode).
- **Music:** the other games' soundtracks are pad and arpeggio loops that build with speed. Needle Drop's are drum-led genre tracks with song structure, and avoid the Am–F–C–G loop.
- **Middle-groove notes are triangles**, not diamonds: once the record turns, a diamond just looks like a rotated square.
- **Each record has a fixed difficulty** (Easy, Normal, Hard), as the brief describes. Charts for every difficulty exist for every track.
- **Unlocks:** clear 3 of a record's 4 sides to open the next one. Add `?unlock=all` to the URL to open everything (handy for testing).
- **No penalty for stray presses.** A press with no note nearby does nothing, so swipes and nervous taps aren't punished.
- **The daily seed** uses the player's local date, like Paper Tides' Daily Island.

## Running locally

```bash
npm install
npm run dev        # dev server at http://localhost:5173 (also on your LAN for phone testing)
npm test           # Vitest unit tests
npm run build      # static site in dist/
npm run preview
```

Testing helpers: `window.needleDrop` in the console gives you the `engine`, `seq`, `renderer`, `store`, the current `play`, `startSide(id)` and `startDig(seed, 'dig')`.

## Deployment

Every push to `main` runs the tests, builds the game and publishes it to GitHub Pages via `.github/workflows/deploy.yml`. One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
