# Weekly 150 web: Vue migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the web app in `web/` as a Vue 3 single page app in `app/` with the same behaviour, copy, ids and styles, then switch local dev and Vercel to it and delete `web/`.

**Architecture:** Pure rules and data helpers move into framework-free ES modules (`app/src/core/`), the sync engine becomes ES modules (`app/src/sync/`) wrapped by Pinia stores, and every screen becomes a component under Vue Router (`/`, `/log`, `/activity/:id`, auth routes). The old `web/` app is the behavioural reference until the last task removes it.

**Tech Stack:** Vue 3 (`<script setup>`, plain JavaScript), Vue Router 5 (history mode), Pinia, Vite, Vitest + `@vue/test-utils` + `happy-dom`, `@supabase/supabase-js` 2.118.0 from npm, Node 24, Supabase CLI local stack (unchanged), Vercel.

**Spec:** `docs/superpowers/specs/2026-10-24-vue-migration-design.md`. Behavioural reference: `web/` at commit `83e82d3` (`web/index.html`, `web/log.html`, `web/activity.html`, `web/js/app.js`, `web/js/auth.js`, `web/js/auth-screens.js`, `web/js/store.js`, `web/js/merge.js`, `web/css/app.css`), and `docs/PROGRESS.md`.

## Global Constraints

- No em dashes or en dashes anywhere (code, comments, copy, docs, commit messages). No Claude or Anthropic attribution, no `Co-Authored-By` trailers.
- `weekly-150.html` (the Artifact) is frozen. `supabase/` (schema, RLS, Edge Functions, pgTAP) does not change.
- `credit(s, guide)` in `app/src/core/rules.js` is the only route for aerobic minutes.
- Server keys stay exactly `w150.meta`, `w150.sessions`, `w150.plan`, `w150.prefs`, `w150.breaks`, `w150.tracks`, same value shapes (add fields with defaults, never rename). `w150.theme` stays in browser localStorage. Clear all still deletes `w150.breaks`.
- Edit `tools/gpx/gpx-lib.js` only; generated copies are git-ignored. `node tools/gpx/gpx-lib.test.js` stays at 42 passed and 1 skipped without the private file.
- No secret in `app/`, `web/` or any committed file. Only the Supabase URL and anon key reach the browser. `grep -rE "service_role|SERVICE_ROLE" app/src app/index.html app/dist` returns nothing.
- Exact copy: `Wrong username or password.`, `If that account exists, we sent an email.`, `Too many attempts. Try again in a few minutes.` All other copy is ported byte for byte from the reference.
- Port, not redesign: every element id and class from the reference pages stays (stable ids on every control), `app/src/styles/app.css` is `web/css/app.css` with only the deletions a task names. Colours only as tokens in all three theme blocks; 400px with no horizontal scroll; visible focus.
- Text only through `{{ }}` or `textContent`. No `v-html`.
- One agent at a time edits a given file. Delegation per CLAUDE.md: Tasks 4, 5, 8, 10 difficult (Opus); Tasks 1, 2, 3, 6, 7, 9, 11, 12 moderate (Sonnet).
- After each task: append to `docs/implementation-log.md` under a new entry `L. Vue migration`, one paragraph per task; update `docs/PROGRESS.md` only in Task 12.
- Local stack rules from CLAUDE.md hold: never run `db:reset` or `db:stop` while someone else uses the stack.

## Review Focus

