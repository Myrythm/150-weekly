<script setup>
/* Exercise snacks (web/index.html #snacks; renderRoutines, renderTimer and the snack handlers of
   wireWeek). Left: the routines for the age group, the "Switch routine" question and a safety
   note. Right: the stopwatch panel. The clock lives in useTimer; this component only shows it and
   moves focus where the reference did. A routine the age group no longer shows is dropped, and
   Clear all (data.clearSeq) puts the timer back to idle with the sound box off. */
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { useDataStore } from '../stores/data.js';
import { ROUTINES, routineVisible, routineBalance } from '../core/routines.js';
import { plural, pad } from '../core/dates.js';
import { reduced } from '../core/motion.js';
import { useTimer } from '../composables/useTimer.js';

const data = useDataStore();
const timer = useTimer();

const panel = ref(null);
const startBtn = ref(null);
const resetBtn = ref(null);
const logBtn = ref(null);
const switchNo = ref(null);

const routines = computed(function () {
  return ROUTINES.filter(function (r) { return routineVisible(r, data.group); }).map(function (r) {
    return { r: r, balance: routineBalance(r), muscle: r.type === 'strength' };
  });
});

const st = computed(function () { return timer.state.value; });
const r = computed(function () { return timer.routine.value; });
const loaded = computed(function () { return st.value !== 'idle' && !!r.value; });
const bal = computed(function () { return !!r.value && routineBalance(r.value); });
const isStrengthRoutine = computed(function () { return !!r.value && r.value.type === 'strength'; });

function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
}

const startLabel = computed(function () { return st.value === 'running' ? 'Pause' : st.value === 'paused' ? 'Resume' : 'Start'; });
const startDisabled = computed(function () { return !(st.value === 'ready' || st.value === 'running' || st.value === 'paused'); });
const skipDisabled = computed(function () { return !(st.value === 'running' || st.value === 'paused'); });
const resetDisabled = computed(function () { return !(st.value === 'running' || st.value === 'paused' || st.value === 'finished'); });

const name = computed(function () { return loaded.value ? r.value.name : 'No snack loaded'; });
const stepStep = computed(function () { return loaded.value ? timer.steps.value[timer.idx.value] : null; });
const stepText = computed(function () {
  if (!loaded.value) return 'Pick a snack and press Load timer.';
  return st.value === 'finished' ? 'Done.' : stepStep.value.label;
});
const isRest = computed(function () { return loaded.value && st.value !== 'finished' && stepStep.value.kind === 'rest'; });
const digits = computed(function () {
  if (!loaded.value || st.value === 'finished') return '00:00';
  return fmtClock(timer.bounds.value[timer.idx.value] - timer.elapsed.value);
});
const nextText = computed(function () {
  if (!loaded.value) return '';
  const rr = r.value;
  if (st.value === 'finished') {
    return isStrengthRoutine.value ? 'Logs as a muscle day, not toward your minutes.'
      : bal.value ? rr.logMin + ' ' + plural(rr.logMin, 'minute', 'minutes') + ' in the bank, and it logs as a balance day.'
      : rr.logMin + ' ' + plural(rr.logMin, 'minute', 'minutes') + ' in the bank if you log it.';
  }
  const nx = timer.steps.value[timer.idx.value + 1];
  return 'Next: ' + (nx ? nx.label : 'Finish');
});
const totalText = computed(function () {
  return loaded.value && st.value !== 'finished' ? 'Total left ' + fmtClock(timer.total.value - timer.elapsed.value) : '';
});
const blockClass = function (i) { return (st.value === 'finished' || i < timer.idx.value) ? 'done' : (i === timer.idx.value ? 'cur' : ''); };

const showLog = computed(function () { return st.value === 'finished' && !timer.logged.value; });
const logLabel = computed(function () {
  if (!r.value) return 'Log 0 min';
  return isStrengthRoutine.value ? 'Log as a muscle day' : bal.value ? 'Log ' + r.value.logMin + ' min as a balance day' : 'Log ' + r.value.logMin + ' min';
});
const partialMin = computed(function () { return Math.floor(timer.elapsed.value / 60000); });
const showPartial = computed(function () { return st.value === 'paused' && partialMin.value >= 1; });
const partialLabel = computed(function () {
  return 'Stop and log ' + partialMin.value + ' min' + (isStrengthRoutine.value ? ' as a muscle day' : bal.value ? ' as a balance day' : '');
});
const loggedText = computed(function () {
  return isStrengthRoutine.value ? 'Logged as a muscle day, not toward your minutes. Nice work.' : bal.value ? 'Logged. Counted as a balance day. Nice work.' : 'Logged. Nice work.';
});
const switchText = computed(function () {
  const id = timer.pendingSwitch.value, t = ROUTINES.find(function (x) { return x.id === id; });
  return t ? 'Switch to ' + t.name + '? Your current timer stops.' : '';
});

function focusStart(opts) { if (startBtn.value) startBtn.value.focus(opts); }

async function afterLoad() {
  await nextTick();
  try { if (panel.value) panel.value.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ }
  focusStart({ preventScroll: true });
}
async function onLoad(id) {
  const res = timer.requestLoad(id);
  if (res === 'loaded') { afterLoad(); return; }
  await nextTick();
  if (res === 'same') focusStart({ preventScroll: true });
  else if (switchNo.value) switchNo.value.focus();
}
function onSwitchYes() { if (timer.confirmSwitch()) afterLoad(); }
async function onSwitchNo() { timer.cancelSwitch(); await nextTick(); focusStart({ preventScroll: true }); }

