/* Chart and route math for the activity page. Moved from the "detail view" section of web/js/app.js
   (f1, sortedNums, pctile, niceStep, timeStep, nearestIdx, chartSpecs, chartUnitNote); readAt is the
   per chart half of setCursor. */
import { isNum, km1 } from './gpxEffort.js';
import { fmtMinSec, fmtDistShort } from './format.js';

export function f1(x) { return Math.round(x * 10) / 10; }
export function sortedNums(a) { return a.filter(isNum).sort(function (x, y) { return x - y; }); }
export function pctile(v, p) { return v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; }
export function niceStep(range, target) {
  const raw = range / Math.max(1, target), p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}
export function timeStep(range) { const c = [5, 10, 15, 20, 30, 60, 120, 300, 600, 1200]; return c.find(function (s) { return range / s <= 5; }) || 1800; }
export function nearestIdx(arr, d) {
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid] < d) lo = mid; else hi = mid; }
  return Math.abs(arr[lo] - d) <= Math.abs(arr[hi] - d) ? lo : hi;
}

/* the charts a track has: pace (or speed for cycling, pace per 100 m for swimming), elevation, heart rate */
export function chartSpecs(m, type) {
  const s = m.series || {}, out = [];
  const has = function (a) { return Array.isArray(a) && a.filter(isNum).length >= 2; };
  if (!Array.isArray(s.distM) || s.distM.length < 2) return out;
  if (type === 'cycle' && has(s.speedKmh)) out.push({ id: 'speed', title: 'Speed', vals: s.speedKmh, fmt: function (v) { return km1(v) + ' km/h'; }, tick: function (v) { return String(Math.round(v)); }, clip: true, avg: isNum(m.avgSpeedKmh) ? km1(m.avgSpeedKmh) + ' km/h' : null, nullText: 'stopped' });
  else if (type === 'swim' && has(s.paceSPerKm)) out.push({ id: 'pace', title: 'Pace per 100 m', vals: s.paceSPerKm.map(function (v) { return isNum(v) ? v / 10 : null; }), fmt: function (v) { return fmtMinSec(v) + ' /100 m'; }, tick: fmtMinSec, invert: true, clip: true, time: true, avg: fmtMinSec(m.avgPaceSPer100m) ? fmtMinSec(m.avgPaceSPer100m) + ' /100 m' : null, nullText: 'stopped' });
  else if (type !== 'cycle' && type !== 'swim' && has(s.paceSPerKm)) out.push({ id: 'pace', title: 'Pace', vals: s.paceSPerKm, fmt: function (v) { return fmtMinSec(v) + ' /km'; }, tick: fmtMinSec, invert: true, clip: true, time: true, avg: fmtMinSec(m.avgPaceSPerKm) ? fmtMinSec(m.avgPaceSPerKm) + ' /km' : null, nullText: 'stopped' });
  if (has(s.ele)) out.push({ id: 'ele', title: 'Elevation', vals: s.ele, fmt: function (v) { return Math.round(v) + ' m'; }, tick: function (v) { return String(Math.round(v)); }, area: true, minSpan: 20, avg: null, nullText: 'no reading' });
  if (has(s.hr)) out.push({ id: 'hr', title: 'Heart rate', vals: s.hr, fmt: function (v) { return Math.round(v) + ' bpm'; }, tick: function (v) { return String(Math.round(v)); }, minSpan: 20, avg: isNum(m.avgHr) ? Math.round(m.avgHr) + ' bpm' : null, nullText: 'no reading' });
  return out;
}
export function chartUnitNote(spec) { return spec.id === 'pace' ? 'Faster is higher.' : ''; }

/* the reading of one chart at distance d: the nearest point, its value and the text shown and announced */
export function readAt(spec, distM, d) {
  const i = nearestIdx(distM, d), val = spec.vals[i];
  return { i: i, val: val, txt: (isNum(val) ? spec.fmt(val) : spec.nullText) + ' at ' + fmtDistShort(distM[i]) };
}
