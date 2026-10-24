/*
 * The exercise snack timer. Ported from the "timer" section of web/js/app.js (T, ensureAudio, beep,
 * elapsed, stepAt, timerAnnounce, announceStep, tick, finishTimer, loadRoutine, requestLoad,
 * onStart, onSkip, onReset, logSnack, onLogSnack, onPartial) with the DOM work left to
 * SnacksSection.vue.
 *
 *   state        'idle' | 'ready' | 'running' | 'paused' | 'finished'
 *   routine      the loaded routine (ROUTINES entry) or null
 *   steps        the loaded routine's steps [{ label, sec, kind }]; idx is the current one
 *   elapsed      milliseconds done, refreshed on every tick and action (a ref, for the digits)
 *   total        milliseconds in all steps; logged is true once this run was logged
 *   pendingSwitch  id of the routine waiting behind the "Switch routine" question, or null
 *   live         text for the timer's own polite region (#timer-live)
 *   load(id)     load a routine (stops the clock, state ready)
 *   requestLoad(id)  'loaded', 'same' (that routine is already running) or 'pending' (a run is in progress: ask first)
 *   confirmSwitch() / cancelSwitch()   answer the question
 *   start()      Start, Pause and Resume in one (as the one reference button)
 *   skip()       jump to the next step (finishes on the last one)
 *   reset()      back to ready at 0:00
 *   logFull()    log the routine's length (once, when finished); logPartial() logs the whole minutes done
 *   clear()      back to idle with nothing loaded (clear all, a group that hides the routine)
 *   tick()       one clock check; the 250 ms interval calls it, tests call it by hand
 *   dispose()    stop the interval and the pending announcement (on unmount)
 *   beep(n), ensureAudio()   sound; only when the sound preference is on, and only after a gesture
 *                            (ensureAudio runs from Start, Resume and the sound checkbox)
 *
 * opts.now is the clock in milliseconds (default performance.now); tests pass their own.
 */
import { ref, shallowRef, computed } from 'vue';
import { ROUTINES, buildSteps, routineBalance } from '../core/routines.js';
import { useDataStore } from '../stores/data.js';

const TICK_MS = 250;
const ANNOUNCE_DELAY_MS = 60;