1. **Session ends while a page is open** (refresh token rejected): pending writes stay queued, the login route opens with `next=` the current path and the copy `Your session ended. Log in again to keep saving.`, the same user logging in again flushes the queue, a different user resets the store and reloads. Test: Task 5 `auth store keeps queued writes after session end and flushes for the same user`.
2. **Email link lands on `/` with `#access_token=...` or `#error_code=...`.** The router must not treat it as a section anchor; the link is read before the Supabase client and router start, then signup goes to `/login` with `Email verified. You can log in now.`, recovery to `/reset`, an error code to `/forgot` with the expired copy. Test: Task 5 `routeForLink`.
3. **Reload or open a deep link** (`/log`, `/activity/sample_32?from=log`) in production and in dev: Vercel rewrite and Vite history fallback serve `index.html`, and the guard sends a logged-out visitor to `/login?next=...` and back after login. Test: Task 5 `guard redirects to login with next`; Task 12 checks `vercel.json`.
4. **Section anchor from another page** (`/#splits` from Back to this week) before the data has loaded: scroll happens after the week page renders. Test: Task 9 `scrollBehavior waits for data ready`.
5. **Another tab or device changes data** while `/log` or `/activity/:id` is open: `onRemoteChange` reloads the Pinia data store and the page re-renders; an activity removed elsewhere turns into Activity not found. Test: Task 4 `remote change reloads state`, Task 8 `removed session shows not found`.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json` | Adds dependencies and scripts `app:dev`, `app:build`, `app:test`; `test` runs `app:test` and the gpx test. |
| `app/vite.config.mjs` | Vite root `app/`, Vue plugin, dev server `127.0.0.1:8160` strictPort, Vitest config (`happy-dom`, setup file). |
| `app/index.html` | Document shell: head as in `web/index.html`, `<script src="/gpx-lib.js">`, `<div id="root">`, module entry. |
| `app/src/main.js` | Reads the auth link, creates Pinia, router, mounts `App.vue`. |
| `app/src/styles/app.css` | Copy of `web/css/app.css`. |
| `app/src/core/*.js` | Pure logic: `dates.js`, `guide.js`, `rules.js`, `sanitize.js`, `sample.js`, `history.js`, `gpx.js`, `gpxEffort.js`, `routines.js`, `facts.js`. |
| `app/src/sync/merge.js`, `store.js` | ES module ports of `web/js/merge.js` and `web/js/store.js`. |
| `app/src/sync/backend.js` | Supabase adapter for the sync store (`fetchAll`, `put`, `remove`, `refreshAuth`). |
| `app/src/stores/auth.js`, `data.js`, `ui.js` | Pinia: auth and session, user data and actions, theme, sync status, announcements. |
| `app/src/auth/link.js`, `copy.js` | Email link parsing and routing; exact auth copy. |
| `app/src/router.js` | Routes, guard, scroll behaviour. |
| `app/src/App.vue`, `components/AppHeader.vue`, `AppFooter.vue`, `LiveRegion.vue` | Shell. |
| `app/src/pages/` | `WeekPage.vue`, `LogPage.vue`, `ActivityPage.vue`, `auth/LoginPage.vue`, `RegisterPage.vue`, `CheckEmailPage.vue`, `ForgotPage.vue`, `ResetPage.vue`, `auth/AuthLayout.vue`. |
| `app/src/components/` | `SplitRow.vue`, `UndoBar.vue`, week sections (`HeroBand.vue`, `AgeStep.vue`, `LogForm.vue`, `SplitsSection.vue`, `GpxImport.vue`, `StreakGrid.vue`, `PlanSection.vue`, `SnacksSection.vue`, `EvidenceSection.vue`, `SampleBanner.vue`, `ClearAll.vue`), activity parts (`ActivityStats.vue`, `RouteMap.vue`, `LineChart.vue`, `SplitsSheet.vue`). |
| `app/test/` | Vitest tests, `setup.js` (loads `GPX` global), fixtures shared with `tools/gpx/fixtures/`. |
| `tools/web/build.js` | Writes `app/.env.local` and `app/public/gpx-lib.js` (both git-ignored); keeps the key guard. |
| `vercel.json`, `.claude/launch.json`, `.gitignore`, docs | Switched in Task 12. |

---

### Task 1: Scaffold the Vue app (Sonnet)

**Files:**
- Modify: `package.json`, `.gitignore`, `tools/web/build.js`, `.claude/launch.json`
- Create: `app/vite.config.mjs`, `app/index.html`, `app/src/main.js`, `app/src/App.vue`, `app/src/styles/app.css`, `app/test/setup.js`, `app/test/smoke.app.test.js`

**Interfaces:**
- Produces: `npm run app:dev` (Vite on 127.0.0.1:8160), `npm run app:build` (runs `node tools/web/build.js` then `vite build`), `npm run app:test` (Vitest); `globalThis.GPX` in tests via `app/test/setup.js`; `import.meta.env.VITE_SUPABASE_URL`, `import.meta.env.VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 1:** `npm install -E vue vue-router pinia @supabase/supabase-js@2.118.0` and `npm install -E -D vite @vitejs/plugin-vue vitest @vue/test-utils happy-dom`. Add scripts `app:dev`, `app:build`, `app:test` (`vitest run --config app/vite.config.mjs`) and change `test` to `npm run app:test && node --test "web/test/*.test.js" && node tools/gpx/gpx-lib.test.js` (the `web/test` part is removed in Task 4).
- [ ] **Step 2: Write the failing test** `app/test/smoke.app.test.js`:

```js
import { mount } from '@vue/test-utils';
import App from '../src/App.vue';
test('App mounts', () => { expect(mount(App, { global: { stubs: ['router-view'] } }).exists()).toBe(true); });
test('GPX global is loaded', () => { expect(typeof globalThis.GPX.analyze).toBe('function'); });
```

- [ ] **Step 3:** Run `npm run app:test`. Expected: FAIL (no config, no App).
- [ ] **Step 4:** Create `app/vite.config.mjs` (root `app`, `server: { host: '127.0.0.1', port: 8160, strictPort: true }`, `test: { environment: 'happy-dom', globals: true, setupFiles: ['app/test/setup.js'] }`), `app/test/setup.js` (`createRequire` then `globalThis.GPX = require('../../tools/gpx/gpx-lib.js')`), `app/index.html` (the `<head>` of `web/index.html` minus the supabase and app scripts, plus `<script src="/gpx-lib.js"></script>`, `<div id="root"></div>`, `<script type="module" src="/src/main.js"></script>`), a minimal `App.vue` (`<router-view />`), `main.js` (mount only), `app/src/styles/app.css` copied from `web/css/app.css` and imported in `main.js`.
- [ ] **Step 5:** Extend `tools/web/build.js`: after the guard, also write `app/.env.local` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` lines and copy `tools/gpx/gpx-lib.js` to `app/public/gpx-lib.js`. Keep writing `web/config.js` and `web/js/gpx-lib.js` until Task 12. Add `app/.env.local`, `app/public/gpx-lib.js`, `app/dist/` to `.gitignore`. Add a launch configuration `weekly150-app` (`npm run app:dev`, port 8160).
- [ ] **Step 6:** Run `npm run app:test` (PASS, 2 tests), `npm run web:build:local` then `npx vite build --config app/vite.config.mjs` (exit 0), `node tools/gpx/gpx-lib.test.js` (42 passed, 1 skipped).
- [ ] **Step 7: Commit** `git add package.json package-lock.json .gitignore tools/web/build.js .claude/launch.json app` then `git commit -m "Scaffold the Vue app in app/ with Vite, Router, Pinia and Vitest"`.

### Task 2: Core dates, guideline and rules (Sonnet)

**Files:**
- Create: `app/src/core/dates.js`, `app/src/core/guide.js`, `app/src/core/rules.js`, `app/test/core/rules.test.js`

**Interfaces:**
- Produces:
  - `dates.js`: `WD`, `WD_LONG`, `MON`, `pad(n)`, `ymd(d) -> 'YYYY-MM-DD'`, `parseYmd(s) -> Date`, `addDays(d, n)`, `today() -> Date at local midnight`, `dayIndex(d) -> 0..6 (Mon = 0)`, `weekStart(d)`, `plural(n, one, many)`, `fmtDay(ds) -> 'Thu 22 Oct'`, `fmtWeekRange(ws)`.
  - `guide.js`: `GUIDE`, `GUIDE_NOTE` (verbatim from the reference), `ageGroup(age) -> 'unset' | 'under5' | 'child' | 'adult' | 'older'`, `activeGuide(age)`, `hasTargets(age)`.
  - `rules.js`: `TYPE_LABEL`, `VALID_TYPES`, `BALANCE_TYPES`, `isStrength(s)`, `isLight(s)`, `isBalance(s)`, `countsAsBalance(s)`, `credit(s, guide)`, `actLabel(s)`, `weekCredit(sessions, ws, guide) -> { credit, count }`, `calc(sessions, age, now) -> { guide, target, group, today, ws, di, daysLeft, cur, mod, vig, total, remaining, strengthDays, strengthMin, lightMin, balanceDays, vigDays, lastWeek, streak, thisHit }` (same fields and rules as `calc()` in the reference).

- [ ] **Step 1: Write the failing tests** in `app/test/core/rules.test.js`:

```js
import { credit, calc, weekCredit } from '../../src/core/rules.js';
import { activeGuide, ageGroup } from '../../src/core/guide.js';
import { fmtWeekRange, parseYmd } from '../../src/core/dates.js';
const run = (min, intensity, extra) => ({ id: 'x', date: '2026-10-22', type: 'run', minutes: min, intensity, balance: false, ...extra });
test('vigorous counts double for adults, 1:1 for children', () => {
  expect(credit(run(18, 'vigorous'), activeGuide(30))).toBe(36);
  expect(credit(run(18, 'vigorous'), activeGuide(12))).toBe(18);
});
test('light and strength earn no aerobic credit', () => {
  expect(credit(run(15, 'light'), activeGuide(30))).toBe(0);
  expect(credit({ ...run(20, 'moderate'), type: 'strength' }, activeGuide(30))).toBe(0);
});
test('age groups', () => {
  expect([null, 4, 5, 17, 18, 64, 65].map(ageGroup)).toEqual(['unset', 'under5', 'child', 'child', 'adult', 'adult', 'older']);
});
test('balance days need moderate effort or more', () => {
  const now = parseYmd('2026-10-24');
  const s = [{ ...run(20, 'light'), type: 'balance', date: '2026-10-20' }, { ...run(20, 'moderate'), type: 'dance', date: '2026-10-21' }];
  expect(calc(s, 70, now).balanceDays).toBe(1);
});
test('week ranges', () => {
  expect(fmtWeekRange(parseYmd('2026-10-19'))).toBe('19 to 25 Oct 2026');
  expect(fmtWeekRange(parseYmd('2026-10-27'))).toBe('27 Oct to 2 Nov 2026');
  expect(fmtWeekRange(parseYmd('2025-12-29'))).toBe('29 Dec 2025 to 4 Jan 2026');
});
test('weekCredit sums one week only', () => {
  const s = [run(30, 'moderate', { date: '2026-10-19' }), run(30, 'moderate', { date: '2026-10-26' })];
  expect(weekCredit(s, parseYmd('2026-10-19'), activeGuide(30))).toEqual({ credit: 30, count: 1 });
});
```

- [ ] **Step 2:** Run `npm run app:test -- app/test/core/rules.test.js`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the three modules by moving the reference code (`web/js/app.js` sections "dates", "WHO 2020 guideline", "age group and active guideline", "derived values", `fmtDay`, `fmtWeekRange`) and replacing reads of `prefs.age` and `sessions` with parameters. `calc` takes `now` instead of calling `today()`.
- [ ] **Step 4:** Run the same command. Expected: PASS (6 tests).
- [ ] **Step 5: Commit** `git commit -m "Move dates, guideline and exercise rules into app/src/core with tests"`.

### Task 3: Core data helpers (Sonnet)

**Files:**
- Create: `app/src/core/sanitize.js`, `sample.js`, `history.js`, `gpx.js`, `gpxEffort.js`, `routines.js`, `facts.js`, `app/test/core/data.test.js`

**Interfaces:**
- Consumes: Task 2 modules.
- Produces:
  - `sanitize.js`: `sanitizeSessions(list)`, `sanitizeAge(a)`, `sanitizePlan(p)`, `sanitizeTracks(t)`, `pruneTracks(tracks, sessions) -> tracks`, `TRACK_CAP = 30`.
  - `sample.js`: `seedSessions(now) -> Session[]` (ids `sample_0` to `sample_33`), `samplePlan(now)`, `SAMPLE_TRACK_ID = 't_sample'`, `sampleTrack()`.
  - `history.js`: `buildHistory(sessions, guide, now, period) -> { years: string[], count, minutes, hit, weeks: [{ key: 'YYYY-MM-DD', title, rows, total, muscleDays, hit }] }` (the computation of `renderHistory` in the reference; `period` is `'all'` or a year string; `rows` sorted oldest first within a week; weeks newest first; `total` is the whole week's credit).
  - `gpx.js`: `export const GPX = globalThis.GPX`.
  - `gpxEffort.js`: `GPX_THRESHOLDS`, `GPX_KEEP_DAYS = 5 * 365 + 1`, `maxHrFor(age)`, `gpxOpts(type, age)`, `judgeEffort(m, pageType, age) -> { intensity, basis, text }`, `compactMetrics(m)`, `getTrack(session, tracks)`.
  - `routines.js`: `ROUTINES`, `routineVisible(r, group)`, `routineBalance(r)`, `buildSteps(r)`. `facts.js`: `FACTS`.

- [ ] **Step 1: Write the failing tests** in `app/test/core/data.test.js`:

```js
import { seedSessions } from '../../src/core/sample.js';
import { calc } from '../../src/core/rules.js';
import { sanitizeSessions } from '../../src/core/sanitize.js';
import { buildHistory } from '../../src/core/history.js';
import { activeGuide } from '../../src/core/guide.js';
import { parseYmd } from '../../src/core/dates.js';
const now = parseYmd('2026-10-24');
test('sample week: 96 aerobic minutes, 1 muscle day, 65+ reads 1 balance day', () => {
  const s = seedSessions(now);
  expect(s.map((x) => x.id)).toContain('sample_33');
  expect(calc(s, 30, now).total).toBe(96);
  expect(calc(s, 30, now).strengthDays).toBe(1);
  expect(calc(s, 70, now).balanceDays).toBe(1);
});
test('sanitizeSessions drops bad rows and keeps valid trackIds', () => {
  const ok = { id: 'a', date: '2026-10-20', type: 'run', minutes: 30, intensity: 'vigorous', source: 'gpx', trackId: 't_abc' };
  const out = sanitizeSessions([ok, { ...ok, minutes: 0 }, { ...ok, minutes: 241 }, { ...ok, date: '20-10-2026' }, { ...ok, type: 'fly' }, { ...ok, trackId: 'bad' }]);
  expect(out.length).toBe(2);
  expect(out[0].trackId).toBe('t_abc');
  expect('trackId' in out[1]).toBe(false);
});
test('history: weeks newest first, whole-week total across New Year, year filter', () => {
  const s = [
    { id: 'a', date: '2025-12-30', type: 'walk', minutes: 100, intensity: 'moderate', createdAt: 1 },
    { id: 'b', date: '2026-01-02', type: 'run', minutes: 30, intensity: 'vigorous', createdAt: 2 },
    { id: 'c', date: '2026-10-20', type: 'strength', minutes: 20, intensity: 'moderate', createdAt: 3 }
  ];
  const all = buildHistory(s, activeGuide(30), now, 'all');
  expect(all.years).toEqual(['2026', '2025']);
  expect(all.weeks.map((w) => w.title)).toEqual(['This week, 19 to 25 Oct 2026', '29 Dec 2025 to 4 Jan 2026']);
  expect(all.weeks[1].total).toBe(160);
  expect(all.weeks[1].hit).toBe(true);
  expect(all.weeks[0].muscleDays).toBe(1);
  const y = buildHistory(s, activeGuide(30), now, '2026');
  expect(y.count).toBe(2);
  expect(y.weeks[1].rows.map((r) => r.id)).toEqual(['b']);
  expect(y.weeks[1].total).toBe(160);
});
test('judgeEffort uses heart rate when the age is known, speed otherwise', () => {
  const text = readFileSync('tools/gpx/fixtures/garmin-run-hr-ele.gpx', 'utf8');
  const m = GPX.analyze(text, gpxOpts('run', 30)).metrics;   // avgHr 144, avgSpeedKmh 10.82
  expect(judgeEffort(m, 'run', 30).basis).toBe('hr');
  const noAge = judgeEffort(m, 'run', null);
  expect(noAge.basis).toBe('speed');
  expect(noAge.text.startsWith('Heart rate needs your age, which is not set yet')).toBe(true);
});
```

(also import `readFileSync` from `node:fs`, `GPX` from `../../src/core/gpx.js`, and `judgeEffort`, `gpxOpts` from `../../src/core/gpxEffort.js`; Vitest runs from the project root)

- [ ] **Step 2:** Run `npm run app:test -- app/test/core/data.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement by moving the reference sections "sample", "sanitize", "GPX import: effort, storage" (pure parts only), "timer" routines table, "Evidence slots", and the computation inside `renderHistory`. `seedSessions` and `samplePlan` take `now` instead of calling `today()`.
- [ ] **Step 4:** Run the same command. Expected: PASS (4 tests). Also run `npm run app:test` (all green).
- [ ] **Step 5: Commit** `git commit -m "Move sanitizers, sample data, history grouping and GPX effort into app/src/core"`.

### Task 4: Sync engine and data store (Opus)

**Files:**
- Create: `app/src/sync/merge.js`, `app/src/sync/store.js`, `app/src/sync/backend.js`, `app/src/stores/data.js`, `app/test/sync/merge.test.js`, `app/test/sync/store.test.js`, `app/test/stores/data.test.js`
- Modify: `package.json` (`test` drops `node --test "web/test/*.test.js"`)

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces:
  - `merge.js`: `mergeList(base, local, remote, idKey)`, `mergeMap(base, local, remote)` (named exports, same behaviour).
  - `store.js`: `createStore(backend, opts)` with the API documented at the top of `web/js/store.js` (`hydrate`, `get`, `set`, `remove`, `flush`, `pending`, `refresh`, `reset`).
  - `backend.js`: `createBackend(supabaseClient, { onAuthLost }) -> { fetchAll, put, remove, refreshAuth }` (moved from the adapter in `web/js/auth.js`).
  - `stores/data.js`: `useDataStore()` Pinia store. State `{ ready, meta, sessions, plan, prefs, tracks, today }`. Getters `group`, `guide`, `summary` (= `calc(sessions, prefs.age, today)`). Actions `attach(syncStore)`, `load()`, `persist()`, `addSession(fields) -> Session`, `removeSession(id) -> { session, track }`, `restoreSession({ session, track })`, `clearSample()`, `clearAll()`, `setAge(age)`, `setSound(on)`, `savePlan(plan)`, `deletePlan()`, `saveTrack(id, rec)`, `tick()` (updates `today`, used by the day rollover).

- [ ] **Step 1:** Port `web/test/merge.test.js` and `web/test/store.test.js` to `app/test/sync/` (replace `require` with imports, `node:test` with Vitest globals, keep `node:assert` calls). Run `npm run app:test -- app/test/sync`. Expected: FAIL (modules missing).
- [ ] **Step 2:** Create `merge.js` and `store.js` as ES module copies of `web/js/merge.js` and `web/js/store.js` (remove the global wrapper and `module.exports`, export the functions). Run again. Expected: PASS, 48 tests.
- [ ] **Step 3: Write the failing tests** in `app/test/stores/data.test.js` using a fake sync store (`get`/`set`/`remove` over a Map):

```js
test('new account seeds the sample and persists it', () => { /* load() on an empty fake: sessions has 34 rows, meta.sampleActive true, fake has w150.sessions */ });
test('first real entry clears the sample', () => { /* addSession({ type: 'walk', minutes: 20, intensity: 'moderate', source: 'log' }) -> sessions.length 1, meta.sampleActive false */ });
test('sessions older than 120 days survive persist', () => { /* load a 2024-10-24 session, persist(), fake still holds it */ });
test('remove and restore bring back the session and its track', () => { /* removeSession(id) on a gpx session deletes tracks[trackId]; restoreSession(result) puts both back */ });
test('clearAll keeps the age and deletes every server key including w150.breaks', () => { /* fake had w150.breaks; after clearAll it is gone, prefs.age kept */ });
test('remote change reloads state', () => { /* fake value changed, load() again -> sessions reflect the fake */ });
```

Write each body with concrete values; the comments state the assertions.
- [ ] **Step 4:** Run `npm run app:test -- app/test/stores`. Expected: FAIL.
- [ ] **Step 5:** Implement `stores/data.js` (port `loadState`, `persist`, `addSession`, `removeSession`, `undoRemove`, `clearSample`, `clearAllData` storage parts, `saveTracks`, `migrateSampleBalance`, `migrateSampleGpx`) and `backend.js`. Run again. Expected: PASS.
- [ ] **Step 6:** Remove `node --test "web/test/*.test.js"` from the `test` script (the tests now live in `app/test/sync`). Run `npm test`. Expected: all Vitest tests pass, gpx 42 passed 1 skipped.
- [ ] **Step 7: Commit** `git commit -m "Port the sync engine to ES modules and add the Pinia data store"`.

### Task 5: Auth, router and guards (Opus)

**Files:**
- Create: `app/src/auth/copy.js`, `app/src/auth/link.js`, `app/src/stores/auth.js`, `app/src/router.js`, `app/src/pages/auth/AuthLayout.vue`, `LoginPage.vue`, `RegisterPage.vue`, `CheckEmailPage.vue`, `ForgotPage.vue`, `ResetPage.vue`, `app/test/auth/link.test.js`, `app/test/auth/store.test.js`, `app/test/router.test.js`
- Modify: `app/src/main.js`, `app/src/App.vue`

**Interfaces:**
- Consumes: Task 4 `createStore`, `createBackend`, `useDataStore`.
- Produces:
  - `copy.js`: `COPY` (the `COPY` object of `web/js/auth.js`, verbatim).
  - `link.js`: `readLink(hash, search) -> { type, errorCode }`, `captureInitialLink()` (reads `location` once, before the client), `routeForLink(link) -> null | { path, query?, msg? }`.
  - `stores/auth.js`: `useAuthStore()`. State `{ client, user, profile, ready, sessionEnded, syncState }`. Actions `boot()`, `login(username, password)`, `register(fields)`, `usernameTaken(username)`, `recover(identifier, action)`, `resetPassword(password)`, `logout()`, `onSessionEnded()`.
  - `router.js`: `createAppRouter(pinia)`; route names `week`, `log`, `activity`, `login`, `register`, `check-email`, `forgot`, `reset`; `meta.auth: true` on the app routes.

- [ ] **Step 1: Write the failing tests:**

```js
// app/test/auth/link.test.js
test('copy is exact', () => {
  expect(COPY.wrong).toBe('Wrong username or password.');
  expect(COPY.recovery).toBe('If that account exists, we sent an email.');
  expect(COPY.rate).toBe('Too many attempts. Try again in a few minutes.');
});
test('routeForLink', () => {
  expect(routeForLink(readLink('#access_token=x&type=signup', ''))).toMatchObject({ path: '/login', msg: 'Email verified. You can log in now.' });
  expect(routeForLink(readLink('#access_token=x&type=recovery', ''))).toMatchObject({ path: '/reset' });
  expect(routeForLink(readLink('#error_code=otp_expired', ''))).toMatchObject({ path: '/forgot', msg: 'This link has expired or was already used. Request a new one.' });
  expect(routeForLink(readLink('#splits', ''))).toBe(null);
});
// app/test/router.test.js
test('guard redirects to login with next', async () => { /* logged out, push('/activity/sample_32?from=log') -> currentRoute is /login with query.next '/activity/sample_32?from=log' */ });
test('logged-in visitor on /login goes to next', async () => { /* user set, push('/login?next=/log') -> /log */ });
// app/test/auth/store.test.js
test('auth store keeps queued writes after session end and flushes for the same user', async () => { /* fake sync store with pending write; onSessionEnded() keeps it; login as same user calls flush once */ });
test('a different user resets the store and reloads', async () => { /* login as another user -> reset called, window.location.reload called */ });
```

- [ ] **Step 2:** Run `npm run app:test -- app/test/auth app/test/router.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement by porting `web/js/auth.js` (boot, enterApp, logout with the 3 s flush limit and `signOut({ scope: 'local' })`, userSwitched, sessionEnded, register validation and the 500 check through `usernameTaken`, recover, openReset). The auth pages take their markup and ids from `web/js/auth-screens.js` (inside `AuthLayout.vue` with the shared header, intro and card). `main.js` calls `captureInitialLink()` before creating the client and router, then `router.replace(routeForLink(...))` when it is not null. `beforeunload` warns while `syncStore.pending()` (copy `Your last change is still saving.`).
- [ ] **Step 4:** Run the same command. Expected: PASS. Run `npm run test:smoke` (needs `npm run functions:serve`). Expected: 14 pass (server unchanged).
- [ ] **Step 5:** Browser check on `weekly150-app` (127.0.0.1:8160): register a new account, verify through Mailpit (127.0.0.1:54324), see `Email verified. You can log in now.`, log in, log out, forgot password neutral copy, an expired link shows the expired copy. App routes may still render a placeholder.
- [ ] **Step 6: Commit** `git commit -m "Add auth store, auth pages, email link routing and route guards"`.

