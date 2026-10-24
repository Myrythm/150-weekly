/* Sanitizers for every stored value. Moved from web/js/app.js. pruneTracks takes its inputs and returns the new map. */
import { VALID_TYPES } from './rules.js';
import { SAMPLE_TRACK_ID } from './sample.js';
import { isNum } from './gpxEffort.js';

export const TRACK_CAP = 30;                          /* route details kept for the 30 most recent imports */
const GPX_TYPES = ['run', 'walk', 'cycle', 'swim', 'other'];

export function makeId() { return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export function sanitizeSessions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach(function (s) {
    if (!s || typeof s !== 'object') return;
    if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) return;
    if (VALID_TYPES.indexOf(s.type) < 0) return;
    const m = Number(s.minutes);
    if (!Number.isInteger(m) || m < 1 || m > 240) return;
    const o = { id: typeof s.id === 'string' ? s.id : makeId(), date: s.date, type: s.type, minutes: m, intensity: (s.intensity === 'vigorous' || s.intensity === 'light') ? s.intensity : 'moderate', balance: s.balance === true, source: (s.source === 'plan' || s.source === 'snack' || s.source === 'gpx') ? s.source : 'log', sample: !!s.sample, createdAt: Number(s.createdAt) || Date.now() };
    if (typeof s.note === 'string') o.note = s.note;
    if (typeof s.trackId === 'string' && /^t_[a-z0-9]{1,40}$/.test(s.trackId)) o.trackId = s.trackId;
    out.push(o);
  });
  return out;
}
export function sanitizeAge(a) {
  return (typeof a === 'number' && Number.isInteger(a) && a >= 0 && a <= 120) ? a : null;
}
export function sanitizePlan(p) {
  if (!p || typeof p !== 'object') return null;
  const a = String(p.after || '').trim().slice(0, 60), w = String(p.will || '').trim().slice(0, 60), l = String(p.where || '').trim().slice(0, 60);
  if (!a || !w || !l) return null;
  let m = Number(p.minutes); if (!Number.isInteger(m) || m < 1 || m > 30) m = 2;
  return { after: a, will: w, where: l, minutes: m, sample: !!p.sample, savedAt: Number(p.savedAt) || Date.now() };
}
export function sanitizeTracks(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).forEach(function (id) {
    const r = raw[id];
    if (!/^t_[a-z0-9]{1,40}$/.test(id) || id === SAMPLE_TRACK_ID || !r || typeof r !== 'object') return;
    const t = r.track, m = r.metrics;
    if (!t || !Array.isArray(t.lat) || !Array.isArray(t.lon) || !t.lat.length || t.lat.length !== t.lon.length) return;
    if (!m || typeof m !== 'object' || !isNum(m.distanceM)) return;
    if (!Array.isArray(t.brk)) t.brk = [];
    const c = r.classification;
    out[id] = {
      name: typeof r.name === 'string' ? r.name.slice(0, 80) : '',
      type: GPX_TYPES.indexOf(r.type) >= 0 ? r.type : 'other',
      startTime: isNum(r.startTime) ? r.startTime : null,
      metrics: m, track: t,
      classification: (c && typeof c.text === 'string') ? { intensity: c.intensity, basis: c.basis, text: c.text } : null,
      deviceNote: typeof r.deviceNote === 'string' ? r.deviceNote : null,
      importedAt: Number(r.importedAt) || 0
    };
  });
  return out;
}
/* drop route details no session points to (removed sessions); returns a new map */
export function pruneTracks(tracks, sessions) {
  const ref = {};
  sessions.forEach(function (s) { if (s.trackId) ref[s.trackId] = true; });
  const out = {};
  Object.keys(tracks).forEach(function (id) { if (ref[id]) out[id] = tracks[id]; });
  return out;
}
