/* GPX import: effort thresholds and the pure helpers around them. Moved from web/js/app.js;
   prefs.age and the closure over tracks are now parameters. */
import { GPX } from './gpx.js';
import { SAMPLE_TRACK_ID, sampleTrack } from './sample.js';

/* the server keeps every session; GPX imports can be dated up to 5 years back */
export const GPX_KEEP_DAYS = 5 * 365 + 1;

/* ===== GPX import settings =====
   Effort thresholds for imported tracks (gpx-research.md). METs: light below 3, moderate 3 to 5.9, vigorous 6 or more
   (WHO 2020, CDC). Speeds: 2024 Adult Compendium bands converted to km/h. Heart rate: CDC 64 to 76% of max HR is
   moderate, 77% and up vigorous; max HR is 220 minus age from 18, and 208 minus 0.7 x age (Tanaka) under 18.
   hr, speedKmh and placeholder go to GPX.classify / GPX.analyze as they are; the rest is read by judgeEffort(). */
export const GPX_THRESHOLDS = {
  placeholder: false,
  hr: { maxHrBase: 220, moderatePct: 64, vigorousPct: 77, minSamples: 10 },
  speedKmh: {
    walk: { moderate: 4.0, vigorous: 7.2 },    /* below 4.0 light (2.3 to 2.8 METs), 7.2 and up 7.0+ METs */
    run: { moderate: 4.2, vigorous: 6.4 },     /* jogging 4.2 to 6.3 is 3.3 METs; 6.4 and up 6.5+ METs */
    cycle: { moderate: 0, vigorous: 16.1 },    /* leisure riding below 16.1 is 4.0 to 5.8 METs */
    swim: { moderate: 1.6, vigorous: 2.6 }     /* crawl 1.6 to 2.5 is 5.8 METs, 2.6 and up 8.0+ */
  },
  runAsWalkBelowKmh: 4.2,          /* a "run" slower than this is judged with the walking bands */
  swimSpeedTrustKmh: [1.6, 6.0],   /* GPS swim speed outside the crawl table is not trusted ... */
  openWater: 'vigorous',           /* ... and open-water swimming (6.0 METs) applies instead */
  tanakaUnderAge: 18
};
export const TYPE_WORD = { run: 'running', walk: 'walking', cycle: 'cycling', swim: 'swimming', other: 'this activity' };