### Task 6: App shell (Sonnet)

**Files:**
- Create: `app/src/stores/ui.js`, `app/src/components/AppHeader.vue`, `AppFooter.vue`, `LiveRegion.vue`, `app/test/shell.test.js`
- Modify: `app/src/App.vue`

**Interfaces:**
- Consumes: `useAuthStore`, `useDataStore`.
- Produces: `useUiStore()` with state `{ theme: 'auto' | 'light' | 'dark', live }`, actions `cycleTheme()`, `announce(text)`; `App.vue` renders `AppHeader`, `LiveRegion`, `<router-view>` and `AppFooter` for app routes and only `<router-view>` for auth routes.

- [ ] **Step 1: Write the failing tests:** `cycleTheme` goes auto, light, dark, auto and stores `"light"` etc. under `w150.theme` in localStorage (and survives a throwing localStorage); the header renders ids `wordmark`, `nav-log`, `nav-streak`, `nav-plan`, `nav-snacks`, `nav-history`, `nav-evidence`, `sync-status`, `who-name`, `header-log`, `theme-toggle`, `logout`, with `aria-current="page"` on `nav-history` at `/log`; `sync-status` shows `Saving`, `Saved`, `Not saved, retrying` for the three states.
- [ ] **Step 2:** Run `npm run app:test -- app/test/shell.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement. Header markup from `web/index.html` (`<header class="site-header">`), section links as `<RouterLink to="/#log">` etc., `Full log` to `/log`. Footer: the week page footer (with Clear all, filled in Task 11) on `/`, the short footer from `web/log.html` elsewhere. Day rollover: `setInterval(data.tick, 60000)` and on `visibilitychange`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the app shell: header, theme, sync status, live region, footer"`.

