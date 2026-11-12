/*
 * The story model: turns a run session and its stored activity record into what the story templates
 * draw and what the story page uses (eligibility, week figures, lanes, route path, template availability).
 * Pure: no Vue, no DOM, no storage.
 *
 * Assumed record shape (what getTrack() in core/gpxEffort.js returns: a w150.tracks entry, or the sample run):
 *   rec = {
 *     name, type, startTime (ms since epoch, local clock) | null,
 *     metrics: { distanceM, movingS, avgPaceSPerKm, bestKmPaceS, avgHr, maxHr, elevGainM, avgCad, ...,
 *                splits: [{ index, distanceM, timeS | null, paceSPerKm | null, partial }] },
 *     track: { lat: [], lon: [], t: [] | null, ele, hr, brk: [indices where a new segment starts] },
 *     classification, deviceNote, importedAt
 *   }
 * The route points are rec.track (GPX.downsample output); routePath() takes that object.
 */
import { numberValues } from './numbers.js';
import { credit, weekCredit, TYPE_LABEL } from '../core/rules.js';
import { activeGuide, ageGroup } from '../core/guide.js';
import { weekStart, parseYmd, ymd, addDays, dayIndex, WD, MON } from '../core/dates.js';
import { isNum } from '../core/gpxEffort.js';
import { fmtMinSec } from '../core/format.js';

const MAX_KM_LANES = 10;
const BLOCK_KM = 5;
const SLOW_FRAC = 0.55;
export const REASON_C = 'Needs at least 2 full km.';
export const REASON_E = 'Needs a weekly target. Set your age first.';

function pointCount(rec) {
  const t = rec && rec.track;
  return t && Array.isArray(t.lat) && Array.isArray(t.lon) ? Math.min(t.lat.length, t.lon.length) : 0;
}

export function storyEligible(session, rec) {
  return !!session && session.type === 'run' && !!rec && pointCount(rec) >= 2;
}

/* Week figures for the week of the run (not the current week), counted like the week page:
   credit() per session through weekCredit() with the guide for the age. */
export function weekNumbers(session, sessions, age) {
  const g = ageGroup(age);
  if (!session || g === 'unset' || g === 'under5') return null;
  const guide = activeGuide(age);
  const ws = weekStart(parseYmd(session.date));
  const a = ymd(ws), b = ymd(addDays(ws, 6));
  const own = Number(session.createdAt) || 0;
  const inWeek = (sessions || []).filter(function (s) { return s && s.date >= a && s.date <= b; });
  const earlier = inWeek.filter(function (s) {
    if (s.id === session.id) return false;
    return s.date < session.date || (s.date === session.date && (Number(s.createdAt) || 0) < own);
  });
  const before = weekCredit(earlier, ws, guide).credit;
  const add = credit(session, guide);
  const di = dayIndex(parseYmd(session.date));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = ymd(addDays(ws, i));
    const on = inWeek.some(function (s) { return s.date === d && credit(s.id === session.id ? session : s, guide) > 0; });
    days.push({ on: on, today: i === di });
  }
  return { target: guide.aerobic, before: before, add: add, after: before + add, days: days };
}

function splitTime(x) {
  return isNum(x.timeS) ? x.timeS : x.paceSPerKm * x.distanceM / 1000;
}

