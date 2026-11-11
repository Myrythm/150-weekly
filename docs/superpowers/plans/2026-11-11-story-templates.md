# Run Story Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the activity page of an imported run, the user opens a story page, picks one of six templates, a colour, an opacity, the numbers to show and their own photo, and exports a 1080x1920 PNG (static templates) or MP4 (animated templates) for an Instagram story.

**Architecture:** Everything runs in the browser. Pure modules in `app/src/story/` turn a session and its stored activity record into a story model (numbers, week figures, lanes, route) and draw it onto a 1080x1920 canvas as a function of `(state, t)`. The preview is that same canvas scaled by CSS, so preview and export cannot differ. Video export encodes the frames with WebCodecs through a muxing library loaded on demand, with fallbacks down to a still image.

**Tech Stack:** Vue 3, Pinia, Vue Router, Vitest with happy-dom, Canvas 2D, WebCodecs, Mediabunny (MPL-2.0, new dependency, dynamic import), Web Share API.

**Spec:** `docs/superpowers/specs/2026-11-11-story-templates-design.md`. Visual reference (proportions, colours, motion): `docs/superpowers/specs/2026-11-11-story-templates-mockup.html`. Read both before any task.

## Global Constraints

- Node 22.12 or newer. Run from the repo root. One Vitest file: `npx vitest run --config app/vite.config.mjs <path>`.
- No em dashes or en dashes anywhere (code, comments, copy, commits, docs).
- No Claude or Anthropic attribution in commits, code or docs.
- Commit steps run only once the owner has agreed to commits for this work. Work on a branch `feat/story-templates` cut from the current `feat/npm-run-dev` head.
- Interface colours only as tokens present in all three theme blocks of `app/src/styles/app.css`. The one exception (from the spec): colours drawn on the exported story live in `app/src/story/colors.js` only.
- Every control has a stable id. Visible focus. 400px wide with no horizontal scroll.
- All user and stored text through `{{ }}` or `textContent`, never `v-html`.
- `credit()` in `app/src/core/rules.js` is the only route for aerobic minutes; week figures on a story use `credit()` and `weekCredit()`.
- `w150.*` keys and shapes stay backward compatible: new fields with defaults, nothing renamed. Story settings go in `w150.prefs` as `story`.
- The photo never leaves the device: no upload, no storage, not in any saved value.
- No secret in `app/`. `grep -rE "service_role|SERVICE_ROLE" app/src app/index.html app/dist` returns nothing.
- For Mediabunny, fetch its current documentation before writing code against it (context7 when available, otherwise https://mediabunny.dev); do not code its API from memory. Pin the exact version installed.
- Delegation per `CLAUDE.md`: each task names a difficulty (Opus, Sonnet, Haiku). One agent at a time on the same file.
- Story text is English. Canvas is 1080x1920; nothing important above y 250 or below y 1580.
- After the work: append entry P to `docs/implementation-log.md` and update `docs/PROGRESS.md`.

## Review Focus

1. A GPX file with a route but no timestamps (no time, no pace, no splits): the story still opens, the main number falls back to distance, template C is unavailable with a reason. Pinned in Task 2 and Task 4.
2. Stored `prefs.story` that is old or broken (unknown template, opacity 250, a `kcal` number, nine small numbers, not an object): it loads as valid settings, never throws. Pinned in Task 2.
3. `/story/<id>` opened by direct URL for a session that is missing, not a run, logged by hand, or whose route is no longer stored: a plain "not available" state with a link back, no crash, no canvas. Pinned in Task 8.
4. A photo that is not an image, cannot be decoded, or is very large (48 megapixels): a plain message, the previous photo or background stays, memory is released. Pinned in Task 5.
5. Long numbers (a marathon: "42.20", time "4:05:33", pace "10:02"): text is shrunk to fit its box and never runs off the 1080 wide canvas, in every template. Pinned in Task 5 and Task 6.

---

## File Structure

| Path | Responsibility |
|---|---|
| `tools/story-spike/index.html` | Standalone video export test page for a phone (Task 1). Not part of the app build. |
| `app/src/story/numbers.js` | The eight numbers: formatting, availability, recommended set, settings sanitising. |
| `app/src/story/colors.js` | Story palette, text colour on a colour, highlight colour. |
| `app/src/story/model.js` | Eligibility, week figures, lanes, route path, template availability, `buildModel`. |
| `app/src/story/timeline.js` | Frame rate, duration, easing. |
| `app/src/story/draw.js` | Shared canvas helpers (fit text, photo cover, colour layer, number row). |
| `app/src/story/templates/{bib,clean,poster,splits,route,weeklap}.js` | One template each: `draw(ctx, state, t)`. |
| `app/src/story/render.js` | `drawStory(ctx, state, t)`: background, dispatch to a template. |
| `app/src/story/photo.js` | Decode and scale a photo file; cover rectangle math. |
| `app/src/story/export.js` | PNG, MP4 with fallbacks, share, download. |
| `app/src/pages/StoryPage.vue`, `app/src/components/StoryCanvas.vue`, `app/src/components/StoryControls.vue` | The page, the preview canvas, the controls. |
| `app/src/stores/data.js`, `app/src/router.js`, `app/src/pages/ActivityPage.vue`, `app/src/styles/app.css` | Settings in prefs, route, entry control, styles. |
| `app/test/story/*.test.js`, `app/test/story/fakeCtx.js`, `app/test/pages/story.test.js` | Tests. |

---

### Task 1: Video export spike on a real phone (Sonnet)

De-risks the spec's first risk before any template work depends on it. Tasks 2 to 6 and the PNG half of Task 7 do not wait for its result.

**Files:**
- Create: `tools/story-spike/index.html`

**Interfaces:**
- Produces: a written result in `docs/implementation-log.md` (entry P, first paragraph): for the owner's Android phone, which of `webcodecs`, `recorder`, `none` produced an MP4 that Instagram accepted. Task 7 reads it.

- [ ] **Step 1: Branch.** `git switch -c feat/story-templates`. Add `.superpowers/` to `.gitignore`.
- [ ] **Step 2: Write `tools/story-spike/index.html`**, one self contained file (inline CSS and JS, Mediabunny from `https://cdn.jsdelivr.net/npm/mediabunny@<pinned version>/+esm`). It must:
  - Draw a 1080x1920 test pattern as a function of `t` (a moving bar, a counter of the frame number in a large font, a 1 px grid) so sharpness and smoothness can be judged.
  - Button `#spike-webcodecs`: encode 150 frames (5 s at 30 fps) with H.264 into an MP4 through Mediabunny's canvas source, trying codec strings `avc1.640029`, then `avc1.64002A`, then `avc1.4d0029` via `VideoEncoder.isConfigSupported`, bitrate 8 Mbps. Fail with a message if no chunk arrives within 10 s.
  - Button `#spike-recorder`: real time `MediaRecorder` on `canvas.captureStream(30)` with the first supported of `video/mp4;codecs=avc1.640029`, `video/mp4;codecs=avc1`, `video/mp4`, at 8 Mbps.
  - After either: show path used, codec string, file size, time taken, a `<video>` of the result, and two buttons, `#spike-share` (calls `navigator.share({ files })` directly in the click handler, shown only when `navigator.canShare({ files })` is true) and `#spike-download`.
  - Show `navigator.userAgent`, `isSecureContext`, and whether `VideoEncoder` and `MediaRecorder` exist.
- [ ] **Step 3: Check it on desktop Chrome**: open the file from a local static server on `localhost`, press both buttons, confirm two playable 5 second MP4 files.
- [ ] **Step 4: Put it on an HTTPS address the phone can open.** WebCodecs needs a secure page, so the dev server's LAN address will not do. Ask the owner which they prefer: a private hosted page or a tunnel. Do not publish anything without their go-ahead.
- [ ] **Step 5: Owner test on Android Chrome.** For each button: file created, saved or shared to Instagram, posted as a story, plays its full 5 seconds, counter digits sharp. The owner reports the four results.
- [ ] **Step 6: Record the result** as the first paragraph of entry P in `docs/implementation-log.md`.
- [ ] **Step 7: Commit** `tools/story-spike/index.html`, `.gitignore`, the three files in `docs/superpowers/specs/` from 2026-11-11, this plan, `docs/PROGRESS.md`, `docs/implementation-log.md`. Message: `Add story export spike, story design and plan`.

---

### Task 2: Numbers and saved settings (Sonnet)

**Files:**
- Create: `app/src/story/numbers.js`, `app/test/story/numbers.test.js`
- Modify: `app/src/stores/data.js` (`defaultPrefs`, `load`, `clearAll`, new action, return list), `app/test/stores/data.test.js`

**Interfaces:**
- Produces, from `numbers.js`:
  - `NUMBER_KEYS = ['dist', 'time', 'pace', 'hr', 'best', 'maxhr', 'climb', 'cad']`, `HERO_KEYS = ['dist', 'time', 'pace']`, `RECOMMENDED_SMALL = ['time', 'pace', 'hr']`, `MAX_SMALL = 4`, `TEMPLATE_IDS = ['A', 'B', 'C', 'D', 'E', 'F']`
  - `DEFAULT_STORY_PREFS = { template: 'A', color: '#1E4FA0', opacity: 100, hero: 'dist', small: null }` (`small: null` means "the recommended set")
  - `numberValues(m) -> { [key]: { value: string, unit: string, label: string } | null }` for a stored metrics object
  - `resolveNumbers(prefs, values) -> { hero: string, small: string[] }`
  - `toggleSmall(prefs, key, values) -> prefs` (returns a new object; `small` becomes an explicit array)
  - `sanitizeStoryPrefs(raw) -> prefs` (always a full valid object)
- Produces, from the data store: `data.prefs.story` (always sanitised) and `data.setStoryPrefs(patch)` which merges, sanitises and persists.

Formatting, to match `ActivityStats.vue` exactly:

| key | value | unit (after the main number) | label (under a small number) | source |
|---|---|---|---|---|
| dist | `(distanceM / 1000).toFixed(2)`, or rounded metres under 1000 | `KM` or `M` | `KM` or `M` | `distanceM` |
| time | `GPX.fmtDuration(movingS)` | `TIME` | `TIME` | `movingS` |
| pace | `fmtMinSec(avgPaceSPerKm)` | `/KM` | `PACE /KM` | `avgPaceSPerKm` |
| hr | rounded | `BPM` | `AVG BPM` | `avgHr` |
| best | `fmtMinSec(bestKmPaceS)` | `/KM` | `BEST KM` | `bestKmPaceS` |
| maxhr | rounded | `BPM` | `MAX BPM` | `maxHr` |
| climb | `'+' + Math.round(elevGainM)` | `M` | `CLIMB M` | `elevGainM` |
| cad | rounded | `SPM` | `SPM` | `avgCad` |

A key whose source is not a finite number (or whose formatter returns null) is `null`.

Rules for `resolveNumbers`: hero is `prefs.hero` when available, else `'dist'`. With `prefs.small === null`: start from `RECOMMENDED_SMALL`, drop the hero and unavailable keys, then fill back up to 3 with the next available keys in `NUMBER_KEYS` order that are not the hero and not already in. With an array: keep its keys that are available and not the hero, in `NUMBER_KEYS` order, at most `MAX_SMALL`.

- [ ] **Step 1: Write the failing tests** in `app/test/story/numbers.test.js`:

```js
import { numberValues, resolveNumbers, toggleSmall, sanitizeStoryPrefs, DEFAULT_STORY_PREFS } from '../../src/story/numbers.js';

const full = { distanceM: 5020, movingS: 2004, avgPaceSPerKm: 399, bestKmPaceS: 372, avgHr: 151.6, maxHr: 171, elevGainM: 38.2, avgCad: 164 };
const miFitness = { distanceM: 2020, movingS: 807, avgPaceSPerKm: 399.5, bestKmPaceS: 380, avgHr: null, maxHr: null, elevGainM: null, avgCad: null };
const routeOnly = { distanceM: 3100, movingS: null, avgPaceSPerKm: null, bestKmPaceS: null, avgHr: null, maxHr: null, elevGainM: null, avgCad: null };

test('values match the activity page formatting', () => {
  const v = numberValues(full);
  expect(v.dist).toEqual({ value: '5.02', unit: 'KM', label: 'KM' });
  expect(v.time.value).toBe('33:24');
  expect(v.pace).toEqual({ value: '6:39', unit: '/KM', label: 'PACE /KM' });
  expect(v.hr.value).toBe('152');
  expect(v.climb.value).toBe('+38');
  expect(numberValues({ distanceM: 640 }).dist).toEqual({ value: '640', unit: 'M', label: 'M' });
  expect(numberValues({ distanceM: 42195, movingS: 14733 }).time.value).toBe('4:05:33');
});
test('recommended set with everything available', () => {
  expect(resolveNumbers(DEFAULT_STORY_PREFS, numberValues(full))).toEqual({ hero: 'dist', small: ['time', 'pace', 'hr'] });
});
test('a Mi Fitness file: heart rate is replaced by the next available number', () => {
  expect(resolveNumbers(DEFAULT_STORY_PREFS, numberValues(miFitness))).toEqual({ hero: 'dist', small: ['time', 'pace', 'best'] });
});
test('route only file: hero falls back to distance, no small numbers', () => {
  const p = { ...DEFAULT_STORY_PREFS, hero: 'pace' };
  expect(resolveNumbers(p, numberValues(routeOnly))).toEqual({ hero: 'dist', small: [] });
});
test('hero is never also a small number; recommended refills to three', () => {
  const p = { ...DEFAULT_STORY_PREFS, hero: 'time' };
  expect(resolveNumbers(p, numberValues(full))).toEqual({ hero: 'time', small: ['dist', 'pace', 'hr'] });
});
test('toggle adds up to four, then ignores more, and removes', () => {
  const v = numberValues(full);
  let p = toggleSmall(DEFAULT_STORY_PREFS, 'best', v);
  expect(p.small).toEqual(['time', 'pace', 'hr', 'best']);
  expect(toggleSmall(p, 'climb', v).small).toEqual(['time', 'pace', 'hr', 'best']);
  expect(toggleSmall(p, 'pace', v).small).toEqual(['time', 'hr', 'best']);
});
test('broken stored settings become valid settings', () => {
  expect(sanitizeStoryPrefs(null)).toEqual(DEFAULT_STORY_PREFS);
  expect(sanitizeStoryPrefs('x')).toEqual(DEFAULT_STORY_PREFS);
  expect(sanitizeStoryPrefs({ template: 'Z', color: 'red', opacity: 250, hero: 'kcal', small: ['kcal', 'time', 'time', 'pace', 'hr', 'best', 'climb', 'cad', 'dist'] }))
    .toEqual({ template: 'A', color: '#1E4FA0', opacity: 100, hero: 'dist', small: ['dist', 'time', 'pace', 'hr'] });
  expect(sanitizeStoryPrefs({ template: 'D', color: '#abcdef', opacity: 47, hero: 'pace', small: [] }))
    .toEqual({ template: 'D', color: '#ABCDEF', opacity: 45, hero: 'pace', small: [] });
});
```

- [ ] **Step 2: Run** `npx vitest run --config app/vite.config.mjs app/test/story/numbers.test.js`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `app/src/story/numbers.js`** with the exports above. `sanitizeStoryPrefs`: colour must match `^#[0-9a-fA-F]{6}$` (stored upper case), opacity clamped to 0..100 and rounded to the nearest 5, `small` null or an array reduced to unique valid keys in `NUMBER_KEYS` order, at most 4.
- [ ] **Step 4: Run the test file.** Expected: PASS.
- [ ] **Step 5: Add failing store tests** to `app/test/stores/data.test.js`: after `load()` with stored prefs `{ age: 30 }`, `data.prefs.story` equals `DEFAULT_STORY_PREFS`; `data.setStoryPrefs({ template: 'C', opacity: 50 })` changes both fields, keeps the rest, and the value written to `w150.prefs` contains them; stored `story: { template: 'Z' }` loads as template `'A'`; `clearAll()` resets `story` to the default and keeps the age.
- [ ] **Step 6: Implement in `app/src/stores/data.js`**: `defaultPrefs()` gains `story: sanitizeStoryPrefs(null)`; `load()` sets `p.story = sanitizeStoryPrefs(p.story)`; `clearAll()` includes the default story; new `setStoryPrefs(patch)` merges, sanitises, persists; add it to the returned object.
- [ ] **Step 7: Run** `npm run app:test`. Expected: all pass.
- [ ] **Step 8: Commit.** `Add story numbers and saved story settings`.

---

### Task 3: Story colours (Haiku)

**Files:**
- Create: `app/src/story/colors.js`, `app/test/story/colors.test.js`

**Interfaces:**
- Produces: `PRESETS` (array of `{ id, name, hex }` in this order: blue `#1E4FA0`, red `#C8281C`, green `#1E7A46`, purple `#6B3FA0`, black `#111A2B`, yellow `#E8A317`, paper `#F1F2EE`), `INK = '#111A2B'`, `WHITE = '#FFFFFF'`, `luminance(hex) -> number`, `onColor(hex) -> '#FFFFFF' | '#111A2B'` (ink when luminance is above 0.36), `highlight(hex) -> { fill, on }` (`{ '#E8A317', '#111A2B' }` on a dark colour, `{ '#C8281C', '#FFFFFF' }` on a light one), `rgba(hex, alpha) -> string`.

- [ ] **Step 1: Write the failing test**: `onColor` is white for blue, red, green, purple, black and ink for yellow and paper; `highlight('#1E4FA0').fill` is `'#E8A317'` and `highlight('#E8A317').fill` is `'#C8281C'`; `rgba('#1E4FA0', 0.5)` is `'rgba(30, 79, 160, 0.5)'`; `luminance('#FFFFFF')` is 1 and `luminance('#000000')` is 0.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** (WCAG relative luminance).
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Commit.** `Add story colours`.

---

### Task 4: Story model (Opus)

**Files:**
- Create: `app/src/story/model.js`, `app/test/story/model.test.js`

**Interfaces:**
- Consumes: `numberValues` (Task 2); `credit`, `weekCredit`, `TYPE_LABEL` from `core/rules.js`; `activeGuide`, `ageGroup` from `core/guide.js`; `weekStart`, `parseYmd`, `ymd`, `addDays`, `dayIndex`, `WD`, `MON` from `core/dates.js`; `getTrack` from `core/gpxEffort.js`.
- Produces:
  - `storyEligible(session, rec) -> boolean`: session exists, `type === 'run'`, `rec` exists with at least 2 route points.
  - `weekNumbers(session, sessions, age) -> { target, before, add, after, days: [{ on: boolean, today: boolean }] (7, Monday first) } | null`. Null when `ageGroup(age)` from `core/guide.js` is `'unset'` or `'under5'` (note: `activeGuide` still returns a guide for those, the adult preview and the child guide, so it cannot be used for this check). `before` is the credit of the other sessions in the run's week that are on an earlier date, or on the same date with a smaller `createdAt`. `add` is `credit(session, guide)`. `days[i].on` is true when any session in that week on that day has credit above 0.
  - `lanes(m) -> [{ label: string, paceText: string, frac: number, best: boolean }]`. Uses full splits only (`partial` false, numeric `paceSPerKm`). Up to 10: one per km, label `'1'..'10'`. More than 10: 5 km blocks (pace is block time over block distance, label `'5'`, `'10'`, ...), full blocks only. Fewer than 2 lanes: `[]`. `frac` is 1 for the fastest and 0.55 for the slowest, linear in pace, all 1 when equal. Exactly one `best`.
  - `routePath(track, boxW, boxH) -> { pts: [[x, y], ...], cum: number[], total: number }`: the route projected like `RouteMap.vue` (longitude scaled by the cosine of the mid latitude), fitted and centred in the box with the aspect kept, `cum` the running pixel length.
  - `templateState(model) -> { A, B, C, D, E, F }`, each `{ ok: true }` or `{ ok: false, reason }`. Reasons, exact: C `'Needs at least 2 full km.'`, E `'Needs a weekly target. Set your age first.'`.
  - `buildModel(session, rec, sessions, age) -> { kicker, dateText, values, week, lanes, track, templates }`. `kicker` is `'RUN · WED 7 OCT'` (type label upper case, then the weekday, day and month of `rec.startTime` in local time, or of `session.date` when there is no start time).

- [ ] **Step 1: Write the failing tests.** Fixed data: age 30 (target 150, vigorous counts double), week of Monday 2026-10-05.

```js
const S = (id, date, type, minutes, intensity, createdAt) => ({ id, date, type, minutes, intensity, balance: false, source: 'log', sample: false, createdAt });
const sessions = [
  S('a', '2026-10-05', 'walk', 30, 'moderate', 1),
  S('b', '2026-10-07', 'run', 14, 'vigorous', 2),      // 28 credit, earlier the same day
  S('c', '2026-10-07', 'strength', 40, 'moderate', 3), // 0 credit
  S('run', '2026-10-07', 'run', 34, 'moderate', 4),
  S('d', '2026-10-09', 'cycle', 60, 'moderate', 5),    // later in the week, not "before"
  S('e', '2026-09-30', 'run', 50, 'moderate', 0)       // previous week
];
test('week numbers are for the run\'s week, up to the run', () => {
  const w = weekNumbers(sessions[3], sessions, 30);
  expect(w).toMatchObject({ target: 150, before: 58, add: 34, after: 92 });
  expect(w.days.map(d => d.on)).toEqual([true, false, true, false, true, false, false]);
  expect(w.days.map(d => d.today)).toEqual([false, false, true, false, false, false, false]);
});
test('a light run adds 0', () => {
  expect(weekNumbers({ ...sessions[3], intensity: 'light' }, sessions, 30).add).toBe(0);
});
test('no age or under 5: no week numbers, E unavailable, A still ok', () => { /* weekNumbers(..., null) and weekNumbers(..., 3) are null; templateState gives E.ok false with the exact reason, A.ok true */ });
```

  Also: `lanes` for 5 full splits (paces 412, 405, 399, 391, 372, plus one partial) gives 5 lanes, the last `best` with `frac` 1, the first `frac` 0.55, `paceText` `'6:52'`; for 12 full km it gives 2 lanes labelled `'5'` and `'10'`; for 1 full km it gives `[]` and `templateState` reports C with the exact reason; for a route only file (`splits` empty) the same. `routePath` for a square track keeps every point inside the box and `cum` ends at `total`. `storyEligible` is false for a walk, for `rec` null, and for a missing session. `buildModel` kicker for `startTime` of 2026-10-07 01:48 local is `'RUN · WED 7 OCT'`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement `app/src/story/model.js`.**
- [ ] **Step 4: Run** the file. Expected: PASS.
- [ ] **Step 5: Commit.** `Add story model`.

---

### Task 5: Renderer, photo and the three static templates (Opus)

**Files:**
- Create: `app/src/story/draw.js`, `app/src/story/render.js`, `app/src/story/photo.js`, `app/src/story/templates/bib.js`, `clean.js`, `poster.js`, `app/test/story/fakeCtx.js`, `app/test/story/render.test.js`, `app/test/story/photo.test.js`

**Interfaces:**
- Consumes: `buildModel`, `routePath` (Task 4); `resolveNumbers` (Task 2); `onColor`, `highlight`, `rgba` (Task 3).
- Produces:
  - `render.js`: `W = 1080`, `H = 1920`, `SAFE_TOP = 250`, `SAFE_BOTTOM = 1580`, `drawStory(ctx, state, t)`. `state` is `{ template, model, numbers: { hero, small }, color, opacity (0..100), photo: { bitmap, w, h } | null, view: { zoom, x, y } }`. It draws the photo (or the colour when there is none), then calls the template.
  - Each template file: `export function draw(ctx, state, t)`.
  - `draw.js`: `fitFont(ctx, text, maxWidth, basePx, family, weight) -> px` (largest size up to `basePx` whose measured width fits), `drawPhoto(ctx, photo, view, x, y, w, h)`, `colorLayer(ctx, hex, alpha, x, y, w, h, radius)`, `numberRow(ctx, items, x, y, w, color)`, `FONT = { display, mono }`.
  - `photo.js`: `loadPhoto(file) -> Promise<{ bitmap, w, h }>` (rejects with an `Error` whose message is `'not-image'` or `'decode-failed'`; EXIF orientation applied; longer side scaled to at most 2160; the full size bitmap is closed), `coverRect(pw, ph, boxW, boxH, view) -> { sx, sy, sw, sh }` with `view = { zoom: 1..3, x: -1..1, y: -1..1 }`, `releasePhoto(photo)`.
  - `fakeCtx.js`: `makeCtx() -> ctx` recording every call in `ctx.calls` (`fillText` with text, x, y, font, fillStyle, globalAlpha at call time; `fillRect`, `drawImage`, `stroke`, `filter` changes), with `measureText(text)` returning `{ width: text.length * px * 0.5 }` for the current font size.

Template content and proportions follow the mockup (its sizes are in `cqw`, hundredths of the story width, so multiply by 10.8 for canvas pixels). Opacity applies to: the bib card in A, the bottom gradient in B, the full background in F. In A, when opacity is below 100, blur the photo under the card (`ctx.filter`, skipped when the property is not supported). Text on the bib card is ink; text on F's background is `onColor(color)`; text on B is white with a soft shadow. A's week bar is drawn only when `model.week` exists.

- [ ] **Step 1: Write `fakeCtx.js` and the failing tests** in `render.test.js`, run for each of A, B, F with the Task 4 fixture model:

```js
test.each(['A', 'B', 'F'])('template %s: every text is inside the canvas and the safe area', (id) => {
  const ctx = makeCtx();
  drawStory(ctx, state(id), 0);
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  expect(texts.length).toBeGreaterThan(3);
  texts.forEach(c => {
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(1080);
    expect(c.y).toBeGreaterThanOrEqual(250);
    expect(c.y).toBeLessThanOrEqual(1580);
  });
  const shown = texts.map(c => c.text);
  expect(shown).toEqual(expect.arrayContaining(['5.02', '33:24', '6:39', 'WEEKLY 150', 'RUN · WED 7 OCT']));
});
test.each(['A', 'B', 'F'])('template %s: marathon numbers still fit', (id) => { /* hero '42.20' with small ['4:05:33', '10:02', '171', '+912']: same bounds assertions */ });
test('A: the week bar text is there with an age and absent without', () => { /* '92 OF 150 MIN THIS WEEK' present; with model.week null no text contains 'THIS WEEK' */ });
test('opacity 50 draws the colour layer at alpha 0.5; opacity 0 draws no colour layer', () => { /* template F */ });
test('F on yellow uses ink text, on blue uses white', () => { /* fillStyle of the hero text */ });
test('no photo: the background is the colour and drawImage is never called', () => {});
test('static templates ignore t', () => { /* calls at t = 0 equal calls at t = 3 */ });
```

  And in `photo.test.js`: `coverRect(4000, 3000, 1080, 1920, { zoom: 1, x: 0, y: 0 })` is a centred 1687.5 by 3000 crop; `zoom: 2` halves both sides; `x: 1` pushes the crop to the right edge and never outside the image; `loadPhoto` of a `File` with type `text/plain` rejects with `'not-image'`; with `createImageBitmap` stubbed to throw it rejects with `'decode-failed'`; with a stub returning a 8000 by 6000 bitmap the result's longer side is 2160 and the first bitmap's `close` was called.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** `draw.js`, `photo.js`, `render.js` and the three templates.
- [ ] **Step 4: Run** both files. Expected: PASS.
- [ ] **Step 5: Commit.** `Add story renderer and static templates`.

---

### Task 6: Timeline and the three animated templates (Opus)

**Files:**
- Create: `app/src/story/timeline.js`, `app/src/story/templates/splits.js`, `route.js`, `weeklap.js`, `app/test/story/timeline.test.js`
- Modify: `app/src/story/render.js` (dispatch C, D, E), `app/test/story/render.test.js`

**Interfaces:**
- Consumes: Task 5's `draw.js` helpers and `fakeCtx.js`; `model.lanes`, `routePath`, `model.week`.
- Produces: `timeline.js`: `FPS = 30`, `DURATION = 5`, `MOTION = 3`, `FRAMES = 150`, `ease(p) -> number` (ease in out, `ease(0) = 0`, `ease(1) = 1`), `progress(t, start, length) -> number` (eased, clamped to 0..1), `ANIMATED = ['C', 'D', 'E']`, `isAnimated(id) -> boolean`.

Motion, all finished by `t = MOTION`, final state held until `DURATION`:
- C: header fades up over 0 to 0.5 s; lane `i` grows from the left over 0.7 s starting at `0.35 + i * 0.18` s; its pace text appears 0.5 s after its start. Lane step is scaled down so the last lane finishes by 3 s when there are 10 lanes.
- D: the route is drawn from start to finish and the dot moves along it over 0.3 to 2.6 s; the main number counts from 0 to its value over the same time (digits formatted like the final value); small numbers slide up from 2.5 s, 0.15 s apart.
- E: the oval track shows `before` from the start; the run's part grows from 0 to `add` over 0.3 to 2.6 s; the counter goes from `before` to `after`; the "+N MIN TODAY" tag and today's day mark appear at 2.6 s. Fill beyond the target stops at a full lap.

Opacity applies to the track band in C (with blur under it below 100) and the colour wash in D and E. Text on those layers is `onColor(color)`; the fastest lane, the dot and the run's part use `highlight(color).fill`.

- [ ] **Step 1: Write the failing tests.** `timeline.test.js`: `progress(0.3, 0.3, 2.3)` is 0, `progress(2.6, 0.3, 2.3)` is 1, `progress(9, 0.3, 2.3)` is 1, `progress(-1, 0, 1)` is 0, `ease` is monotonic over 0, 0.25, 0.5, 0.75, 1. In `render.test.js`, for each of C, D, E: the bounds assertions of Task 5 hold at `t` of 0, 1.5, 3 and 5, with normal and marathon numbers; the calls at `t = 3` equal the calls at `t = 5`; at `t = 5` the texts contain the final values (D: `'5.02'`; E: `'92'` and `'+34 MIN TODAY'`; C: `'6:12'`); at `t = 0` D shows `'0.00'` and E shows `'58'`. C with 10 lanes: all 10 pace texts present at `t = 3`. E with `after` above `target` (before 140, add 34): no throw, counter ends at `'174'`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** `timeline.js`, the three templates, and the dispatch in `render.js`.
- [ ] **Step 4: Run** `npm run app:test`. Expected: PASS.
- [ ] **Step 5: Commit.** `Add animated story templates`.

---

### Task 7: Export (Opus)

**Files:**
- Create: `app/src/story/export.js`, `app/test/story/export.test.js`
- Modify: `package.json`, `package-lock.json` (add `mediabunny`, exact version)

**Interfaces:**
- Consumes: `FPS`, `FRAMES`, `DURATION` (Task 6); the Task 1 result.
- Produces:
  - `exportPng(canvas) -> Promise<Blob>` (`image/png`).
  - `videoSupport() -> Promise<'webcodecs' | 'recorder' | 'none'>`.
  - `exportVideo(canvas, drawFrame, onProgress) -> Promise<{ blob: Blob, path: 'webcodecs' | 'recorder' } | null>`. `drawFrame(t)` draws the story at time `t` onto `canvas`. Tries WebCodecs with Mediabunny (frame by frame, timestamps `i / FPS`, the codec strings and bitrate proven in Task 1), and falls through to `MediaRecorder` in real time when no MP4 results, and to `null` when neither does. Never returns a WebM. `onProgress(0..1)`.
  - `storyFileName(session, ext) -> string`: `'weekly150-run-2026-10-07.png'`.
  - `canShareFile(file) -> boolean`, `shareFile(file) -> Promise<void>` (must be called directly from a click handler, no await before `navigator.share`), `downloadBlob(blob, name)` (an `<a download>` without `target`, the object URL revoked after a delay).

If Task 1 showed that one path fails on the owner's phone, keep the code path but order the attempts by what passed, and say so in a comment at the top of the file.

- [ ] **Step 1: Install.** Read Mediabunny's current docs, then `npm install mediabunny@<current version> --save-exact`.
- [ ] **Step 2: Write the failing tests** (browser APIs stubbed on `globalThis`): `storyFileName({ date: '2026-10-07' }, 'mp4')` is `'weekly150-run-2026-10-07.mp4'`; `videoSupport()` is `'none'` with neither API, `'recorder'` when only `MediaRecorder.isTypeSupported('video/mp4...')` is true, `'webcodecs'` when `VideoEncoder.isConfigSupported` resolves supported; `exportVideo` resolves `null` when support is `'none'` and never calls `drawFrame`; with `MediaRecorder` reporting only `video/webm` support the result is `null`; `canShareFile` is false when `navigator.canShare` is missing; `downloadBlob` creates an anchor with the `download` attribute set to the name and no `target`.
- [ ] **Step 3: Run** the file. Expected: FAIL.
- [ ] **Step 4: Implement `app/src/story/export.js`.** Mediabunny is loaded with `await import('mediabunny')` inside `exportVideo` only.
- [ ] **Step 5: Run** `npm run app:test` and `npm run app:build:local`. Expected: tests pass, build exits 0, and the build output lists Mediabunny in its own chunk, not in the main one.
- [ ] **Step 6: Commit.** `Add story export`.

---

### Task 8: Story page, controls, route and entry (Opus)

**Files:**
- Create: `app/src/pages/StoryPage.vue`, `app/src/components/StoryCanvas.vue`, `app/src/components/StoryControls.vue`, `app/test/pages/story.test.js`
- Modify: `app/src/router.js` (route and header comment), `app/src/pages/ActivityPage.vue` (entry control in `.gpx-d-top`), `app/src/styles/app.css` (story section, tokens only), `app/test/pages/activity.test.js`, `app/test/router.test.js`

**Interfaces:**
- Consumes: everything from Tasks 2 to 7; `data.prefs.story`, `data.setStoryPrefs`.
- Produces: route `{ path: '/story/:id', name: 'story', component: StoryPage, meta: { auth: true } }`; on the activity page `<RouterLink id="gpx-d-story" class="btn btn-outline btn-small" :to="{ name: 'story', params: { id }, query: route.query }">Share story</RouterLink>`, rendered only when `storyEligible(session, rec)`.

Page behaviour:
- Looks up the session and record the same way as `ActivityPage.vue`. Not eligible: `#story-missing` with the text `This run cannot be made into a story. A story needs a run with a stored route.` and a link `#story-missing-link` back to the activity (or the log when the session is missing). No canvas is created.
- Eligible: back link `#story-back` to the activity (keeping `from`), title `Story`, document title `Story, <activity title>, Weekly 150`.
- `StoryCanvas`: one `<canvas id="story-canvas" width="1080" height="1920">` scaled by CSS to the column width (at most 360px wide), `role="img"`, `aria-label` such as `Story preview, template Race bib. Distance 5.02 km, time 33:24, pace 6:39 per km.`. Waits for `document.fonts.load` of Barlow Condensed 600, 700, 800 and IBM Plex Mono 500 before the first draw. Redraws on any state change. For an animated template it loops with `requestAnimationFrame` over `DURATION`; with `prefers-reduced-motion: reduce` it draws `t = DURATION` and plays once when `#story-play` is pressed. Drag on the canvas moves the photo (`view.x`, `view.y`), pointer events, with arrow keys doing the same when the canvas has focus.
- `StoryControls`, in this order, ids as given:
  1. Template: six buttons `#story-tpl-A` to `#story-tpl-F`, `aria-pressed`, each labelled with its name and `Static` or `Animated`; an unavailable one is `disabled` and its reason shows in `#story-tpl-note`. If the saved template is unavailable for this run, the page uses `'A'` without changing the saved setting.
  2. Photo: `#story-photo` (file input, `accept="image/*"`, inside a labelled button), `#story-zoom` (range 1 to 3, step 0.05), `#story-nophoto` (removes the photo). A failed load shows `#story-photo-error`: `That file could not be read as a picture. Try a JPG or PNG.` and keeps the previous photo.
  3. Colour: seven swatch buttons `#story-color-<id>` with `aria-pressed` and an accessible name, `#story-color-custom` (`type="color"`), `#story-color-reset` (`Reset colour`, back to blue at 100 percent).
  4. Opacity: `#story-opacity` (range 0 to 100, step 5) with its value in `#story-opacity-out`.
  5. Main number: `#story-hero-dist`, `#story-hero-time`, `#story-hero-pace`; unavailable ones disabled.
  6. Small numbers: `#story-num-<key>` for the eight keys, `aria-pressed`; disabled when unavailable or when it is the main number; `#story-num-rec` (`Back to recommended`, sets hero `dist` and `small` null); `#story-num-count` such as `3 of 4 small numbers used.`
  7. Export: `#story-create` (`Create picture` or `Create video`), a progress text in `#story-status` (`role="status"`), then `#story-share` (only when the file can be shared) and `#story-download`. When no MP4 can be made: `#story-status` says `This browser cannot make a video that Instagram accepts. Here is the picture instead.` and the PNG of the final state is offered. After a download on iOS the status adds `Saved to Files, in Downloads.` Changing any setting discards the created file and brings `#story-create` back.
- Every change of template, colour, opacity, main number or small numbers calls `data.setStoryPrefs`. The photo, zoom and position are page state only and are released (`releasePhoto`) when the page is left.

- [ ] **Step 1: Write the failing tests** in `app/test/pages/story.test.js` (mount like `activity.test.js`; `HTMLCanvasElement.prototype.getContext` stubbed to return `makeCtx()`; `document.fonts` stubbed):
  - The sample run (`/story/sample_32`): `#story-canvas` exists, `#story-missing` hidden, six template buttons, `#story-tpl-A` pressed, hero `#story-hero-dist` pressed, the three recommended numbers pressed.
  - Not available state for: an unknown id, a walk session, a run with no `trackId`, a run whose track is not in `data.tracks`. Each shows the exact text and no `#story-canvas`.
  - Pressing `#story-tpl-D` sets `data.prefs.story.template` to `'D'`. Pressing `#story-num-best` gives 4 pressed and `#story-num-count` reads `4 of 4 small numbers used.`; pressing a fifth changes nothing. `#story-num-rec` restores three.
  - Pressing `#story-hero-time` disables `#story-num-time`.
  - A run with one full km: `#story-tpl-C` is disabled and `#story-tpl-note` contains `Needs at least 2 full km.`
  - No age (`data.prefs.age = null`): `#story-tpl-E` disabled.
  - A route only track (metrics without time): `#story-hero-time` and `#story-hero-pace` disabled, the canvas label names the distance.
  - `#story-opacity` set to 50 stores 50 and `#story-opacity-out` reads `50%`. `#story-color-reset` stores `#1E4FA0` and 100.
  - A photo input change with a `text/plain` file shows `#story-photo-error`.
  - In `activity.test.js`: `#gpx-d-story` exists for the sample run with `href` `/story/sample_32?from=log`, and is absent for a session without a stored route. In `router.test.js`: `/story/x` while logged out goes to `/login?next=/story/x`.
- [ ] **Step 2: Run** the three files. Expected: FAIL.
- [ ] **Step 3: Implement** the page, the two components, the route, the entry control and the styles. Styles use existing tokens only; the swatch fill comes from an inline `--c` custom property set from `PRESETS`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass (gpx tests: 42 passed and 1 skipped without the private file).
- [ ] **Step 5: Browser check** on `weekly150-web` (`npm run dev`, 127.0.0.1:8160): import a GPX run, open Details, press Share story. Check all six templates with and without a photo, each colour preset, opacity 0, 50 and 100, main number time and pace, four small numbers, Create and Download for a static and an animated template (open both files), 375px and desktop, light and dark, reduced motion. No horizontal scroll at 400px. No console errors.
- [ ] **Step 6: Commit.** `Add story page and Share story entry`.

---

### Task 9: Docs, full verification and the phone check (Sonnet)

**Files:**
- Modify: `docs/implementation-log.md` (finish entry P), `docs/PROGRESS.md` (feature list, files table, storage note for `prefs.story`, the open item moves to done, what was and was not tested on phones), `CLAUDE.md` (only if a documented count or command changed)

- [ ] **Step 1: Run everything**: `npm test`, `npm run db:test`, `npm run test:smoke`, `npm run app:build:local` (exit 0). Then the greps: no em or en dash in `app docs tools/web supabase`, no `service_role|SERVICE_ROLE` in `app/src app/index.html app/dist`, no `v-html` in `app/src`.
- [ ] **Step 2: Owner's phone check.** Needs the app on an HTTPS address the phone can reach (same choice as Task 1, Step 4). On Android Chrome: make one static and one animated story from a real run with a real photo, post both to Instagram, confirm text is sharp, nothing is cut off and nothing sits under Instagram's interface.
- [ ] **Step 3: Write the docs.** State plainly what was verified and what was not (iPhone is untested).
- [ ] **Step 4: Commit.** `Document run story templates`.

---

## Self-review notes

- Spec coverage: entry and eligibility (Tasks 4, 8), the seven control groups (Task 8), template table and availability (Tasks 4 to 6), week figures (Task 4), numbers and replacement rule (Task 2), rendering and safe area (Tasks 5, 6), animation timing and reduced motion (Tasks 6, 8), export order and delivery (Tasks 1, 7, 8), privacy (Tasks 5, 8), settings saved with the account (Task 2), text alternative (Task 8), checks (Tasks 8, 9).
- One addition beyond the spec: `Reset colour` (Task 8), so the spec's anti-goal "no way back to a readable default" has a control.
