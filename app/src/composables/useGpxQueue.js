/*
 * The GPX import queue and review card state for the week page. Ported from the "import queue and
 * review card" section of web/js/app.js (GQ, setGpxStatus, addGpxError, gpxMessage, resetGpxImport,
 * enqueueFiles, nextGpxFile, importGpxText, itemAnalysis, gpxDateRange, findDuplicate, dateProblem,
 * savedMessage, onGpxSave, onGpxCancel, finishGpxBatch) and the window drop guard of wireWeek.
 * storeTrack is data.saveTrack (TRACK_CAP, rollback on a failed save).
 *
 * One queue per page: the first useGpxQueue() in a component tree (the week page) creates it and
 * provides it; descendants that call useGpxQueue() get the same one. The creating component also
 * gets the window dragover/drop guard (a file dropped outside a drop zone must not replace the
 * page), removed on unmount.
 *
 *   enqueue(files, trigger)  add picked or dropped files; trigger is the id of the control that started the batch
 *   pick(trigger)            open the shared file input (registerInput(el) gives it to the queue)
 *   item                     the file under review: { name, text, detected, baseType, type, cache, seq,
 *                            minutesTouched, effortTouched, held, dup } (reactive), or null. After Save
 *                            or Skip with more files pending the item stays (held: true, inert) until
 *                            the next file's review replaces it or the batch ends, so the card does
 *                            not vanish and focus does not drop between files.
 *   analysis, judge, duplicate   the review's analysis for item.type, its effort and a matching earlier import
 *   status, errors, total, index, pendingCount, lastSavedId
 *   focus                    { what: 'review' | 'last' | <control id>, seq }: the review component moves focus
 *   setType(t)               change the activity; false when the points do not fit that type
 *   save(fields)             fields { date, minutes (raw text), intensity }; returns { ok } or
 *                            { ok: false, dateError, minutesError }
 *   cancel()                 skip the file under review
 *   reset()                  drop everything (clear all)
 * Pure helpers dateRange(today) and dateProblem(v, today) are exported for the review form.
 */
import { ref, shallowRef, reactive, markRaw, computed, inject, provide, getCurrentInstance, onMounted, onBeforeUnmount } from 'vue';
import { GPX } from '../core/gpx.js';
import { gpxOpts, judgeEffort, compactMetrics, isNum, GPX_KEEP_DAYS } from '../core/gpxEffort.js';
import { TYPE_LABEL, isLight, credit } from '../core/rules.js';
import { ymd, addDays, weekStart, fmtDay } from '../core/dates.js';
import { useDataStore } from '../stores/data.js';

const KEY = Symbol('gpxQueue');
export const GPX_MAX_BYTES = 25 * 1024 * 1024;
export const GPX_TYPES = ['run', 'walk', 'cycle', 'swim', 'other'];