export function useTimer(opts) {
  const data = useDataStore();
  const clock = (opts && typeof opts.now === 'function') ? opts.now : function () { return performance.now(); };

  const state = ref('idle');
  const routine = shallowRef(null);
  const steps = ref([]);
  const bounds = ref([]);
  const total = ref(0);
  const idx = ref(0);
  const elapsed = ref(0);
  const logged = ref(false);
  const pendingSwitch = ref(null);
  const live = ref('');

  let acc = 0;         /* milliseconds done before the current run started */
  let t0 = 0;          /* clock reading when the current run started */
  let interval = 0;
  let announceTimer = 0;
  let audio = null;

  const running = computed(function () { return state.value === 'running'; });

  function now() { return acc + (state.value === 'running' ? clock() - t0 : 0); }
  function refresh() { elapsed.value = now(); }
  function stepAt(ms) {
    for (let i = 0; i < bounds.value.length; i++) if (ms < bounds.value[i]) return i;
    return bounds.value.length - 1;
  }

  function ensureAudio() {
    if (audio) return audio;
    try {
      const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (C) audio = new C();
    } catch (e) { audio = null; }
    return audio;
  }
  function beep(count) {
    if (!data.prefs.sound) return;
    try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(150); } catch (e) { /* ignore */ }
    try {
      if (!audio) return;
      if (audio.state === 'suspended' && audio.resume) audio.resume();
      for (let i = 0; i < count; i++) {
        const t = audio.currentTime + i * 0.24;
        const osc = audio.createOscillator(), gain = audio.createGain();
        osc.type = 'sine'; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        osc.connect(gain); gain.connect(audio.destination);
        osc.start(t); osc.stop(t + 0.13);
      }
    } catch (e) { /* silent */ }
  }

  function say(msg) {
    live.value = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () { announceTimer = 0; live.value = msg; }, ANNOUNCE_DELAY_MS);
  }
  function announceStep() {
    const st = steps.value[idx.value];
    say(st.label + ', ' + st.sec + ' seconds');
  }

  function stopInterval() { clearInterval(interval); interval = 0; }
  function startInterval() { stopInterval(); interval = setInterval(tick, TICK_MS); }

  function finish() {
    stopInterval();
    state.value = 'finished'; acc = total.value; idx.value = steps.value.length - 1;
    const r = routine.value;
    say('Done. ' + r.logMin + ' minutes.' + (r.type === 'strength' ? ' This logs as a muscle day.' : routineBalance(r) ? ' This logs as a balance day.' : ''));
    beep(3);
    refresh();
  }

  function tick() {
    if (state.value !== 'running') return;
    const el = now();
    if (el >= total.value) { finish(); return; }
    const i = stepAt(el);
    if (i !== idx.value) { idx.value = i; announceStep(); beep(1); }
    elapsed.value = el;
  }

  function clear() {
    stopInterval();
    state.value = 'idle'; routine.value = null; steps.value = []; bounds.value = [];
    total.value = 0; acc = 0; idx.value = 0; logged.value = false; pendingSwitch.value = null;
    elapsed.value = 0;
  }

  function load(id) {
    const r = ROUTINES.find(function (x) { return x.id === id; });
    if (!r) return false;
    stopInterval();
    routine.value = r; steps.value = buildSteps(r);
    let sum = 0; bounds.value = steps.value.map(function (s) { sum += s.sec * 1000; return sum; });
    total.value = sum; acc = 0; idx.value = 0; state.value = 'ready'; logged.value = false; pendingSwitch.value = null;
    elapsed.value = 0;
    return true;
  }

  function requestLoad(id) {
    const inProgress = state.value === 'running' || state.value === 'paused';
    if (inProgress && routine.value && routine.value.id === id) return 'same';
    if (inProgress) {
      if (!ROUTINES.some(function (x) { return x.id === id; })) return 'same';
      pendingSwitch.value = id;
      return 'pending';
    }
    load(id);
    return 'loaded';
  }
  function confirmSwitch() { const id = pendingSwitch.value; if (id) load(id); return !!id; }
  function cancelSwitch() { pendingSwitch.value = null; }

  function start() {
    const st = state.value;
    if (st === 'ready') {
      if (data.prefs.sound) ensureAudio();
      logged.value = false; acc = 0; idx.value = 0; t0 = clock(); state.value = 'running';
      startInterval(); announceStep();
    } else if (st === 'running') {
      acc = now(); state.value = 'paused'; stopInterval();
    } else if (st === 'paused') {
      if (data.prefs.sound) ensureAudio();
      t0 = clock(); state.value = 'running'; startInterval();
    }
    refresh();
  }

  function skip() {
    if (state.value !== 'running' && state.value !== 'paused') return;
    if (idx.value >= steps.value.length - 1) { finish(); return; }
    acc = bounds.value[idx.value];
    idx.value += 1;
    if (state.value === 'running') t0 = clock();
    announceStep(); beep(1);
    refresh();
  }

  function reset() {
    if (!routine.value) return;
    stopInterval();
    acc = 0; idx.value = 0; state.value = 'ready'; logged.value = false;
    refresh();
  }

  function logSnack(minutes) {
    const r = routine.value;
    if (!r || minutes < 1) return;
    data.addSession({ type: r.type, minutes: minutes, intensity: r.intensity, source: 'snack', note: r.name });
  }

  /* true when a session was added */
  function logFull() {
    if (state.value !== 'finished' || logged.value) return false;
    logSnack(routine.value.logMin);
    logged.value = true;
    return true;
  }

  function logPartial() {
    const mins = Math.floor(now() / 60000);
    if (mins < 1 || !routine.value) return false;
    logSnack(mins);
    stopInterval();
    acc = 0; idx.value = 0; state.value = 'ready'; logged.value = true;
    refresh();
    return true;
  }

  function dispose() {
    stopInterval();
    clearTimeout(announceTimer);
    announceTimer = 0;
  }

  return {
    state, routine, steps, bounds, total, idx, elapsed, logged, pendingSwitch, live, running,
    load, requestLoad, confirmSwitch, cancelSwitch, start, skip, reset, logFull, logPartial, clear, tick, dispose,
    ensureAudio, beep
  };
}