### Task 7: Full log page (Sonnet)

**Files:**
- Create: `app/src/pages/LogPage.vue`, `app/src/components/SplitRow.vue`, `app/src/components/UndoBar.vue`, `app/test/pages/log.test.js`

**Interfaces:**
- Consumes: `buildHistory`, `useDataStore` (`removeSession`, `restoreSession`).
- Produces: `SplitRow` props `{ session, guide, idPrefix: '' | 'hist-', from: 'week' | 'log' }`, emits `remove(id)`; Details is a `RouterLink` to `{ name: 'activity', params: { id }, query: { from } }`. `UndoBar` props `{ idPrefix }` (`''` gives ids `undo-bar`, `undo-text`, `undo-btn`; `'history-'` gives `history-undo-bar`, `history-undo-text`, `history-undo`), exposes `show(text, onUndo)`.

- [ ] **Step 1: Write the failing tests** (mount with Pinia and the router; set `data.today = parseYmd('2026-10-24')`, `prefs.age = 30`). Fixture A, built in the test: for `back` from 730 down to 1, skip unless `(back * 7) % 5 <= 1`, add a session on `today - back` days (type cycling `walk, run, cycle, swim, strength, walk, yoga` by `back % 7`, minutes `15 + (back % 6) * 10`, moderate), 292 sessions in 105 weeks. With fixture A: 8 `.history-week`, `#history-more` text `Show older weeks (97 more)`, 16 weeks after a click, `#history-period` options `all,2026,2025,2024`, `#history-count` `292`. Fixture B is `seedSessions(today)`: Remove on the first row shows `#history-undo-bar` with `Removed Walk, 40 min, Mon 19 Oct.` and Undo brings `#history-count` back to `34`; the Details link of a gpx row has href `/activity/sample_32?from=log`; empty data shows `#history-empty` text `Nothing logged yet. Every session you log shows up here, grouped by week.`.
- [ ] **Step 2:** Run `npm run app:test -- app/test/pages/log.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement from `web/log.html` markup and `renderHistory`, `showMoreHistory`, `removeSession`, `undoRemove` behaviour (focus `history-undo` after a remove, the restored row's `hist-remove-<id>` after Undo, the first new week title after Show older weeks).
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the full log page"`.

