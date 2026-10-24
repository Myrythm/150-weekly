# Weekly 150: project progress and handoff

Last updated: 2026-10-23. Read this first in a new session, then the files it points to.

## What this is

Weekly 150 is a single-page web app that gets people to exercise regularly. It works as a pocket training log built around the WHO 2020 physical activity guideline. It is one self-contained HTML file, `weekly-150.html`, published as a private claude.ai Artifact:

- Live page: https://claude.ai/artifact/BLA3m85d4r3qry7wFm4UTa (version 5 is current)
- Visual identity: a track meet. Paper race bib, blue track band with lane lines, results-sheet tables. Fonts: Barlow Condensed (display), Barlow (body), IBM Plex Mono (labels and numbers).
- All user data lives in the visitor's browser (localStorage). There is no backend.

## Files

| Path | What it is |
|---|---|
| `weekly-150.html` | The whole app (HTML, CSS, JS in one file, about 250 KB). This is what gets published. |
| `docs/PROGRESS.md` | This file. |
| `docs/page-contract.md` | Hosting rules the page must obey (CSP, no html/head/body tags, theme tokens, 400px, storage). Read before editing. |
| `docs/design-spec.md` | Original design spec (tokens, sections, copy, components, wireframes). The page has grown past it; the implementation log is newer. |
| `docs/implementation-log.md` | Detailed notes for every change A to H: functions, element ids, storage, decisions. The best map of the code. |
| `docs/research.md` | Cited health facts and guidelines (with confidence notes). |
| `docs/gpx-research.md` | Sources for the moderate vs vigorous thresholds used by GPX import (HR % of max, speed per activity). |
| `tools/gpx/gpx-lib.js` | GPX parser and metrics module. It is pasted verbatim inside the page script (marker comment "GPX parser and metrics: gpx-lib.js, pasted verbatim"). If you change it, change both copies. |
| `tools/gpx/gpx-lib.test.js` | Node tests for the parser (`cd tools/gpx && node gpx-lib.test.js`, expect 50 passed). Uses the real file below plus fixtures. |
| `tools/gpx/fixtures/`, `tools/gpx/make-fixtures.js` | Synthetic GPX test files (Garmin HR/ele, Strava ride with power, open-water swim, route only, pool swim, not GPX, spike) and their seeded generator. |
| `tools/build-preview.sh` | Wraps the page in the host's doctype skeleton into `.claude/preview/`, runs `node --check`, counts dashes. |
| `.claude/launch.json` | Preview server config `weekly150-preview` (python http.server on port 8150 serving `.claude/preview`). |
| `20261006Outdoor running_01 (1).gpx` | Real Mi Fitness export from the user. See the GPX notes below. |

## Version history

| Version | What changed |
|---|---|
| v1 | First build. Log a session, weekly 150 meter with race bib, 12-week grid, habit builder (implementation intention), exercise snacks with interval timer, 6 cited facts, light and dark themes. |
| v2 | Quick-minute chips in one row, streak message counts down from logged minutes, Lally 2010 wording ("typically" 66 days). |
| v3 | Guideline audit fixes A to F (see below). |
| v4 | Fix G: balance days need moderate effort or more. |
| v5 | Fix H: GPX import, review card, activity detail view. |

## Features (current state)

1. **Age first, age-based targets (A).** The visitor enters an age before targets apply. One `GUIDE` table drives everything:
   - 5 to 17: 420 min/week (60 a day), vigorous counts 1:1, muscle and bone strengthening 3 days, vigorous 3 days.
   - 18 to 64: 150 min/week credit (moderate + 2 x vigorous), muscle strengthening 2 days, stretch goal 300.
   - 65+: as adults, plus balance days 3 per week.
   - Under 5: no targets, link to the WHO under-5 guideline.
2. **Strength counted separately (B).** Strength sessions count as muscle days only, never as aerobic minutes.
3. **Light activity (C).** Light effort can be logged and is shown, but never counts toward the target.
4. **Balance for 65+ (D, G).** "Balance days: N of 3", activities Balance or tai chi and Dance, a "this session included balance work" checkbox, the "Steady feet" routine. A session counts only at moderate effort or more.
5. **Sit less (E).** WHO sedentary advice per age group, "I got up and moved" counter (per day, own storage key), optional nudge every 30 minutes while the page is open.
6. **Stretch goal (F).** After 150, adults and 65+ see progress toward 300.
7. **GPX import (H).**
   - Import GPX button and drop zones, several files at once.
   - Review card before saving: activity, date, minutes and effort are editable. Effort comes from HR % of max when the file has HR and the age is known, otherwise from speed.
   - Saved as a normal session (`source: 'gpx'`, `trackId`), so all rules apply.
   - Detail view: stats, SVG route coloured by HR or speed (no map tiles, OpenStreetMap link instead), pace/speed, elevation and HR charts with a shared crosshair, per km / 5 km / 100 m splits, and the device-total note.
   - Imports from other weeks appear under "Earlier imports".