export function isNum(x) { return typeof x === 'number' && isFinite(x); }
export function km1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
export function maxHrFor(age) {
  if (age === null || age === undefined || age < 5) return null;
  return age < GPX_THRESHOLDS.tanakaUnderAge ? 208 - 0.7 * age : GPX_THRESHOLDS.hr.maxHrBase - age;
}
export function gpxOpts(type, age) {
  const o = { thresholds: GPX_THRESHOLDS }, mh = maxHrFor(age);
  if (type) o.type = type;
  if (mh !== null) o.maxHr = mh;
  return o;
}
function speedBand(sp, inten) {
  if (inten === 'vigorous') return km1(sp.vigorous) + ' km/h and up';
  if (inten === 'moderate') return sp.moderate > 0 ? km1(sp.moderate) + ' to ' + km1(sp.vigorous - 0.1) + ' km/h' : 'below ' + km1(sp.vigorous) + ' km/h';
  return 'moderate starts at ' + km1(sp.moderate) + ' km/h';
}
/* The effort a track suggests and why, in plain words: heart rate first (needs an age), then speed, then a default. */
export function judgeEffort(m, pageType, age) {
  const th = GPX_THRESHOLDS, maxHr = maxHrFor(age);
  if (age === undefined) age = null;
  const libType = pageType === 'other' ? ((m && m.type) || 'run') : pageType;
  const hasHr = !!m && isNum(m.avgHr) && m.avgHr > 0;
  const spd = (m && isNum(m.avgSpeedKmh) && m.avgSpeedKmh > 0) ? m.avgSpeedKmh : null;
  const asWalk = libType === 'run' && spd !== null && spd < th.runAsWalkBelowKmh;
  const opts = { type: asWalk ? 'walk' : libType, thresholds: th };
  if (maxHr !== null) opts.maxHr = maxHr;
  const cls = GPX.classify(m, opts);
  if (cls.basis === 'hr') {
    const pct = Math.round(m.avgHr / maxHr * 100);
    const band = cls.intensity === 'vigorous' ? th.hr.vigorousPct + '% and up' : cls.intensity === 'moderate' ? th.hr.moderatePct + '% to ' + (th.hr.vigorousPct - 1) + '%' : 'moderate starts at ' + th.hr.moderatePct + '%';
    return { intensity: cls.intensity, basis: 'hr', text: 'From your heart rate: average ' + Math.round(m.avgHr) + ' bpm is ' + pct + '% of your estimated max ' + Math.round(maxHr) + ', so this is ' + cls.intensity + ' (' + band + ').' };
  }
  const why = !hasHr ? 'No heart rate in this file' : age === null ? 'Heart rate needs your age, which is not set yet' : maxHr === null ? 'Heart rate zones here start at age 5' : 'Too few heart rate readings';
  if (pageType === 'other') return { intensity: 'moderate', basis: 'default', text: why + '. There is no speed rule for this activity, so effort starts at moderate. Change it if that is wrong.' };
  if (libType === 'swim') {
    const r = th.swimSpeedTrustKmh;
    if (cls.basis === 'speed' && spd >= r[0] && spd <= r[1]) return { intensity: cls.intensity, basis: 'speed', text: why + ', so effort comes from speed: ' + km1(spd) + ' km/h swimming is ' + cls.intensity + ' (' + speedBand(th.speedKmh.swim, cls.intensity) + ').' };
    return { intensity: th.openWater, basis: 'default', text: why + (spd !== null ? ', and GPS speed is not reliable enough for this swim. ' : '. ') + 'Open-water swimming is rated about 6 METs, which is vigorous.' };
  }
  if (cls.basis === 'speed') {
    const sp = th.speedKmh[asWalk ? 'walk' : libType];
    return { intensity: cls.intensity, basis: 'speed', text: why + ', so effort comes from speed: ' + km1(spd) + ' km/h' + (asWalk ? ' is walking pace, which is ' : ' ' + TYPE_WORD[libType] + ' is ') + cls.intensity + ' (' + speedBand(sp, cls.intensity) + ').' };
  }
  return { intensity: 'moderate', basis: 'default', text: why + ', and no times to measure speed, so effort starts at moderate. Change it if that is wrong.' };
}

function roundArr(a, k) {
  if (!Array.isArray(a)) return null;
  const f = Math.pow(10, k);
  return a.map(function (v) { return isNum(v) ? Math.round(v * f) / f : null; });
}
function rnd(v, k) { return isNum(v) ? Math.round(v * Math.pow(10, k)) / Math.pow(10, k) : null; }
/* the summary plus a rounded series (about 300 points) for the charts; keeps w150.tracks small */
export function compactMetrics(m) {
  const o = Object.assign({}, m), s = m.series || {};
  o.series = { distM: roundArr(s.distM, 1), tS: roundArr(s.tS, 0), ele: roundArr(s.ele, 1), hr: roundArr(s.hr, 0), cad: roundArr(s.cad, 0), power: roundArr(s.power, 0), paceSPerKm: roundArr(s.paceSPerKm, 0), speedKmh: roundArr(s.speedKmh, 2) };
  o.splits = (m.splits || []).map(function (x) { return { index: x.index, distanceM: rnd(x.distanceM, 1), timeS: rnd(x.timeS, 1), paceSPerKm: rnd(x.paceSPerKm, 1), paceSPer100m: rnd(x.paceSPer100m, 1), avgHr: rnd(x.avgHr, 0), elevDeltaM: rnd(x.elevDeltaM, 1), partial: !!x.partial }; });
  return o;
}
/* the stored details for a session (from the tracks map), the generated sample, or null when the route is not stored.
   age only feeds the sample's effort text (the reference reads prefs.age). */
export function getTrack(s, tracks, age) {
  if (!s || !s.trackId) return null;
  if (s.trackId === SAMPLE_TRACK_ID) return s.sample ? sampleTrack(s.date, age) : null;
  return (tracks && tracks[s.trackId]) || null;
}
