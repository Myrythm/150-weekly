<script setup>
/* The GPX import controls in the splits section (web/index.html #gpx-bar, #gpx-errors, #gpx-status,
   #gpx-last, #gpx-review; showReview, renderReviewCount, setRadio, showFieldError, onGpxSave,
   onGpxCancel and the review wiring of wireWeek in web/js/app.js). The queue is the page's
   useGpxQueue(); this component keeps the form fields and moves focus when the queue asks. */
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useDataStore } from '../stores/data.js';
import { useUiStore } from '../stores/ui.js';
import { useGpxQueue, useDropTarget, dateRange, dateProblem } from '../composables/useGpxQueue.js';
import { GPX } from '../core/gpx.js';
import { isNum } from '../core/gpxEffort.js';
import { fmtStartTime, paceLine } from '../core/format.js';
import { TYPE_LABEL } from '../core/rules.js';
import { ymd, fmtDay, plural } from '../core/dates.js';
import { reduced } from '../core/motion.js';

const data = useDataStore();
const ui = useUiStore();
const q = useGpxQueue();
const bar = useDropTarget(q, 'gpx-pick-splits');

const fileEl = ref(null);
const formEl = ref(null);
const titleEl = ref(null);
const dateEl = ref(null);
const minutesEl = ref(null);
const pickSplitsEl = ref(null);

const date = ref('');
const minutes = ref('');
const intensity = ref('moderate');
const dateError = ref('');
const minutesError = ref('');
const basisOverride = ref('');

onMounted(function () { q.registerInput(fileEl.value); });

const r = computed(function () { return q.analysis; });
const m = computed(function () { return r.value ? r.value.metrics : null; });
const shown = computed(function () { return !!(q.item && r.value); });
const range = computed(function () { return dateRange(data.today); });

const count = computed(function () { return q.total > 1 ? 'Import review, file ' + q.index + ' of ' + q.total : 'Import review'; });
const rows = computed(function () {
  if (!shown.value) return [];
  const info = r.value.info, mm = m.value;
  const out = [['Name', info.name || 'No name in the file'], ['Start', isNum(info.startTime) ? fmtStartTime(info.startTime) : 'No time in the file'], ['Distance', GPX.fmtDistance(mm.distanceM)]];
  if (isNum(mm.movingS)) out.push(['Moving time', GPX.fmtDuration(mm.movingS)]);
  const pl = paceLine(mm, q.item.type);
  if (pl) out.push(pl);
  if (isNum(mm.avgHr)) out.push(['Avg heart rate', Math.round(mm.avgHr) + ' bpm']);
  return out;
});
const deviceNote = computed(function () { return (r.value && r.value.deviceNote) || ''; });
const spikes = computed(function () { const cs = (r.value && r.value.cleanStats) || {}; return cs.spikes || 0; });
const cleanNote = computed(function () { return spikes.value ? 'Left out ' + spikes.value + ' GPS ' + plural(spikes.value, 'point that jumped', 'points that jumped') + ' too far to be real.' : ''; });
const minutesNote = computed(function () {
  const mm = m.value;
  if (!mm) return '';
  return !isNum(mm.movingS) ? 'No times in this file. Enter how long it took.' : mm.movingS / 60 > 240 ? 'Moving time ' + GPX.fmtDuration(mm.movingS) + '. One session holds up to 240 minutes.' : 'Moving time ' + GPX.fmtDuration(mm.movingS) + ', rounded to whole minutes.';
});
const basis = computed(function () { return basisOverride.value || (q.judge ? q.judge.text : ''); });
const setAgeShown = computed(function () { return !!(m.value && data.prefs.age === null && isNum(m.value.avgHr)); });
const dupText = computed(function () {
  const d = q.duplicate;
  if (!d) return '';
  return 'You already imported this activity' + (d.session ? ' (' + TYPE_LABEL[d.session.type] + ' on ' + fmtDay(d.session.date) + ', ' + GPX.fmtDistance(d.rec.metrics.distanceM) + ')' : '') + '. Skip it, or save it again as a second session.';
});
const cancelText = computed(function () { return q.duplicate || q.pendingCount ? 'Skip this file' : 'Cancel'; });
const saveText = computed(function () { return q.duplicate ? 'Save again' : 'Save to log'; });