function onStart() { timer.start(); }
function onSkip() { timer.skip(); }
async function onReset() { timer.reset(); await nextTick(); focusStart(); }
async function onLog() { if (timer.logFull()) { await nextTick(); if (resetBtn.value) resetBtn.value.focus(); } }
async function onPartial() { if (timer.logPartial()) { await nextTick(); focusStart(); } }

const sound = computed({
  get: function () { return !!data.prefs.sound; },
  set: function (on) {
    data.setSound(on);
    if (on) timer.ensureAudio();
  }
});

/* a finished run puts focus on Log it */
watch(st, async function (now) {
  if (now !== 'finished') return;
  await nextTick();
  if (logBtn.value && showLog.value) logBtn.value.focus();
});
/* an age group that hides the loaded routine stops the timer */
watch(function () { return data.group; }, function (g) {
  if (timer.routine.value && !routineVisible(timer.routine.value, g)) timer.clear();
});
watch(function () { return data.clearSeq; }, function () { timer.clear(); });

onBeforeUnmount(function () { timer.dispose(); });
</script>

<template>
  <section class="section" id="snacks" aria-labelledby="snacks-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="label">Exercise snacks</p>
        <h2 class="h2" id="snacks-heading">Short on time? Take a snack.</h2>
      </div>
      <p class="section-intro">No gym, no kit, no change of clothes. Pick one, press start, and log it when the timer ends.</p>
      <div class="snack-layout">
        <div>
          <ul class="routines" id="routines">
            <li v-for="x in routines" :key="x.r.id" class="routine" :class="{ 'is-selected': !!(r && r.id === x.r.id) }" :id="'routine-' + x.r.id">
              <div class="routine-head">
                <h3 class="h3">{{ x.r.name }}</h3>
                <span class="routine-tags">
                  <span class="tag tag-neutral">{{ x.r.tag }}</span>
                  <span v-if="x.muscle" class="tag tag-neutral">Muscle day</span>
                  <span v-else class="tag" :class="x.r.intensity === 'vigorous' ? 'tag-vig' : 'tag-mod'">{{ x.r.intensity }}</span>
                  <span v-if="x.balance" class="tag tag-neutral">Balance day</span>
                </span>
              </div>
              <div class="routine-body">
                <p class="small muted">{{ x.r.summary }}</p>
                <p v-if="x.r.safety" class="small routine-safety">{{ x.r.safety }}</p>
              </div>
              <button class="btn btn-outline btn-small" type="button" :id="'snack-load-' + x.r.id" :aria-label="'Load timer: ' + x.r.name" @click="onLoad(x.r.id)">Load timer</button>
            </li>
          </ul>
          <div class="confirm" id="snack-switch" role="group" aria-label="Switch routine" :hidden="!timer.pendingSwitch.value">
            <p id="snack-switch-msg">{{ switchText }}</p>
            <div class="row">
              <button class="btn btn-accent btn-small" id="snack-switch-yes" type="button" @click="onSwitchYes">Switch</button>
              <button class="btn btn-outline btn-small" id="snack-switch-no" type="button" ref="switchNo" @click="onSwitchNo">Keep going</button>
            </div>
          </div>
          <p class="small muted snack-note">Go at your own pace. Stop if you feel pain, dizziness or chest discomfort.</p>
        </div>
        <div class="timer" id="timer-panel" aria-labelledby="timer-name" ref="panel">
          <p class="label t-label">Stopwatch</p>
          <h3 class="h3" id="timer-name">{{ name }}</h3>
          <p class="timer-step" id="timer-step" :class="{ 'is-rest': isRest }">{{ stepText }}</p>
          <p class="timer-digits" id="timer-digits" aria-hidden="true">{{ digits }}</p>
          <p class="timer-next"><span id="timer-next">{{ nextText }}</span><span id="timer-total">{{ totalText }}</span></p>
          <p class="small timer-safety" id="timer-safety" :hidden="!(loaded && r.safety)">{{ r && r.safety ? r.safety : '' }}</p>
          <div class="strip" id="timer-strip" aria-hidden="true">
            <i v-for="(s, i) in (loaded ? timer.steps.value : [])" :key="i" :class="blockClass(i)"></i>
          </div>
          <div class="timer-btns">
            <button class="btn btn-accent" id="snack-start" type="button" ref="startBtn" :disabled="startDisabled" @click="onStart">{{ startLabel }}</button>
            <button class="btn btn-outline" id="snack-skip" type="button" :disabled="skipDisabled" @click="onSkip">Skip</button>
            <button class="btn btn-outline" id="snack-reset" type="button" ref="resetBtn" :disabled="resetDisabled" @click="onReset">Reset</button>
          </div>
          <div class="timer-extra">
            <button class="btn btn-accent" id="snack-log" type="button" ref="logBtn" :hidden="!showLog" @click="onLog">{{ logLabel }}</button>
            <button class="btn-text" id="snack-partial" type="button" :hidden="!showPartial" @click="onPartial">{{ partialLabel }}</button>
            <p class="status" id="snack-logged" :hidden="!(loaded && timer.logged.value)">{{ loggedText }}</p>
          </div>
          <label class="check" for="snack-sound"><input type="checkbox" id="snack-sound" v-model="sound"><span>Beep at each change</span></label>
          <div class="sr-only" id="timer-live" role="status" aria-live="polite">{{ timer.live.value }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