### Task 8: Activity page (Opus)

**Files:**
- Create: `app/src/pages/ActivityPage.vue`, `app/src/components/ActivityStats.vue`, `RouteMap.vue`, `LineChart.vue`, `SplitsSheet.vue`, `app/src/core/chartMath.js`, `app/test/pages/activity.test.js`, `app/test/core/chartMath.test.js`

**Interfaces:**
- Consumes: `getTrack`, `sampleTrack`, `GPX`, `useDataStore`.
- Produces: `chartMath.js`: `niceStep(range, target)`, `timeStep(range)`, `nearestIdx(arr, d)`, `pctile(v, p)`, `sortedNums(a)`, `chartSpecs(m, type)`. `LineChart` props `{ spec, distM, total, cursor }`, emits `cursor(index)`; `RouteMap` props `{ track, type, cursor }`.

- [ ] **Step 1: Write the failing tests:** `chartMath`: `niceStep(100, 4)` is `20`, `niceStep(3000, 5)` is `500`, `timeStep(40)` is `10`, `timeStep(9000)` is `1800`, `nearestIdx([0, 10, 20], 14)` is `1`; `/activity/sample_32?from=log` renders `#gpx-d-title` `Morning loop`, document title `Morning loop, Weekly 150`, `#activity-back` href `/log` text `Back to the full log`, 4 `svg` in `#gpx-d-body`; `from=week` gives href `/#splits` text `Back to this week`; an unknown id shows `#activity-missing` and title `Activity not found, Weekly 150`; removed session shows not found (remove through the data store while mounted).
- [ ] **Step 2:** Run `npm run app:test -- app/test/pages/activity.test.js app/test/core/chartMath.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement from `web/activity.html` and the reference "detail view" (`renderDetail`, `buildStats`, `drawRoute`, `routeLegend`, `drawChart`, `setCursor`, `splitsSheet`, `redrawDetailGraphics`). SVG is built with Vue templates or `document.createElementNS`; keep the shared crosshair, arrow key reading, the `gpx-d-live` announcements and redraw on resize (ResizeObserver on the route box).
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Browser check on `weekly150-app`: `/activity/sample_32?from=log` at 375px light and desktop dark, hover and arrow keys move the crosshair on every chart and the route, no horizontal scroll.
- [ ] **Step 6: Commit** `git commit -m "Add the activity page with stats, route, charts and splits"`.

### Task 9: Week page, part 1: hero, age step, log form, splits (Sonnet)

**Files:**
- Create: `app/src/pages/WeekPage.vue`, `components/HeroBand.vue`, `AgeStep.vue`, `LogForm.vue`, `SplitsSection.vue`, `SampleBanner.vue`, `app/test/pages/week.test.js`
- Modify: `app/src/router.js` (scroll behaviour)

**Interfaces:**
- Consumes: `useDataStore`, `SplitRow`, `UndoBar`, `calc` through `summary`.
- Produces: `SplitsSection` contains the `#gpx-bar` slot used by Task 10 (`<slot name="import" />`), `#history-link` with `#splits-history` to `/log`, Earlier imports list with Details links `?from=week`. Router `scrollBehavior(to)` returns a promise that resolves after `useDataStore().ready` and the next tick, to `{ el: to.hash }` when the hash names an element.