/* a new file under review: the date comes from the file (or today), the field errors start fresh */
watch(function () { return q.item; }, function (it) {
  if (!it) return;
  const info = r.value ? r.value.info : null;
  date.value = info && isNum(info.startTime) ? ymd(new Date(info.startTime)) : range.value.max;
  dateError.value = dateProblem(date.value, data.today);
  minutesError.value = '';
  basisOverride.value = '';
}, { flush: 'sync' });
/* minutes follow the moving time and effort follows the judgement until the visitor changes them */
watch(m, function (mm) {
  if (!q.item || !mm || q.item.minutesTouched) return;
  minutes.value = isNum(mm.movingS) ? String(Math.min(240, Math.max(1, Math.round(mm.movingS / 60)))) : '';
}, { immediate: true });
watch(function () { return q.judge; }, function (j) {
  basisOverride.value = '';
  if (!j || !q.item || q.item.effortTouched) return;
  intensity.value = j.intensity;
}, { immediate: true });

/* focus requests from the queue: the review title on a new file, the last import's link, or the control that started the batch */
watch(function () { return q.focus; }, async function (f) {
  await nextTick();
  if (f.what === 'review') {
    try { formEl.value.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); } catch (e) { /* ignore */ }
    if (titleEl.value) titleEl.value.focus({ preventScroll: true });
    return;
  }
  if (f.what === 'last') {
    const a = document.getElementById('gpx-last-link');
    if (a) a.focus();
    return;
  }
  const t = f.what ? document.getElementById(f.what) : null;
  const el = t && !t.closest('[hidden]') ? t : pickSplitsEl.value;
  if (el) el.focus();
});

function onTypeChange(ev) {
  const it = q.item;
  if (!it) return;
  const prev = it.type;
  if (!q.setType(ev.target.value)) {
    ev.target.value = prev;
    basisOverride.value = 'That activity does not fit the points in this file, so it stays ' + TYPE_LABEL[prev] + '.';
  }
}
function onMinutesInput() {
  if (q.item) q.item.minutesTouched = true;
  if (minutesError.value) minutesError.value = '';
}
function onDateChange() { dateError.value = dateProblem(date.value, data.today); }
function onEffortChange() { if (q.item) q.item.effortTouched = true; }
function onSetAge() {
  if (ui.ageStepOpen) ui.requestFocus('age');
  else ui.openAge();
}

function onSave() {
  /* the raw text of the field, as the reference reads it */
  const raw = minutesEl.value ? minutesEl.value.value : String(minutes.value);
  const res = q.save({ date: date.value, minutes: raw, intensity: intensity.value });
  if (res.ok) return;
  dateError.value = res.dateError || '';
  minutesError.value = res.minutesError || '';
  if (res.dateError) { if (dateEl.value) dateEl.value.focus(); return; }
  if (res.minutesError && minutesEl.value) minutesEl.value.focus();
}
</script>

