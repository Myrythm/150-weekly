<script setup>
/* The log panel (web/index.html #log; syncActivityOptions, formIntensity, syncLogForm,
   buildDateOptions, showMinutesError, onLogSubmit). Strength is a muscle day (effort hidden), light
   is logged but not counted, 65 and over can log balance work. `status` is the text under the
   button (the parent also writes the Clear sample notice there). The panel hides while the age
   step is open. The GPX drop zone (#gpx-drop) follows the form. */
import { ref, computed, watch, nextTick } from 'vue';
import { useDataStore } from '../stores/data.js';
import { useUiStore } from '../stores/ui.js';
import { WD, MON, addDays, dayIndex, ymd, weekStart } from '../core/dates.js';
import { BALANCE_TYPES, isBalance, countsAsBalance } from '../core/rules.js';
import GpxDrop from './GpxDrop.vue';

/* [value, label, the option it goes before]; only for groups that track balance days (65+) */
const BALANCE_OPTIONS = [['balance', 'Balance or tai chi', 'swim'], ['dance', 'Dance', 'sport']];
const BASE_OPTIONS = [['walk', 'Walk'], ['run', 'Run'], ['cycle', 'Cycle'], ['strength', 'Strength'], ['swim', 'Swim'], ['yoga', 'Yoga or stretching'], ['sport', 'Sport'], ['stairs', 'Stairs'], ['other', 'Other']];

const data = useDataStore();
const ui = useUiStore();
const status = defineModel('status', { type: String, default: '' });

const activity = ref('walk');
const minutes = ref('');
const dateIdx = ref(0);
const intensity = ref('moderate');
const balanceWork = ref(false);
const minutesError = ref(false);
const activityEl = ref(null);
const minutesEl = ref(null);

const guide = computed(function () { return data.guide; });
const tracksBalance = computed(function () { return guide.value.balanceDays > 0; });

const options = computed(function () {
  const out = [];
  BASE_OPTIONS.forEach(function (o) {
    if (tracksBalance.value) BALANCE_OPTIONS.forEach(function (b) { if (b[2] === o[0]) out.push({ value: b[0], label: b[1], id: 'log-opt-' + b[0] }); });
    out.push({ value: o[0], label: o[1], id: null });
  });
  return out;
});

/* Today, Yesterday, then the five days before; the chosen position (not the date) stays across midnight */
const dateOptions = computed(function () {
  const t = data.today, out = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(t, -i);
    out.push({ value: ymd(d), label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : WD[dayIndex(d)] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] });
  }
  return out;
});
const dateModel = computed({
  get: function () { return dateOptions.value[dateIdx.value].value; },
  set: function (v) { const i = dateOptions.value.findIndex(function (o) { return o.value === v; }); if (i >= 0) dateIdx.value = i; }
});

/* a group that stops tracking balance loses its options: a chosen one falls back to walk, the box clears */
watch(tracksBalance, function (on) {
  if (on) return;
  if (BALANCE_OPTIONS.some(function (o) { return o[0] === activity.value; })) activity.value = 'walk';
  balanceWork.value = false;
}, { immediate: true });

const isStrengthType = computed(function () { return activity.value === 'strength'; });
const nativeBalance = computed(function () { return BALANCE_TYPES.indexOf(activity.value) >= 0; });
/* the intensity the form will store: strength is always moderate (the effort group is hidden for it) */
const formIntensity = computed(function () { return isStrengthType.value ? 'moderate' : intensity.value; });
const balanceRowHidden = computed(function () { return !tracksBalance.value || nativeBalance.value; });
const probe = computed(function () { return { type: activity.value, balance: balanceWork.value, intensity: formIntensity.value }; });
/* light never counts; for a light balance-type or flagged session the note says why */
const balNote = computed(function () {
  if (!tracksBalance.value) return '';
  return countsAsBalance(probe.value) ? ' It also counts as a balance day.' : isBalance(probe.value) ? ' Balance days need moderate effort or more.' : '';
});
const intHelp = computed(function () {
  return intensity.value === 'light' ? 'A slow stroll or light housework. You can talk and sing easily.'
    : intensity.value === 'vigorous' ? 'You can only say a few words before you need a breath.'
    : 'You can talk, but not sing.';
});
const intNote = computed(function () {
  const a = guide.value.aerobic;
  const base = isStrengthType.value ? 'Strength counts as a muscle day, not toward your ' + a + ' minutes.'
    : intensity.value === 'light' ? 'Light movement is good for you and breaks up sitting. It does not count toward your ' + a + ' minutes.'
    : guide.value.copy.logNote;
  return base + balNote.value;
});

function pickMinutes(n) {
  minutes.value = String(n);
  minutesError.value = false;
  if (minutesEl.value) minutesEl.value.focus();
}

