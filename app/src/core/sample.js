/* Sample data for a brand-new account. Moved from web/js/app.js; today() is now a parameter. */
import { ymd, parseYmd, addDays, weekStart, dayIndex } from './dates.js';
import { GPX } from './gpx.js';
import { judgeEffort } from './gpxEffort.js';

export const SAMPLE_PLAN = { after: 'pour my morning coffee', will: 'do 10 squats', where: 'the kitchen counter', minutes: 2 };
export const SAMPLE_TRACK_ID = 't_sample';            /* the sample run's track is generated in code, never stored */

const PREV_WEEKS = [
  [[0, 'walk', 55, 'M'], [2, 'run', 25, 'V'], [4, 'strength', 20, 'M'], [5, 'cycle', 50, 'M']],
  [[1, 'walk', 60, 'M'], [3, 'strength', 20, 'M'], [5, 'run', 30, 'V'], [6, 'walk', 35, 'M']],
  [[0, 'walk', 30, 'M'], [3, 'walk', 25, 'M'], [5, 'cycle', 40, 'M']],
  [[1, 'run', 25, 'V'], [2, 'strength', 20, 'M'], [4, 'walk', 60, 'M'], [6, 'swim', 40, 'M']],
  [[2, 'walk', 20, 'M'], [6, 'walk', 45, 'M']],
  [[0, 'yoga', 30, 'M'], [3, 'walk', 30, 'M'], [5, 'run', 20, 'V']],
  [[0, 'walk', 40, 'M'], [1, 'strength', 25, 'M'], [3, 'run', 25, 'V'], [5, 'cycle', 60, 'M']],
  [[4, 'walk', 25, 'M']],
  [[3, 'walk', 20, 'L']],
  [[1, 'walk', 20, 'M'], [5, 'walk', 30, 'M']],
  [[2, 'sport', 45, 'M']]
];
/* aerobic minutes: 40 + 36 (18 vigorous x2) + 20 = 96. The strength row is a muscle day and the light row is light activity: both add 0.
   The fourth field flags a walk that included balance work: the 65+ sample reads 1 of 3 balance days, other groups see no change. */
/* The fifth field 'gpx' marks the sample run as an imported track (generated in code by sampleTrack()), so Details works without an upload. */
const CUR_WEEK = [['walk', 40, 'M', true], ['strength', 15, 'M'], ['walk', 15, 'L'], ['run', 18, 'V', false, 'gpx'], ['walk', 20, 'M']];

/* Deterministic: fixed ids and times from today's date, so two devices that seed a brand-new
   account at the same time produce the same sample and the sync merge collapses it to one copy.
   now is today's date at local midnight. */
export function seedSessions(now) {
  const t = now, ws = weekStart(t), di = dayIndex(t);
  const rows = [];
  PREV_WEEKS.forEach(function (arr, i) {
    arr.forEach(function (r) { rows.push([addDays(ws, -7 * (i + 1) + r[0]), r[1], r[2], r[3], false, false]); });
  });
  CUR_WEEK.forEach(function (r, i) { rows.push([addDays(ws, Math.floor(i * (di + 1) / CUR_WEEK.length)), r[0], r[1], r[2], r[3] === true, r[4] === 'gpx']); });
  const base = t.getTime();
  return rows.map(function (r, i) {
    const s = { id: 'sample_' + i, date: ymd(r[0]), type: r[1], minutes: r[2], intensity: r[3] === 'V' ? 'vigorous' : r[3] === 'L' ? 'light' : 'moderate', balance: r[4] === true, source: r[5] ? 'gpx' : 'log', sample: true, createdAt: base - (rows.length - i) * 1000 };
    if (r[5]) s.trackId = SAMPLE_TRACK_ID;
    return s;
  });
}
/* the sample plan as stored for a new account */
export function samplePlan(now) {
  return Object.assign({ sample: true, savedAt: now.getTime() }, SAMPLE_PLAN);
}

/* ----- sample track: an 18 minute loop run, generated the same way every time (never stored) ----- */
let sampleCache = null;
/* date is the sample run's 'YYYY-MM-DD' (the reference reads s.date); age feeds the effort text (the reference reads prefs.age).
   Both are optional: no date uses today's, no age reads as 'age not set'. */
export function sampleTrack(date, age) {
  if (date === undefined) date = ymd(new Date());
  if (age === undefined) age = null;
  const key = date + '|' + age;
  if (sampleCache && sampleCache.key === key) return sampleCache.rec;
  const LAT0 = -6.2186, LON0 = 106.8019, A = 560, B = 380, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
  const ring = [], cum = [0], N = 720;
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI / 2 + i / N * 2 * Math.PI;
    ring.push([A * Math.cos(th) + 6 * Math.sin(7 * th), B * Math.sin(th) + 4 * Math.cos(5 * th), th]);
    if (i) cum.push(cum[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
  }
  const per = cum[N], d0 = parseYmd(date);
  const t0 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 6, 10, 0).getTime();
  const pts = [];
  let dist = 0, j = 0;
  for (let t = 0; t <= 1080; t += 2) {
    if (t) dist += 2 * (2.6 + 0.35 * Math.sin(Math.PI * t / 1200) + 0.05 * Math.sin(t / 37));
    const sd = dist % per;
    if (sd < cum[j]) j = 0;
    while (j < N - 1 && cum[j + 1] < sd) j++;
    const f = (sd - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    const x = ring[j][0] + (ring[j + 1][0] - ring[j][0]) * f + 2 * Math.sin(t / 23);
    const y = ring[j][1] + (ring[j + 1][1] - ring[j][1]) * f + 2 * Math.cos(t / 31);
    const th = ring[j][2];
    pts.push({ lat: LAT0 + y / MLAT, lon: LON0 + x / MLON, t: t0 + t * 1000, ele: 9 + 3 * Math.sin(2 * th) + 1.5 * Math.sin(5 * th), hr: Math.round(116 + 42 * (1 - Math.exp(-t / 200)) + 4 * Math.sin(t / 70)), cad: 84 + Math.round(2 * Math.sin(t / 50)), power: null, temp: 27 });
  }
  const segs = GPX.clean([pts], { type: 'run' });
  const m = GPX.metrics(segs, { type: 'run' });
  const rec = { name: 'Morning loop', type: 'run', startTime: t0, metrics: m, track: GPX.downsample(segs, 300), classification: judgeEffort(m, 'run', age), deviceNote: null, importedAt: 0, sample: true };
  sampleCache = { key: key, rec: rec };
  return rec;
}