8. **Always there:** sample data on first visit (clearly marked, cleared by the first real entry), Undo on remove, inline confirms, theme toggle Auto/Light/Dark, 400px layout.

## Storage (localStorage, all through try/catch helpers `load()` / `save()`)

| Key | Shape |
|---|---|
| `w150.meta` | sample state etc. |
| `w150.sessions` | array of `{id, date, type, minutes, intensity: light/moderate/vigorous, source, sample, balance, trackId?, note?, createdAt}` |
| `w150.plan` | habit plan (after I / I will / at) and its day record |
| `w150.prefs` | `{age, sound, nudge, ...}` |
| `w150.theme` | auto / light / dark |
| `w150.breaks` | `{"YYYY-MM-DD": count}` for the last 30 days |
| `w150.tracks` | `{trackId: {name, type, startTime, metrics, track (max 500 points), classification, deviceNote, importedAt}}`, max 30 tracks |

Key functions: `calc()`, `credit()`, `isStrength()`, `isLight()`, `isBalance()`, `countsAsBalance()`, `activeGuide()`, `applyGuide()`, `renderAll()`, `addSession()`, `syncLogForm()`, `judgeEffort()`, `openDetail()`. Details in `docs/implementation-log.md`.

## GPX notes

- The real Mi Fitness file has lat, lon and time only (no ele, HR, cadence). Its header says `totalDistance` 5052 m but the points add up to 2.02 km in 13:27 (6:39 /km). The file name ends in `_01`, so it is probably one part of a split export. The page computes from the points and shows a note.
- Its start time is 18:48 UTC, which is Wed 7 Oct 01:48 in UTC+7, so it lands on 7 Oct (date is editable in the review card).
- Thresholds (`GPX_THRESHOLDS` in the page): HR moderate 64 to 76% of max, vigorous 77%+, max HR 220 minus age (Tanaka 208 minus 0.7 x age under 18). Speed: walk 4.0 / 7.2 km/h, run 4.2 / 6.4, cycle 16.1 vigorous, swim crawl 1.6 / 2.6, open water vigorous. The CDC HR percentages are Secondary (taken from a search excerpt).
- Pool swims without GPS points are rejected with a plain message.

## Open items and ideas (not done)

- Daily steps logging (Saint-Maurice 2020 fact is shown, but steps cannot be entered).
- A habit plan like "do 10 squats" is stored as type `habit` and does not count as a strength day.
- Not tested: a real file picker and a real drag from the desktop, Safari and iOS, screen readers, the published host on a phone.
- The full 1280px desktop layout was mostly checked by DOM measurement (the Browser pane is narrow), not by eye.
- Evidence to verify against the original papers before sharing publicly: Wen 2011 (14%, about 3 years) and O'Donovan 2017 weekend warrior (shown qualitatively).
- Balance days: yoga counts for 65+ even though its label is "Yoga or stretching".

## How to work on it

1. Read `docs/page-contract.md` and the relevant part of `docs/implementation-log.md`.
2. Edit `weekly-150.html`. Keep tokens (every colour defined in all three token blocks), stable ids, existing localStorage keys (add fields with defaults, never rename), and `credit()` as the single route for aerobic minutes.
3. Verify: `bash tools/build-preview.sh`, then start the `weekly150-preview` server and test in the Browser pane at 375px and desktop, light and dark. If the parser changed: `cd tools/gpx && node gpx-lib.test.js`.
4. Publish to the same URL. In a new conversation, first read the artifact (`Artifact` action `read` with the URL above), then publish `weekly-150.html` with that `url` so the link stays the same.
5. Append a short entry to `docs/implementation-log.md` and update this file.

## Working conventions from the user

- Delegate work to sub-agents by difficulty, assessed first: difficult tasks to Opus, moderate to Sonnet, low to Haiku. Run agents that edit `weekly-150.html` one at a time (same file); independent work (research, standalone modules) can run in parallel. Verify their results yourself before publishing.
- No em dashes or en dashes anywhere (copy, code comments, commits, docs).
- No Claude or Anthropic attribution in commits or docs.
- The user writes in Indonesian; reply in Indonesian.