function onSubmit() {
  /* the raw text of the field, as the reference reads it (a number v-model would turn 1e2 into 100) */
  const raw = (minutesEl.value ? minutesEl.value.value : String(minutes.value)).trim(), n = Number(raw);
  if (!/^\d+$/.test(raw) || n < 1 || n > 240) {
    minutesError.value = true;
    status.value = '';
    if (minutesEl.value) minutesEl.value.focus();
    return;
  }
  minutesError.value = false;
  const type = activity.value;
  const inten = formIntensity.value;
  const date = dateModel.value;
  const ws = ymd(weekStart(data.today));
  const g = guide.value;
  const flag = g.balanceDays > 0 && !nativeBalance.value && !balanceRowHidden.value && balanceWork.value;
  const s = data.addSession({ date: date, type: type, minutes: n, intensity: inten, balance: flag, source: 'log' });
  const past = date < ws;
  /* same rule as calc(): the message says it counted only when countsAsBalance is true; a light qualifying session gets the short reason line */
  const balTail = g.balanceDays <= 0 ? '' : countsAsBalance(s) ? (past ? ' It counted as a balance day that week.' : ' It also counts as a balance day.') : isBalance(s) ? ' Balance days need moderate effort or more.' : '';
  let msg;
  if (type === 'strength') msg = (past ? 'Logged to last week. ' : 'Logged. ') + 'Counted as a muscle day, not toward your minutes.' + balTail;
  else if (inten === 'light') msg = (past ? 'Logged to last week. ' : 'Logged. ') + 'Counted as light activity, not toward your ' + g.aerobic + ' minutes.' + balTail;
  else if (past) msg = 'Logged to last week.' + balTail;
  else if (inten === 'vigorous') {
    const mult = g.vigorousMultiplier;
    msg = (mult > 1 ? 'Logged. ' + n + ' vigorous minutes counts as ' + (n * mult) + ' toward this week.' : 'Logged. ' + n + ' vigorous minutes toward this week.') + balTail;
  } else msg = 'Logged. ' + n + ' minutes toward this week.' + balTail;
  status.value = msg;
  balanceWork.value = false;
  minutes.value = '';
  nextTick(function () { if (minutesEl.value) minutesEl.value.focus(); });
}

/* Clear all empties the status line and the minutes error (clearAllData) */
watch(function () { return data.clearSeq; }, function () {
  status.value = '';
  minutesError.value = false;
});

function focusActivity() {
  if (activityEl.value) activityEl.value.focus({ preventScroll: true });
}

defineExpose({ focusActivity });
</script>

<template>
  <section class="panel" id="log" aria-labelledby="log-heading" :hidden="ui.ageStepOpen">
    <h2 class="h3" id="log-heading">Log a session</h2>
    <form id="log-form" class="form-stack" novalidate @submit.prevent="onSubmit">
      <div class="field">
        <label class="label" for="log-activity">Activity</label>
        <select class="select" id="log-activity" name="activity" ref="activityEl" v-model="activity">
          <option v-for="o in options" :key="o.value" :id="o.id" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
      <div class="field-pair">
        <div class="field">
          <label class="label" for="log-minutes">Minutes</label>
          <input class="input" id="log-minutes" name="minutes" type="number" inputmode="numeric" min="1" max="240" step="1" autocomplete="off" aria-describedby="log-minutes-err" ref="minutesEl" v-model="minutes" :aria-invalid="minutesError ? 'true' : null" @input="minutesError = false">
          <p class="error" id="log-minutes-err" :hidden="!minutesError">Enter minutes from 1 to 240.</p>
          <div class="chips chips-min" role="group" aria-label="Quick minutes">
            <button class="chip chip-mono" type="button" id="log-chip-5" data-min="5" @click="pickMinutes(5)">5</button>
            <button class="chip chip-mono" type="button" id="log-chip-10" data-min="10" @click="pickMinutes(10)">10</button>
            <button class="chip chip-mono" type="button" id="log-chip-20" data-min="20" @click="pickMinutes(20)">20</button>
            <button class="chip chip-mono" type="button" id="log-chip-30" data-min="30" @click="pickMinutes(30)">30</button>
          </div>
        </div>
        <div class="field">
          <label class="label" for="log-date">When</label>
          <select class="select" id="log-date" name="when" v-model="dateModel">
            <option v-for="o in dateOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>
      <fieldset class="field" id="log-effort" :hidden="isStrengthType">
        <legend class="label">How hard?</legend>
        <div class="seg-group">
          <input class="seg-input" type="radio" name="intensity" id="log-int-light" value="light" v-model="intensity">
          <label class="seg-label first light" for="log-int-light">Light</label>
          <input class="seg-input" type="radio" name="intensity" id="log-int-mod" value="moderate" v-model="intensity">
          <label class="seg-label mid mod" for="log-int-mod">Moderate</label>
          <input class="seg-input" type="radio" name="intensity" id="log-int-vig" value="vigorous" v-model="intensity">
          <label class="seg-label last vig" for="log-int-vig">Vigorous</label>
        </div>
        <p class="small muted" id="log-int-help">{{ intHelp }}</p>
      </fieldset>
      <label class="check" for="log-balance-work" id="log-balance-row" :hidden="balanceRowHidden"><input type="checkbox" id="log-balance-work" name="balance" v-model="balanceWork"><span>This session included balance work</span></label>
      <p class="small muted" id="log-int-note">{{ intNote }}</p>
      <button class="btn btn-accent btn-block" id="log-submit" type="submit">Log it</button>
      <p class="status log-status" id="log-status" role="status" aria-live="polite">{{ status }}</p>
    </form>
    <GpxDrop />
  </section>
</template>