<template>
  <div class="gpx-bar drop-target" id="gpx-bar" :class="{ 'is-over': bar.isOver.value }" @dragover="bar.onDragover" @dragleave="bar.onDragleave" @drop="bar.onDrop">
    <button class="btn btn-outline btn-small" id="gpx-pick-splits" type="button" aria-describedby="gpx-bar-help" ref="pickSplitsEl" @click="q.pick('gpx-pick-splits')">Import a GPX file</button>
    <p class="small muted" id="gpx-bar-help">Or drop .gpx files here. You can pick several. Only you can see your imports.</p>
    <input class="sr-only" type="file" id="gpx-file" name="gpx" accept=".gpx,application/gpx+xml" multiple tabindex="-1" aria-hidden="true" ref="fileEl" @change="q.onInputChange">
  </div>
  <ul class="gpx-errors" id="gpx-errors" role="alert" :hidden="q.errors.length === 0">
    <li v-for="(e, i) in q.errors" :key="i"><span>{{ e.name + ': ' }}</span>{{ e.msg }}</li>
  </ul>
  <p class="status gpx-status" id="gpx-status" role="status" aria-live="polite">{{ q.status }}</p>
  <p class="gpx-last" id="gpx-last" :hidden="!q.lastSavedId">
    <RouterLink v-if="q.lastSavedId" class="btn-text" id="gpx-last-link" :to="{ name: 'activity', params: { id: q.lastSavedId }, query: { from: 'week' } }">See the details of this import</RouterLink>
    <a v-else class="btn-text" id="gpx-last-link" href="/activity">See the details of this import</a>
  </p>
  <form class="gpx-review" id="gpx-review" aria-labelledby="gpx-r-title" novalidate :hidden="!shown" ref="formEl" @submit.prevent="onSave">
    <div>
      <p class="label gpx-r-count" id="gpx-r-count">{{ count }}</p>
      <h3 class="h3" id="gpx-r-title" tabindex="-1" ref="titleEl">Check this import</h3>
      <p class="small muted gpx-r-file" id="gpx-r-file">{{ q.item ? 'File: ' + q.item.name : '' }}</p>
    </div>
    <dl class="readout" id="gpx-r-read">
      <div v-for="rw in rows" :key="rw[0]"><dt>{{ rw[0] }}</dt><dd>{{ rw[1] }}</dd></div>
    </dl>
    <p class="small gpx-note" id="gpx-r-device" :hidden="!deviceNote">{{ deviceNote }}</p>
    <p class="small muted" id="gpx-r-clean" :hidden="!spikes">{{ cleanNote }}</p>
    <div class="gpx-fields">
      <div class="field">
        <label class="label" for="gpx-type">Activity</label>
        <select class="select" id="gpx-type" name="gpx-type" :value="q.item ? q.item.type : 'run'" @change="onTypeChange">
          <option value="run">Run</option>
          <option value="walk">Walk</option>
          <option value="cycle">Cycle</option>
          <option value="swim">Swim</option>
          <option value="other">Other</option>
        </select>
        <p class="small muted" id="gpx-type-note" :hidden="!q.item || !!q.item.detected">The file does not say what this was, so Run is a guess. Check it.</p>
      </div>
      <div class="field">
        <label class="label" for="gpx-date">Date</label>
        <input class="input" type="date" id="gpx-date" name="gpx-date" aria-describedby="gpx-date-err" ref="dateEl" v-model="date" :min="range.min" :max="range.max" :aria-invalid="dateError ? 'true' : null" @change="onDateChange">
        <p class="error" id="gpx-date-err" :hidden="!dateError">{{ dateError }}</p>
      </div>
      <div class="field">
        <label class="label" for="gpx-minutes">Minutes</label>
        <input class="input" type="number" id="gpx-minutes" name="gpx-minutes" inputmode="numeric" min="1" max="240" step="1" autocomplete="off" aria-describedby="gpx-minutes-note gpx-minutes-err" ref="minutesEl" v-model="minutes" :aria-invalid="minutesError ? 'true' : null" @input="onMinutesInput">
        <p class="small muted" id="gpx-minutes-note">{{ minutesNote }}</p>
        <p class="error" id="gpx-minutes-err" :hidden="!minutesError">Enter minutes from 1 to 240.</p>
      </div>
    </div>
    <fieldset class="field" id="gpx-effort">
      <legend class="label">How hard?</legend>
      <div class="seg-group">
        <input class="seg-input" type="radio" name="gpx-intensity" id="gpx-int-light" value="light" v-model="intensity" @change="onEffortChange">
        <label class="seg-label first light" for="gpx-int-light">Light</label>
        <input class="seg-input" type="radio" name="gpx-intensity" id="gpx-int-mod" value="moderate" v-model="intensity" @change="onEffortChange">
        <label class="seg-label mid mod" for="gpx-int-mod">Moderate</label>
        <input class="seg-input" type="radio" name="gpx-intensity" id="gpx-int-vig" value="vigorous" v-model="intensity" @change="onEffortChange">
        <label class="seg-label last vig" for="gpx-int-vig">Vigorous</label>
      </div>
      <p class="small gpx-basis" id="gpx-basis">{{ basis }}</p>
      <p><button class="btn-text" id="gpx-set-age" type="button" :hidden="!setAgeShown" @click="onSetAge">Set my age</button></p>
    </fieldset>
    <p class="gpx-dup" id="gpx-dup" :hidden="!dupText">{{ dupText }}</p>
    <div class="gpx-actions">
      <button class="btn btn-accent" id="gpx-save" type="submit">{{ saveText }}</button>
      <button class="btn btn-outline" id="gpx-cancel" type="button" @click="q.cancel()">{{ cancelText }}</button>
    </div>
    <p class="small muted" id="gpx-r-privacy">Saved to your account, where only you can see it. The page keeps the route and the numbers, not the file.</p>
  </form>
</template>
