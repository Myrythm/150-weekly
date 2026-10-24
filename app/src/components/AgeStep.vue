<script setup>
/* The age step (web/index.html #age-step; showAgeError, focusAgeInput, closeAgeStep, onAgeSubmit).
   It replaces the log panel while the age is unset, under 5, or the visitor asked to change it
   (ui.askingAge). Setting a valid age saves it; `done` tells the parent to move focus to Change age. */
import { ref, watch, computed } from 'vue';
import { useDataStore } from '../stores/data.js';
import { useUiStore } from '../stores/ui.js';
import { hasTargets } from '../core/guide.js';
import { reduced } from '../core/motion.js';

const data = useDataStore();
const ui = useUiStore();
const emit = defineEmits(['done']);

const step = ref(null);
const input = ref(null);
const value = ref(data.prefs.age === null ? '' : String(data.prefs.age));
const error = ref(false);

const covered = computed(function () { return hasTargets(data.prefs.age); });
const under5 = computed(function () { return data.group === 'under5'; });

/* Change age fills the field with the saved age and clears an old error; a remote change of the age shows too */
watch(function () { return ui.askingAge; }, function (on) {
  if (!on) return;
  value.value = data.prefs.age === null ? '' : String(data.prefs.age);
  error.value = false;
});
watch(function () { return data.prefs.age; }, function (a) { value.value = a === null ? '' : String(a); });

function focusInput() {
  try { step.value.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) { /* ignore */ }
  if (input.value) input.value.focus({ preventScroll: true });
}

function onSubmit() {
  /* the raw text of the field, as the reference reads it (a number v-model would turn 1e2 into 100) */
  const raw = (input.value ? input.value.value : '').trim(), n = Number(raw);
  if (!/^\d{1,3}$/.test(raw) || n > 120) {
    error.value = true;
    if (input.value) input.value.focus();
    return;
  }
  error.value = false;
  data.setAge(n);
  ui.askingAge = false;
  if (data.group === 'under5') {
    ui.announce('This tracker starts at age 5. WHO has a separate guide for younger children.');
    if (input.value) input.value.focus();
    return;
  }
  ui.announce('Targets set: ' + data.guide.copy.chip + '.');
  emit('done');
}

function cancel() {
  ui.askingAge = false;
  error.value = false;
  emit('done');
}

defineExpose({ focusInput });
</script>

<template>
  <section class="panel age-step" id="age-step" aria-labelledby="age-heading" ref="step" :hidden="!ui.ageStepOpen">
    <h2 class="h3" id="age-heading">First, how old are you?</h2>
    <p class="small age-why">Targets differ for children, adults and people 65 and over.</p>
    <form id="age-form" class="form-stack" novalidate @submit.prevent="onSubmit">
      <div class="field">
        <label class="label" for="age-input">Age in years</label>
        <input class="input age-input" id="age-input" name="age" type="number" inputmode="numeric" min="0" max="120" step="1" autocomplete="off" aria-describedby="age-err age-note" ref="input" v-model="value" :aria-invalid="error ? 'true' : null" @input="error = false">
        <p class="error" id="age-err" :hidden="!error">Enter an age from 5 to 120.</p>
      </div>
      <div class="age-u5" id="age-under5" role="status" :hidden="!under5">
        <p>This tracker starts at age 5. WHO has a separate guide for younger children, built around active play, sleep and screen time.</p>
        <p><a href="https://www.who.int/publications/i/item/9789241550536" target="_blank" rel="noopener">Read the WHO guide for under-5s<span class="sr-only"> (opens in a new tab)</span></a></p>
      </div>
      <button class="btn btn-accent btn-block" id="age-submit" type="submit">Set my targets</button>
      <button class="btn-text age-cancel" id="age-cancel" type="button" :hidden="!(ui.ageStepOpen && covered)" @click="cancel">Keep my current age</button>
      <p class="small muted" id="age-note">Your age is saved to your account. It only sets which targets you see.</p>
    </form>
  </section>
</template>