/* One lane per full km up to 10; above that, complete 5 km blocks. Fewer than 2 lanes: none. */
export function lanes(m) {
  const sp = (m && Array.isArray(m.splits) ? m.splits : []).filter(function (x) {
    return x && !x.partial && isNum(x.paceSPerKm) && x.paceSPerKm > 0;
  });
  let rows;
  if (sp.length <= MAX_KM_LANES) {
    rows = sp.map(function (x, i) { return { label: String(i + 1), pace: x.paceSPerKm }; });
  } else {
    rows = [];
    for (let i = 0; i + BLOCK_KM <= sp.length; i += BLOCK_KM) {
      let t = 0, d = 0;
      for (let j = i; j < i + BLOCK_KM; j++) { t += splitTime(sp[j]); d += sp[j].distanceM; }
      rows.push({ label: String(i + BLOCK_KM), pace: d > 0 ? t / (d / 1000) : NaN });
    }
    rows = rows.filter(function (r) { return isNum(r.pace) && r.pace > 0; });
  }
  if (rows.length < 2) return [];
  let min = Infinity, max = -Infinity, bestI = 0;
  rows.forEach(function (r, i) {
    if (r.pace < min) { min = r.pace; bestI = i; }
    if (r.pace > max) max = r.pace;
  });
  const span = max - min;
  return rows.map(function (r, i) {
    return {
      label: r.label,
      paceText: fmtMinSec(r.pace),
      frac: span > 0 ? 1 - (1 - SLOW_FRAC) * (r.pace - min) / span : 1,
      best: i === bestI
    };
  });
}

/* The route projected like RouteMap.vue (equirectangular, longitude scaled by the cosine of the mid
   latitude, north up), fitted and centred in a boxW x boxH box with the aspect kept.
   cum is the running pixel length; a segment start (track.brk) adds no length. */
export function routePath(track, boxW, boxH) {
  const n = Math.min(track.lat.length, track.lon.length);
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (let i = 0; i < n; i++) {
    minLat = Math.min(minLat, track.lat[i]); maxLat = Math.max(maxLat, track.lat[i]);
    minLon = Math.min(minLon, track.lon[i]); maxLon = Math.max(maxLon, track.lon[i]);
  }
  const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const mx = function (lon) { return (lon - minLon) * 111320 * k; };
  const my = function (lat) { return (maxLat - lat) * 110574; };
  const dx = n ? mx(maxLon) : 0, dy = n ? my(minLat) : 0;
  let s = Math.min(dx > 0 ? boxW / dx : Infinity, dy > 0 ? boxH / dy : Infinity);
  if (!isFinite(s)) s = 1;
  const ox = (boxW - dx * s) / 2, oy = (boxH - dy * s) / 2;
  const brk = {};
  (track.brk || []).forEach(function (b) { brk[b] = true; });
  const pts = [], cum = [];
  for (let i = 0; i < n; i++) {
    const p = [ox + mx(track.lon[i]) * s, oy + my(track.lat[i]) * s];
    pts.push(p);
    if (i === 0) cum.push(0);
    else cum.push(cum[i - 1] + (brk[i] ? 0 : Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1])));
  }
  return { pts: pts, cum: cum, total: cum.length ? cum[cum.length - 1] : 0 };
}

const OK = function () { return { ok: true }; };

export function templateState(model) {
  const hasLanes = !!model && Array.isArray(model.lanes) && model.lanes.length >= 2;
  const hasWeek = !!model && !!model.week;
  return {
    A: OK(),
    B: OK(),
    C: hasLanes ? OK() : { ok: false, reason: REASON_C },
    D: OK(),
    E: hasWeek ? OK() : { ok: false, reason: REASON_E },
    F: OK()
  };
}

/* 'WED 7 OCT' for the run's start in local time, else for the session date */
function dateTextFor(session, rec) {
  const d = rec && isNum(rec.startTime) ? new Date(rec.startTime) : parseYmd(session.date);
  return (WD[dayIndex(d)] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]).toUpperCase();
}

/* null when the session cannot have a story (see storyEligible) */
export function buildModel(session, rec, sessions, age) {
  if (!storyEligible(session, rec)) return null;
  const dateText = dateTextFor(session, rec);
  const model = {
    kicker: TYPE_LABEL[session.type].toUpperCase() + ' · ' + dateText,
    dateText: dateText,
    values: numberValues(rec.metrics),
    week: weekNumbers(session, sessions, age),
    lanes: lanes(rec.metrics),
    track: rec.track,
    templates: null
  };
  model.templates = templateState(model);
  return model;
}