- [ ] **Step 1: Write the failing tests:** age unset shows the age step and `Preview: adult targets until you set your age`; setting age 30 shows `Bank 150 minutes this week.`; logging 20 minutes moderate walk shows `#log-status` `Logged. 20 minutes toward this week.` and adds a `#splits-body` row; the first real entry hides `#sample-banner`; Clear sample shows `Sample cleared. Your log starts now.`; minutes `0` shows `Enter minutes from 1 to 240.`; the week total in `#splits-total` is `96` for the sample at age 30; Remove then Undo in the week table; `scrollBehavior waits for data ready` (resolves only after `ready` turns true).
- [ ] **Step 2:** Run `npm run app:test -- app/test/pages/week.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement from `web/index.html` (hero band, age step, log panel, splits section, sample banner) and the reference functions `renderHero`, `setBibNumber`, `nextStepLine`, `renderBalance`, `buildLane`, `applyGuide`, `syncActivityOptions`, `syncLogForm`, `onAgeSubmit`, `buildDateOptions`, `onLogSubmit`, `renderSplits`, `renderEarlier`. Header Log links skip to `#log-activity` focus, and open the age step when it is showing.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add the week page hero, age step, log form and splits"`.

### Task 10: Week page, part 2: GPX import (Opus)

**Files:**
- Create: `app/src/components/GpxImport.vue`, `app/src/composables/useGpxQueue.js`, `app/test/pages/gpx-import.test.js`

