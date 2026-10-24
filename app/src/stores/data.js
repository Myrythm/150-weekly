/*
 * The data store: every w150.* value the app shows, read from and written to the sync store
 * (app/src/sync/store.js). Ported from web/js/app.js: loadState, persist, addSession,
 * removeSession, undoRemove (restoreSession), clearSample, the storage half of clearAllData,
 * saveTracks, storeTrack (saveTrack), migrateSampleBalance and migrateSampleGpx.
 *
 *   attach(syncStore)   the store to read and write: { get(key, fallback), set(key, value), remove(key) }
 *   load()              read every key (also after a remote change); seeds the sample on a new account
 *   tick()              move `today` to the current local midnight (day rollover)
 *
 * `today` is a Date at local midnight; every getter and action computes with it, never with a
 * fresh new Date(), so tests can pin the date. UI work (toasts, focus, timers, forms) stays out.
 * Only the theme lives outside this store (browser localStorage).
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ymd, weekStart, today as todayDate } from '../core/dates.js';
import { ageGroup, activeGuide } from '../core/guide.js';
import { calc } from '../core/rules.js';
import { makeId, sanitizeSessions, sanitizeAge, sanitizePlan, sanitizeTracks, pruneTracks, TRACK_CAP } from '../core/sanitize.js';
import { seedSessions, samplePlan, SAMPLE_TRACK_ID } from '../core/sample.js';

export const KEYS = { meta: 'w150.meta', sessions: 'w150.sessions', plan: 'w150.plan', prefs: 'w150.prefs', breaks: 'w150.breaks', tracks: 'w150.tracks' };

function defaultMeta() { return { v: 1, seeded: true, sampleActive: false }; }
function defaultPrefs() { return { sound: false, age: null, nudge: false }; }

export const useDataStore = defineStore('data', () => {
  /* the sync store; kept out of the reactive state */
  let sync = null;

  const ready = ref(false);
  const meta = ref(defaultMeta());
  const sessions = ref([]);
  const plan = ref(null);
  const prefs = ref(defaultPrefs());   /* age: whole years 0 to 120, or null until asked; nudge: kept for older saves */
  const tracks = ref({});              /* imported GPX details by trackId (w150.tracks) */
  const today = ref(todayDate());

  const group = computed(() => ageGroup(prefs.value.age));
  const guide = computed(() => activeGuide(prefs.value.age));
  const summary = computed(() => calc(sessions.value, prefs.value.age, today.value));

  function load_(key, fallback) { try { const v = sync.get(key, null); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; } }
  function save(key, value) { try { return sync.set(key, value) === true; } catch (e) { return false; } }
  function removeKey(key) { try { return sync.remove(key) === true; } catch (e) { return false; } }

  function attach(syncStore) { sync = syncStore; }

  function persist() {
    if (!sync) return false;
    const a = save(KEYS.meta, meta.value), b = save(KEYS.sessions, sessions.value), c = save(KEYS.plan, plan.value), d = save(KEYS.prefs, prefs.value);
    return a && b && c && d;
  }

  /* A sample stored before the balance field existed: flag its first current-week walk so the 65+ sample reads 1 of 3. */
  function migrateSampleBalance(raw) {
    if (!meta.value.sampleActive || !Array.isArray(raw)) return;
    if (raw.some(function (s) { return s && typeof s === 'object' && 'balance' in s; })) return;
    const ws = ymd(weekStart(today.value));
    const hit = sessions.value.find(function (s) { return s.sample && s.type === 'walk' && s.intensity === 'moderate' && s.date >= ws; });
    if (hit) { hit.balance = true; persist(); }
  }

  /* a sample stored before GPX import existed: its 18 minute vigorous run becomes the sample import */
  function migrateSampleGpx() {
    if (!meta.value.sampleActive || sessions.value.some(function (s) { return s.sample && s.trackId; })) return;
    const ws = ymd(weekStart(today.value));
    const hit = sessions.value.find(function (s) { return s.sample && s.type === 'run' && s.minutes === 18 && s.intensity === 'vigorous' && s.date >= ws; });
    if (hit) { hit.source = 'gpx'; hit.trackId = SAMPLE_TRACK_ID; persist(); }
  }

  function saveTracks() {
    tracks.value = pruneTracks(tracks.value, sessions.value);
    if (!sync) return true;
    /* an empty map is saved as {}, never deleted, so a delete cannot wipe a track added on another device */
    return save(KEYS.tracks, tracks.value);
  }

  function load() {
    const m = load_(KEYS.meta, null);
    const stored = load_(KEYS.sessions, null);
    const p = Object.assign(defaultPrefs(), load_(KEYS.prefs, null) || {});
    p.sound = !!p.sound;
    p.nudge = p.nudge === true;
    p.age = sanitizeAge(p.age);
    prefs.value = p;
    if (m && typeof m === 'object') {
      meta.value = { v: 1, seeded: true, sampleActive: !!m.sampleActive };
      sessions.value = sanitizeSessions(stored);
      plan.value = sanitizePlan(load_(KEYS.plan, null));
    } else if (Array.isArray(stored) && stored.length) {
      sessions.value = sanitizeSessions(stored);
      plan.value = sanitizePlan(load_(KEYS.plan, null));
      meta.value = { v: 1, seeded: true, sampleActive: sessions.value.some(function (s) { return s.sample; }) };
      persist();
    } else {
      meta.value = { v: 1, seeded: true, sampleActive: true };
      sessions.value = seedSessions(today.value);
      plan.value = samplePlan(today.value);
      persist();
    }
    migrateSampleBalance(stored);
    tracks.value = sanitizeTracks(load_(KEYS.tracks, null));
    const n = Object.keys(tracks.value).length;
    migrateSampleGpx();
    tracks.value = pruneTracks(tracks.value, sessions.value);
    if (sync && Object.keys(tracks.value).length !== n) saveTracks();
    ready.value = true;
  }

  function clearSample() {
    sessions.value = sessions.value.filter(function (s) { return !s.sample; });
    if (plan.value && plan.value.sample) plan.value = null;
    meta.value.sampleActive = false;
    persist();
  }

  /* the first real entry clears the sample; returns the new session */
  function addSession(f) {
    if (meta.value.sampleActive) clearSample();
    const s = { id: makeId(), date: f.date || ymd(today.value), type: f.type, minutes: f.minutes, intensity: f.intensity, balance: f.balance === true, source: f.source, sample: false, createdAt: Date.now() };
    if (f.note !== undefined) s.note = f.note;
    if (f.trackId) s.trackId = f.trackId;
    sessions.value.push(s);
    persist();
    return sessions.value[sessions.value.length - 1];
  }

  /* an imported session takes its stored route with it; returns { session, track } for
     restoreSession (track is { id, rec } or null), or null when there is no such session */
  function removeSession(id) {
    const i = sessions.value.findIndex(function (s) { return s.id === id; });
    if (i < 0) return null;
    const s = sessions.value.splice(i, 1)[0];
    const track = (s.trackId && tracks.value[s.trackId]) ? { id: s.trackId, rec: tracks.value[s.trackId] } : null;
    if (track) { delete tracks.value[s.trackId]; saveTracks(); }
    persist();
    return { session: s, track: track };
  }

  /* Undo for removeSession: puts the session and its route back */
  function restoreSession(result) {
    if (!result || !result.session) return;
    const tr = result.track;
    sessions.value.push(result.session);
    persist();
    if (tr) { tracks.value[tr.id] = tr.rec; saveTracks(); }
  }

  /* the storage half of clear all: keeps the age, removes every server key (w150.breaks too),
     then saves fresh meta and prefs; the caller flushes the sync store */
  function clearAll() {
    const keepAge = prefs.value.age;
    sessions.value = [];
    plan.value = null;
    prefs.value = { sound: false, age: keepAge, nudge: false };
    tracks.value = {};
    meta.value = defaultMeta();
    [KEYS.meta, KEYS.sessions, KEYS.plan, KEYS.prefs, KEYS.breaks, KEYS.tracks].forEach(removeKey);
    save(KEYS.meta, meta.value);
    save(KEYS.prefs, prefs.value);
  }

  function setAge(age) {
    prefs.value.age = sanitizeAge(age);
    persist();
  }

  function setSound(on) {
    prefs.value.sound = !!on;
    persist();
  }

  /* fields: { after, will, where, minutes }, already validated by the form */
  function savePlan(p) {
    if (meta.value.sampleActive) clearSample();
    plan.value = { after: p.after, will: p.will, where: p.where, minutes: p.minutes, sample: false, savedAt: Date.now() };
    persist();
  }

  function deletePlan() {
    plan.value = null;
    persist();
  }

  /* keeps the newest TRACK_CAP imports; on a storage error nothing changes and the caller saves
     the session alone */
  function saveTrack(id, rec) {
    const before = Object.assign({}, tracks.value);
    const next = Object.assign({}, tracks.value);
    next[id] = rec;
    const ids = Object.keys(next).sort(function (a, b) { return next[a].importedAt - next[b].importedAt; });
    while (ids.length > TRACK_CAP) delete next[ids.shift()];
    tracks.value = next;
    if (saveTracks()) return true;
    tracks.value = before;
    return false;
  }

  function tick() {
    const t = todayDate();
    if (t.getTime() === today.value.getTime()) return false;
    today.value = t;
    return true;
  }

  return {
    ready, meta, sessions, plan, prefs, tracks, today,
    group, guide, summary,
    attach, load, persist, addSession, removeSession, restoreSession, clearSample, clearAll,
    setAge, setSound, savePlan, deletePlan, saveTrack, tick
  };
});
