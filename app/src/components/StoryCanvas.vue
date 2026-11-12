<script setup>
/* The live story preview: one 1080 x 1920 canvas, scaled down by CSS, drawn with the same
   drawStory() and state the export uses. It waits for the story fonts before the first draw and
   redraws on every state change. An animated template loops over DURATION seconds with
   requestAnimationFrame; with reduced motion it shows the final frame and plays once on request
   (#story-play). While `paused` (an export is running) nothing is drawn here.
   Dragging the canvas, or the arrow keys while it has focus, moves the photo: the component emits
   'move' with the new { x, y } and the page owns the view. */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { drawStory, W, H } from '../story/render.js';
import { DURATION } from '../story/timeline.js';
import { coverRect } from '../story/photo.js';
import { loadStoryFonts } from '../story/fonts.js';
import { reduced } from '../core/motion.js';

const props = defineProps({
  state: { type: Object, required: true },
  animated: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  label: { type: String, required: true },
  locked: { type: Boolean, default: false }
});
const emit = defineEmits(['move']);

const KEY_STEP = 0.1;

const canvas = ref(null);
const fontsReady = ref(false);
const still = ref(reduced());
const playing = ref(false);
let ctx = null;
let raf = 0;
let start = null;
let alive = true;
let mql = null;

const hasPhoto = computed(function () { return !!(props.state.photo && props.state.photo.bitmap); });
const showPlay = computed(function () { return props.animated && still.value; });

function context() {
  if (!ctx && canvas.value) ctx = canvas.value.getContext('2d');
  return ctx;
}

function draw(t) {
  const c = context();
  if (!c || !fontsReady.value || props.paused) return;
  drawStory(c, props.state, t);
}

function stopLoop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  start = null;
}

function frame(ts) {
  raf = 0;
  if (!alive || props.paused) return;
  if (start === null) start = ts;
  const elapsed = (ts - start) / 1000;
  if (playing.value && elapsed >= DURATION) {
    playing.value = false;
    draw(DURATION);
    return;
  }
  draw(playing.value ? elapsed : elapsed % DURATION);
  raf = requestAnimationFrame(frame);
}

/* starts or stops the loop for the current template and settings, and draws once */
function refresh() {
  if (!alive || !fontsReady.value || props.paused) { stopLoop(); return; }
  const loop = props.animated && (!still.value || playing.value);
  if (!loop) {
    stopLoop();
    draw(DURATION);
    return;
  }
  if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
}

function play() {
  stopLoop();
  playing.value = true;
  refresh();
}

/* the page builds a new state object on every change, so identity is enough; a running loop picks it up */
watch(function () { return props.state; }, function () { if (!raf) refresh(); });
/* a new template, or the start or end of an export, starts the animation again from 0 */
watch(function () { return props.state.template + '|' + props.animated + '|' + props.paused; }, function () {
  playing.value = false;
  stopLoop();
  refresh();
});

function onMotion(e) {
  still.value = !!e.matches;
  playing.value = false;
  stopLoop();
  refresh();
}

onMounted(function () {
  try {
    mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mql && typeof mql.addEventListener === 'function') mql.addEventListener('change', onMotion);
    else mql = null;
  } catch (e) { mql = null; }
  loadStoryFonts().then(function () {
    if (!alive) return;
    fontsReady.value = true;
    refresh();
  });
});

onBeforeUnmount(function () {
  alive = false;
  stopLoop();
  if (mql) mql.removeEventListener('change', onMotion);
});

/* ---------- moving the photo ---------- */
function clamp(v) { return Math.max(-1, Math.min(1, v)); }

/* the view after moving the photo by dx, dy canvas pixels (1080 x 1920 space) */
function moved(base, dx, dy) {
  const p = props.state.photo;
  const r = coverRect(p.w, p.h, W, H, base);
  const spareX = p.w - r.sw, spareY = p.h - r.sh;
  const perPx = r.sw / W;
  return {
    x: spareX > 0 ? clamp(base.x - dx * perPx * 2 / spareX) : base.x,
    y: spareY > 0 ? clamp(base.y - dy * perPx * 2 / spareY) : base.y
  };
}

let drag = null;

function onDown(e) {
  if (!hasPhoto.value || props.locked) return;
  const el = canvas.value;
  const rect = el.getBoundingClientRect();
  if (!(rect.width > 0)) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, scale: W / rect.width, view: Object.assign({}, props.state.view) };
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
  e.preventDefault();
}

function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const v = moved(drag.view, (e.clientX - drag.x) * drag.scale, (e.clientY - drag.y) * drag.scale);
  emit('move', v);
}

function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
}

function onKey(e) {
  if (!hasPhoto.value || props.locked) return;
  const k = e.key;
  let dx = 0, dy = 0;
  if (k === 'ArrowLeft') dx = -1;
  else if (k === 'ArrowRight') dx = 1;
  else if (k === 'ArrowUp') dy = -1;
  else if (k === 'ArrowDown') dy = 1;
  else return;
  e.preventDefault();
  /* the photo moves the way the arrow points, so the view moves the other way */
  const v = props.state.view;
  emit('move', { x: clamp(v.x - dx * KEY_STEP), y: clamp(v.y - dy * KEY_STEP) });
}
</script>

<template>
  <div class="story-preview" id="story-preview">
    <canvas
      ref="canvas"
      id="story-canvas"
      class="story-canvas"
      :class="{ 'is-movable': hasPhoto && !locked }"
      width="1080"
      height="1920"
      role="img"
      :aria-label="label"
      :aria-describedby="hasPhoto ? 'story-move-help' : null"
      :tabindex="hasPhoto ? 0 : -1"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @keydown="onKey"
    ></canvas>
    <p class="small muted" id="story-move-help" :hidden="!hasPhoto">Drag the preview, or focus it and use the arrow keys, to move the photo.</p>
    <p v-if="showPlay"><button type="button" class="btn btn-outline btn-small" id="story-play" :disabled="playing || paused" @click="play">Play animation</button></p>
  </div>
</template>