**Interfaces:**
- Consumes: `GPX`, `judgeEffort`, `gpxOpts`, `compactMetrics`, `useDataStore` (`addSession`, `saveTrack`).
- Produces: `useGpxQueue()` -> `{ enqueue(files, trigger), item, status, errors, lastSavedId, save(fields), cancel() }`. `GpxImport.vue` fills the `import` slot (buttons `gpx-pick-splits`, `gpx-pick-log` in the log panel, drop zones `gpx-bar`, `gpx-drop`, review form `gpx-review`, `gpx-errors`, `gpx-status`, `gpx-last` with `gpx-last-link`).

- [ ] **Step 1: Write the failing tests** (files from `tools/gpx/fixtures/` wrapped in `File`): `garmin-run-hr-ele.gpx` opens the review with `#gpx-r-title` `Check this import`, effort from heart rate when the age is set; Save adds a session with `source: 'gpx'`, a `trackId` matching `^t_`, a stored track, and shows `#gpx-last-link` with href `/activity/<id>?from=week`; `not-gpx.xml` lists an error and imports nothing; importing the same file twice shows `#gpx-dup`; a date older than 5 years shows `Imports go back 5 years, so pick a newer date or skip this file.`; two files show `Import review, file 1 of 2`.
- [ ] **Step 2:** Run `npm run app:test -- app/test/pages/gpx-import.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement from the reference "import queue and review card" and "storage" (`enqueueFiles`, `nextGpxFile`, `importGpxText`, `itemAnalysis`, `findDuplicate`, `showReview`, `onGpxSave`, `onGpxCancel`, `finishGpxBatch`, `wireDropTarget`, `storeTrack` with `TRACK_CAP`). A file dropped outside the drop zones must not replace the page.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add GPX import with review card on the week page"`.