export function dateRange(today) { return { min: ymd(addDays(today, -GPX_KEEP_DAYS)), max: ymd(today) }; }
export function dateProblem(v, today) {
  const rg = dateRange(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Pick a date.';
  if (v > rg.max) return 'Pick a date up to today.';
  if (v < rg.min) return 'This is from ' + fmtDay(v) + ' ' + v.slice(0, 4) + '. Imports go back 5 years, so pick a newer date or skip this file.';
  return '';
}
function gpxMessage(e) {
  const m = e && e.message;
  return (m === GPX.MSG_NOT_GPX || m === GPX.MSG_NO_POINTS) ? m : 'This file could not be read as a GPX track. Try exporting it again.';
}
function hasFiles(e) { return !!(e && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0); }

function createQueue() {
  const data = useDataStore();

  let pending = [];           /* File objects, kept raw (a proxied File cannot be read) */
  let reading = false;
  let saved = [];
  let trigger = 'gpx-pick-splits';
  let seq = 0;
  let input = null;

  const item = shallowRef(null);
  const status = ref('');
  const errors = ref([]);
  const total = ref(0);
  const index = ref(0);
  const pendingCount = ref(0);
  const lastSavedId = ref(null);
  const focus = ref({ what: '', seq: 0 });

  function setStatus(msg) { status.value = msg || ''; }
  function addError(name, msg) { errors.value = errors.value.concat([{ name: name, msg: msg }]); }
  function requestFocus(what) { focus.value = { what: what, seq: focus.value.seq + 1 }; }
  function syncPending() { pendingCount.value = pending.length; }

  /* analysis for the chosen activity (stop speed, spike cap and split length depend on it); Other reuses the detected type */
  function itemAnalysis(it) {
    const lt = it.type === 'other' ? it.baseType : it.type;
    if (!it.cache[lt]) it.cache[lt] = markRaw(GPX.analyze(it.text, gpxOpts(lt, data.prefs.age)));
    return it.cache[lt];
  }

  const analysis = computed(function () {
    const it = item.value;
    if (!it) return null;
    try { return itemAnalysis(it); } catch (e) { return null; }
  });
  /* follows the age: an open review re-judges the effort when the age changes */
  const judge = computed(function () {
    const it = item.value, r = analysis.value;
    if (!it || !r) return null;
    return judgeEffort(r.metrics, it.type, data.prefs.age);
  });
  const duplicate = computed(function () {
    const r = analysis.value;
    if (!r) return null;
    /* a held item keeps the note it had when it was saved (saving it would otherwise match itself) */
    if (item.value && item.value.held) return item.value.dup;
    const st = r.info.startTime, d = r.metrics.distanceM, tracks = data.tracks;
    if (!isNum(st)) return null;
    const id = Object.keys(tracks).find(function (k) { const x = tracks[k]; return x.startTime === st && Math.abs(x.metrics.distanceM - d) <= Math.max(5, d * 0.01); });
    if (!id) return null;
    return { rec: tracks[id], session: data.sessions.find(function (s) { return s.trackId === id; }) || null };
  });

  function reset() {
    pending = []; reading = false; saved = [];
    item.value = null;
    total.value = 0; index.value = 0; errors.value = [];
    syncPending();
    setStatus('');
    lastSavedId.value = null;
  }

  function enqueue(fileList, trig) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    if (!item.value && !reading && !pending.length) { total.value = 0; index.value = 0; saved = []; errors.value = []; setStatus(''); lastSavedId.value = null; }
    if (trig) trigger = trig;
    total.value += files.length;
    files.forEach(function (f) { pending.push(markRaw(f)); });
    syncPending();
    if (!item.value && !reading) nextFile();
  }

  function nextFile() {
    const f = pending.shift();
    syncPending();
    if (!f) { finishBatch(); return; }
    index.value++;
    if (f.size > GPX_MAX_BYTES) { addError(f.name, 'This file is larger than 25 MB. Export a shorter activity.'); nextFile(); return; }
    reading = true;
    /* a short reading note, unless the line still holds the message about the file saved just before */
    const note = 'Reading ' + f.name + '.';
    if (!status.value) setStatus(note);
    const done = function () { reading = false; if (status.value === note) setStatus(''); };
    const rd = new FileReader();
    rd.onload = function () { done(); importText(String(rd.result || ''), f.name); };
    rd.onerror = function () { done(); addError(f.name, 'This file could not be read. Try picking it again.'); nextFile(); };
    rd.readAsText(f);
  }

  function importText(text, name) {
    let r;
    try { r = GPX.analyze(text, gpxOpts(undefined, data.prefs.age)); } catch (e) { addError(name, gpxMessage(e)); nextFile(); return; }
    const type = GPX_TYPES.indexOf(r.type) >= 0 ? r.type : 'run';
    const it = reactive({ seq: ++seq, name: name, text: text, detected: r.info.typeHint, baseType: r.type, type: type, cache: markRaw({}), minutesTouched: false, effortTouched: false, held: false, dup: null });
    it.cache[r.type] = markRaw(r);
    item.value = it;
    requestFocus('review');
  }

  /* the analysis for the new type is made before the type changes, so a type that does not fit leaves the review as it was */
  function setType(t) {
    const it = item.value;
    if (!it || GPX_TYPES.indexOf(t) < 0) return false;
    const lt = t === 'other' ? it.baseType : t;
    if (!it.cache[lt]) {
      try { it.cache[lt] = markRaw(GPX.analyze(it.text, gpxOpts(lt, data.prefs.age))); } catch (e) { return false; }
    }
    it.type = t;
    return true;
  }

  function savedMessage(s, stored) {
    const past = s.date < ymd(weekStart(data.today));
    const what = TYPE_LABEL[s.type] + ', ' + s.minutes + ' min, ' + s.intensity;
    let msg = past ? 'Saved to ' + fmtDay(s.date) + ': ' + what + '.' : 'Saved to your log: ' + what + '.';
    if (isLight(s)) msg += ' Light activity is logged but not counted toward your minutes.';
    else msg += past ? ' It counts toward that week.' : ' Counts as ' + credit(s, data.guide) + ' toward this week.';
    if (!stored) msg += ' The route could not be kept with this import, so only the session was saved.';
    return msg;
  }

  function save(fields) {
    const it = item.value;
    if (!it || it.held) return { ok: false, dateError: '', minutesError: '' };
    let r;
    try { r = itemAnalysis(it); } catch (e) { return { ok: false, dateError: '', minutesError: '' }; }
    const raw = String(fields.minutes === undefined || fields.minutes === null ? '' : fields.minutes).trim(), n = Number(raw);
    const dErr = dateProblem(fields.date, data.today), mBad = !/^\d+$/.test(raw) || n < 1 || n > 240;
    if (dErr || mBad) return { ok: false, dateError: dErr, minutesError: mBad ? 'Enter minutes from 1 to 240.' : '' };
    const intensity = fields.intensity === 'vigorous' || fields.intensity === 'light' ? fields.intensity : 'moderate';
    const id = 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const rec = { name: (r.info.name || '').slice(0, 80), type: it.type, startTime: isNum(r.info.startTime) ? r.info.startTime : null, metrics: compactMetrics(r.metrics), track: r.track, classification: judge.value, deviceNote: r.deviceNote || null, importedAt: Date.now() };
    const dup = duplicate.value;
    const s = data.addSession({ date: fields.date, type: it.type, minutes: n, intensity: intensity, source: 'gpx', trackId: id });
    const stored = data.saveTrack(id, rec);
    if (!stored) { delete s.trackId; data.persist(); }
    saved.push(s.id);
    setStatus(savedMessage(s, stored));
    holdOrEnd(it, dup);
    return { ok: true };
  }

  function cancel() {
    const it = item.value;
    if (!it || it.held) return;
    setStatus('Skipped ' + it.name + '.');
    holdOrEnd(it, duplicate.value);
  }

  /* more files pending: the card stays on screen, inert, until the next review replaces it; otherwise the batch ends */
  function holdOrEnd(it, dup) {
    if (pending.length) {
      it.dup = dup ? markRaw(dup) : null;
      it.held = true;
      nextFile();
    } else finishBatch();
  }

  /* end of a batch: offer a link to the last saved activity's page, or send focus back to the control that started it */
  function finishBatch() {
    item.value = null;
    if (total.value > 1) setStatus((saved.length ? 'Imported ' + saved.length + ' of ' + total.value + ' files.' : 'No files imported.') + (errors.value.length ? ' The problems are listed above.' : ''));
    const last = saved.length ? saved[saved.length - 1] : null;
    saved = [];
    if (last && data.sessions.some(function (s) { return s.id === last; })) {
      lastSavedId.value = last;
      requestFocus('last');
      return;
    }
    requestFocus(trigger);
  }

  function registerInput(el) { input = el; }
  function pick(trig) {
    trigger = trig;
    if (input) input.click();
  }
  function onInputChange(ev) {
    const files = ev.target.files;
    enqueue(files, trigger);
    try { ev.target.value = ''; } catch (e) { /* some browsers refuse; the next pick still fires change */ }
  }

  return reactive({
    item, analysis, judge, duplicate, status, errors, total, index, pendingCount, lastSavedId, focus,
    enqueue, pick, registerInput, onInputChange, setType, save, cancel, reset
  });
}

/* the window guard: a file dropped anywhere but a drop zone must not replace the page */
function guardWindow() {
  const stop = function (e) { if (hasFiles(e)) e.preventDefault(); };
  onMounted(function () { window.addEventListener('dragover', stop); window.addEventListener('drop', stop); });
  onBeforeUnmount(function () { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop); });
}

export function useGpxQueue() {
  const inComponent = !!getCurrentInstance();
  if (inComponent) {
    const existing = inject(KEY, null);
    if (existing) return existing;
  }
  const q = createQueue();
  if (inComponent) { provide(KEY, q); guardWindow(); }
  return q;
}

/* a drop zone (wireDropTarget): isOver drives the is-over class; files dropped here start a batch credited to trigger */
export function useDropTarget(queue, trigger) {
  const isOver = ref(false);
  function onDragover(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* read-only in some engines */ }
    isOver.value = true;
  }
  function onDragleave(e) {
    const zone = e.currentTarget;
    if (!zone || !zone.contains(e.relatedTarget)) isOver.value = false;
  }
  function onDrop(e) {
    isOver.value = false;
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    queue.enqueue(e.dataTransfer.files, trigger);
  }
  return { isOver, onDragover, onDragleave, onDrop };
}
