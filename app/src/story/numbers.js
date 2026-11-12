/*
 * The numbers on a run story: which ones exist for an activity, which are shown, and the saved
 * story settings (w150.prefs.story). Formatting matches ActivityStats.vue.
 */
import { GPX } from '../core/gpx.js';
import { isNum } from '../core/gpxEffort.js';
import { fmtMinSec } from '../core/format.js';

export const NUMBER_KEYS = ['dist', 'time', 'pace', 'hr', 'best', 'maxhr', 'climb', 'cad'];
export const HERO_KEYS = ['dist', 'time', 'pace'];
export const RECOMMENDED_SMALL = ['time', 'pace', 'hr'];
export const MAX_SMALL = 4;
export const TEMPLATE_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
/* small: null means the recommended set */
export const DEFAULT_STORY_PREFS = { template: 'A', color: '#1E4FA0', opacity: 100, hero: 'dist', small: null };

function num(label, unit, value) { return { value: value, unit: unit, label: label }; }

export function numberValues(m) {
  m = m || {};
  const out = {};
  if (isNum(m.distanceM)) out.dist = m.distanceM < 1000 ? num('M', 'M', String(Math.round(m.distanceM))) : num('KM', 'KM', (m.distanceM / 1000).toFixed(2));
  if (isNum(m.movingS)) out.time = num('TIME', 'TIME', GPX.fmtDuration(m.movingS));
  if (fmtMinSec(m.avgPaceSPerKm)) out.pace = num('PACE /KM', '/KM', fmtMinSec(m.avgPaceSPerKm));
  if (isNum(m.avgHr)) out.hr = num('AVG BPM', 'BPM', String(Math.round(m.avgHr)));
  if (fmtMinSec(m.bestKmPaceS)) out.best = num('BEST KM', '/KM', fmtMinSec(m.bestKmPaceS));
  if (isNum(m.maxHr)) out.maxhr = num('MAX BPM', 'BPM', String(Math.round(m.maxHr)));
  if (isNum(m.elevGainM)) out.climb = num('CLIMB M', 'M', '+' + Math.round(m.elevGainM));
  if (isNum(m.avgCad)) out.cad = num('SPM', 'SPM', String(Math.round(m.avgCad)));
  const full = {};
  NUMBER_KEYS.forEach(function (k) { full[k] = out[k] || null; });
  return full;
}

export function resolveNumbers(prefs, values) {
  const avail = function (k) { return !!(values && values[k]); };
  const hero = avail(prefs.hero) ? prefs.hero : 'dist';
  let keep;
  if (Array.isArray(prefs.small)) {
    keep = prefs.small.filter(function (k) { return avail(k) && k !== hero; });
  } else {
    keep = RECOMMENDED_SMALL.filter(function (k) { return avail(k) && k !== hero; });
    NUMBER_KEYS.forEach(function (k) {
      if (keep.length < 3 && avail(k) && k !== hero && keep.indexOf(k) < 0) keep.push(k);
    });
  }
  const small = NUMBER_KEYS.filter(function (k) { return keep.indexOf(k) >= 0; }).slice(0, MAX_SMALL);
  return { hero: hero, small: small };
}

export function toggleSmall(prefs, key, values) {
  if (NUMBER_KEYS.indexOf(key) < 0 || !values || !values[key]) return prefs;
  const cur = resolveNumbers(prefs, values);
  if (key === cur.hero) return prefs;
  let next;
  if (cur.small.indexOf(key) >= 0) next = cur.small.filter(function (k) { return k !== key; });
  else if (cur.small.length >= MAX_SMALL) return prefs;
  else next = cur.small.concat(key);
  next = NUMBER_KEYS.filter(function (k) { return next.indexOf(k) >= 0; });
  return Object.assign({}, prefs, { small: next });
}

export function sanitizeStoryPrefs(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const d = DEFAULT_STORY_PREFS;
  const template = TEMPLATE_IDS.indexOf(r.template) >= 0 ? r.template : d.template;
  const color = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color.toUpperCase() : d.color;
  const opacity = isNum(r.opacity) ? Math.round(Math.min(100, Math.max(0, r.opacity)) / 5) * 5 : d.opacity;
  const hero = HERO_KEYS.indexOf(r.hero) >= 0 ? r.hero : d.hero;
  const small = Array.isArray(r.small) ? NUMBER_KEYS.filter(function (k) { return r.small.indexOf(k) >= 0; }).slice(0, MAX_SMALL) : null;
  return { template: template, color: color, opacity: opacity, hero: hero, small: small };
}