### Task 11: Week page, part 3: streak, plan, snacks, evidence, clear all (Sonnet)

**Files:**
- Create: `app/src/components/StreakGrid.vue`, `PlanSection.vue`, `SnacksSection.vue`, `EvidenceSection.vue`, `ClearAll.vue`, `app/src/composables/useTimer.js`, `app/test/pages/week-more.test.js`

**Interfaces:**
- Consumes: `ROUTINES`, `buildSteps`, `FACTS`, `useDataStore` (`savePlan`, `deletePlan`, `addSession`, `setSound`, `clearAll`).
- Produces: `useTimer()` -> `{ state, routine, steps, elapsed, load(id), start(), skip(), reset(), logFull(), logPartial() }` with an injectable clock for tests.

- [ ] **Step 1: Write the failing tests:** the sample grid shows 84 day cells and the legend; saving a plan and pressing "I did it today" logs a `habit` session and Undo removes it; the Brisk loop routine runs through 3 steps with a fake clock and "Log it" adds a 10 minute moderate walk with `source: 'snack'`; `#facts` renders one row per complete fact; Clear all asks to confirm, then shows `All cleared.`, keeps the age and leaves no sessions.
- [ ] **Step 2:** Run `npm run app:test -- app/test/pages/week-more.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement from `web/index.html` sections streak, plan, snacks, evidence, footer and the reference functions (`renderGrid`, plan section, timer section with `ensureAudio` and `beep`, `renderFacts`, `clearAllData`).
- [ ] **Step 4:** Run the same command. Expected: PASS. Run `npm test`. Expected: all green.
- [ ] **Step 5: Commit** `git commit -m "Add streak grid, plan, snacks, evidence and clear all to the week page"`.

### Task 12: Cutover and verification (Sonnet)

**Files:**
- Modify: `vercel.json`, `tools/web/build.js`, `.claude/launch.json`, `.gitignore`, `package.json`, `CLAUDE.md`, `docs/local-dev.md`, `docs/deploy.md`, `docs/PROGRESS.md`, `docs/implementation-log.md`
- Delete: `web/` (all files), `tools/web/serve.js`

- [ ] **Step 1:** `vercel.json`: `"installCommand": "npm ci"`, `"buildCommand": "npm run app:build"`, `"outputDirectory": "app/dist"`, `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`, drop `cleanUrls`. `tools/web/build.js` stops writing `web/config.js` and `web/js/gpx-lib.js`. Launch config `weekly150-web` runs `npm run app:dev` on 8160 (remove `weekly150-app`). Remove the `web/` lines from `.gitignore`.
- [ ] **Step 2:** Delete `web/` and `tools/web/serve.js`. Update CLAUDE.md (paths `app/` instead of `web/`, run steps, secret grep on `app/src app/index.html app/dist`), `docs/local-dev.md`, `docs/deploy.md` (install, build, output, rewrite), `docs/PROGRESS.md` (status, files table, how to verify), implementation log entry L.
- [ ] **Step 3: Verify** `npm test` (all Vitest tests and gpx 42 passed 1 skipped), `npm run db:test` (71), `npm run test:smoke` (14), `npm run app:build` (exit 0), `grep -rE "service_role|SERVICE_ROLE" app/src app/index.html app/dist` (nothing), `grep -rnE "v-html" app/src` (nothing), dash check on `app/ docs/ tools/web/`.
- [ ] **Step 4: Browser check** on `weekly150-web`: register, verify through Mailpit, log in, log a session, reload; `/log` and `/activity/:id` by reload and by direct URL while logged out (login then back); Back to this week scrolls to the table; GPX import; Clear all; forgot password; 375px and desktop, light and dark.
- [ ] **Step 5: Commit** `git commit -m "Switch local dev and Vercel to the Vue app and remove web/"`.
