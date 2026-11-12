<script setup>
/* The story controls, in the order of the spec: template, photo, colour, opacity, main number, small
   numbers, export. Presentational: every choice goes up as an event and the page saves it (the
   saved settings) or keeps it (photo, zoom, the created file). While `busy` (an export is running)
   the settings are locked so the file matches what was shown. */
import { computed } from 'vue';
import { NUMBER_KEYS, HERO_KEYS, MAX_SMALL } from '../story/numbers.js';
import { PRESETS } from '../story/colors.js';

const props = defineProps({
  templates: { type: Array, required: true },     /* [{ id, name, animated, ok, reason }] */
  template: { type: String, required: true },
  values: { type: Object, required: true },        /* numberValues(): key -> value or null */
  numbers: { type: Object, required: true },       /* { hero, small } as resolved */
  color: { type: String, required: true },
  opacity: { type: Number, required: true },
  hasPhoto: { type: Boolean, default: false },
  zoom: { type: Number, default: 1 },
  photoError: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  photoLoading: { type: Boolean, default: false },
  animated: { type: Boolean, default: false },
  status: { type: String, default: '' },
  ready: { type: Boolean, default: false },
  canShare: { type: Boolean, default: false }
});
const emit = defineEmits(['template', 'photo', 'zoom', 'nophoto', 'color', 'color-reset', 'opacity', 'hero', 'small', 'recommended', 'create', 'share', 'download']);

const NUM_LABEL = { dist: 'Distance', time: 'Time', pace: 'Pace', hr: 'Avg heart rate', best: 'Best km', maxhr: 'Max heart rate', climb: 'Climb', cad: 'Cadence' };

const unavailable = computed(function () { return props.templates.filter(function (t) { return !t.ok; }); });
const colorUpper = computed(function () { return String(props.color).toUpperCase(); });
const colorInput = computed(function () { return String(props.color).toLowerCase(); });
const countText = computed(function () { return props.numbers.small.length + ' of ' + MAX_SMALL + ' small numbers used.'; });

function has(k) { return !!props.values[k]; }
function isSmall(k) { return props.numbers.small.indexOf(k) >= 0; }

function onFile(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  if (file) emit('photo', file);
  /* the same file can be picked again after a change */
  try { input.value = ''; } catch (err) { /* read only in some engines */ }
}
</script>

<template>
  <div class="story-controls" id="story-controls">
    <fieldset class="story-group" :disabled="busy">
      <legend class="label story-legend">Template</legend>
      <div class="story-tpls">
        <button
          v-for="t in templates"
          :key="t.id"
          type="button"
          class="story-opt story-tpl"
          :id="'story-tpl-' + t.id"
          :aria-pressed="template === t.id ? 'true' : 'false'"
          :disabled="!t.ok"
          :aria-describedby="t.ok ? null : 'story-tpl-note'"
          @click="emit('template', t.id)"
        ><span class="story-tpl-name">{{ t.name }}</span> <span class="story-tpl-kind">{{ t.animated ? 'Animated' : 'Static' }}</span></button>
      </div>
      <p class="small muted" id="story-tpl-note" :hidden="!unavailable.length"><span v-for="t in unavailable" :key="t.id" class="story-tpl-why">{{ t.name }}: {{ t.reason }} </span></p>
    </fieldset>

    <fieldset class="story-group" :disabled="busy">
      <legend class="label story-legend">Photo</legend>
      <div class="story-row">
        <label class="btn btn-outline btn-small story-file" for="story-photo">{{ hasPhoto ? 'Change photo' : 'Add photo' }}<input type="file" id="story-photo" class="sr-only" accept="image/*" :disabled="busy" @change="onFile" /></label>
        <button type="button" class="btn btn-outline btn-small" id="story-nophoto" :disabled="!hasPhoto" @click="emit('nophoto')">No photo</button>
      </div>
      <p class="error" id="story-photo-error" v-if="photoError">That file could not be read as a picture. Try a JPG or PNG.</p>
      <div class="story-range">
        <label class="small" for="story-zoom">Zoom</label>
        <input type="range" id="story-zoom" min="1" max="3" step="0.05" :value="zoom" :disabled="!hasPhoto" @input="emit('zoom', Number($event.target.value))" />
      </div>
      <p class="small muted" id="story-photo-privacy">Your photo stays on this device. It is not uploaded or saved.</p>
    </fieldset>

    <fieldset class="story-group" :disabled="busy">
      <legend class="label story-legend">Colour</legend>
      <div class="story-row">
        <button
          v-for="p in PRESETS"
          :key="p.id"
          type="button"
          class="story-sw"
          :id="'story-color-' + p.id"
          :style="{ '--c': p.hex }"
          :aria-label="p.name"
          :aria-pressed="colorUpper === p.hex ? 'true' : 'false'"
          @click="emit('color', p.hex)"
        ></button>
      </div>
      <div class="story-row">
        <label class="story-custom small" for="story-color-custom">Any colour<input type="color" id="story-color-custom" :value="colorInput" @input="emit('color', $event.target.value)" /></label>
        <button type="button" class="btn-text" id="story-color-reset" @click="emit('color-reset')">Reset colour</button>
      </div>
    </fieldset>

    <fieldset class="story-group" :disabled="busy">
      <legend class="label story-legend">Opacity</legend>
      <div class="story-range">
        <label class="small" for="story-opacity">Colour layer</label>
        <input type="range" id="story-opacity" min="0" max="100" step="5" :value="opacity" @input="emit('opacity', Number($event.target.value))" />
        <output class="story-out" id="story-opacity-out" for="story-opacity">{{ opacity }}%</output>
      </div>
    </fieldset>

    <fieldset class="story-group" :disabled="busy">
      <legend class="label story-legend">Main number</legend>
      <div class="story-row">
        <button
          v-for="k in HERO_KEYS"
          :key="k"
          type="button"
          class="story-opt"
          :id="'story-hero-' + k"
          :aria-pressed="numbers.hero === k ? 'true' : 'false'"
          :disabled="!has(k)"
          @click="emit('hero', k)"
        >{{ NUM_LABEL[k] }}</button>
      </div>
    </fieldset>

    <fieldset class="story-group" :disabled="busy">
      <legend class="label story-legend">Small numbers</legend>
      <div class="story-row">
        <button
          v-for="k in NUMBER_KEYS"
          :key="k"
          type="button"
          class="story-opt"
          :id="'story-num-' + k"
          :aria-pressed="isSmall(k) ? 'true' : 'false'"
          :disabled="!has(k) || numbers.hero === k"
          aria-describedby="story-num-count"
          @click="emit('small', k)"
        >{{ NUM_LABEL[k] }}</button>
      </div>
      <p class="small muted" id="story-num-count">{{ countText }}</p>
      <p><button type="button" class="btn-text" id="story-num-rec" @click="emit('recommended')">Back to recommended</button></p>
    </fieldset>

    <div class="story-group story-export" role="group" aria-labelledby="story-export-title">
      <p class="label story-legend" id="story-export-title">Export</p>
      <div class="story-row">
        <button v-if="!ready" type="button" class="btn btn-accent" id="story-create" :disabled="busy || photoLoading" @click="emit('create')">{{ animated ? 'Create video' : 'Create picture' }}</button>
        <template v-else>
          <button v-if="canShare" type="button" class="btn btn-accent" id="story-share" @click="emit('share')">Share</button>
          <button type="button" class="btn btn-outline" id="story-download" @click="emit('download')">Download</button>
        </template>
      </div>
      <p class="status story-status" id="story-status" role="status" aria-live="polite">{{ status }}</p>
    </div>
  </div>
</template>
