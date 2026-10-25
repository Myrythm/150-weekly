<script setup>
/* One chart of the activity page (drawChart and the per chart half of setCursor in web/js/app.js):
   a line over distance drawn at the real box width, with a crosshair at the shared cursor.

   props: spec (from chartSpecs), distM (series distances), total (x axis length), cursor (distance or null)
   emits: cursor(distance, fromKey) on pointer moves and arrow, Home and End keys; the page keeps the
   one shared distance so every chart and the route marker follow it. */
import { ref, computed } from 'vue';
import { isNum } from '../core/gpxEffort.js';
import { f1, sortedNums, pctile, niceStep, timeStep, chartUnitNote, readAt } from '../core/chartMath.js';
import { useBoxWidth } from '../composables/useBoxWidth.js';

const props = defineProps({
  spec: { type: Object, required: true },
  distM: { type: Array, required: true },
  total: { type: Number, required: true },
  cursor: { type: Number, default: null }
});
const emit = defineEmits(['cursor']);

const box = ref(null);
const svg = ref(null);
const { width, mounted } = useBoxWidth(box);

const g = computed(function () {
  const spec = props.spec, distM = props.distM, total = props.total;
  const W = Math.max(260, Math.round(width.value || 360)), H = W < 480 ? 140 : 170;
  const L = 46, R = 12, T = 10, B = 24, iw = W - L - R, ih = H - T - B;
  const v = sortedNums(spec.vals);
  let lo = spec.clip ? pctile(v, 0.03) : v[0], hi = spec.clip ? pctile(v, 0.97) : v[v.length - 1];
  if (spec.minSpan && hi - lo < spec.minSpan) { const c = (hi + lo) / 2; lo = c - spec.minSpan / 2; hi = c + spec.minSpan / 2; }
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const padv = (hi - lo) * 0.08; lo -= padv; hi += padv;
  const yOf = function (val) { const c = Math.max(lo, Math.min(hi, val)), f = (c - lo) / (hi - lo); return spec.invert ? T + f * ih : T + (1 - f) * ih; };
  const xOf = function (d) { return L + (total > 0 ? Math.max(0, Math.min(1, d / total)) : 0) * iw; };
  const label = spec.title + ' over distance, from ' + spec.fmt(v[0]) + ' to ' + spec.fmt(v[v.length - 1]) + '. Use the arrow keys to read values along the way.';
  const yTicks = [];
  const step = spec.time ? timeStep(hi - lo) : niceStep(hi - lo, 3);
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) yTicks.push({ y: f1(yOf(t)), text: spec.tick(t) });
  const xTicks = [];
  const useKm = total >= 1500;
  const xs = niceStep(useKm ? total / 1000 : total, W < 480 ? 3 : 5) * (useKm ? 1000 : 1);
  for (let d = 0; d <= total + 1e-6; d += xs) {
    const x = xOf(d);
    if (d > 0 && x > W - R - 18) break;
    xTicks.push({ x: f1(x), anchor: d === 0 ? 'start' : 'middle', text: d === 0 ? '0' : useKm ? (+(d / 1000).toFixed(2)) + ' km' : Math.round(d) + ' m' });
  }
  let line = '', area = '', open = false, first = null, last = null;
  for (let i = 0; i < distM.length; i++) {
    const val = spec.vals[i];
    if (!isNum(val) || !isNum(distM[i])) { open = false; continue; }
    const x = f1(xOf(distM[i])), y = f1(yOf(val));
    line += (open ? 'L' : 'M') + x + ' ' + y;
    area += (first === null ? 'M' + x + ' ' + (T + ih) + 'L' : 'L') + x + ' ' + y;
    if (first === null) first = x;
    last = x; open = true;
  }
  return {
    W: W, H: H, L: L, R: R, T: T, ih: ih, iw: iw, xOf: xOf, yOf: yOf, label: label, yTicks: yTicks, xTicks: xTicks, line: line,
    area: spec.area && first !== null ? area + 'L' + last + ' ' + (T + ih) + 'Z' : null
  };
});

const reading = computed(function () { return props.cursor === null ? null : readAt(props.spec, props.distM, props.cursor); });
const cur = computed(function () {
  const r = reading.value;
  if (!r) return null;
  return { x: f1(g.value.xOf(props.distM[r.i])), dotY: isNum(r.val) ? f1(g.value.yOf(r.val)) : null };
});
const readText = computed(function () { return reading.value ? reading.value.txt : (props.spec.avg ? 'avg ' + props.spec.avg : ''); });
const note = computed(function () { return chartUnitNote(props.spec); });

function fromEvent(e) {
  const c = g.value, rect = svg.value.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (c.W / Math.max(1, rect.width));
  emit('cursor', Math.max(0, Math.min(1, (x - c.L) / c.iw)) * props.total, false);
}
function onKey(e) {
  const total = props.total, stepD = total / 40, now = props.cursor === null ? 0 : props.cursor;
  let next = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(total, now + stepD);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, now - stepD);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = total;
  if (next === null) return;
  e.preventDefault();
  emit('cursor', next, true);
}
</script>

<template>
  <figure class="chart" :id="'gpx-d-fig-' + spec.id">
    <div class="fig-title"><span class="label">{{ spec.title }}</span><span class="fig-read" :id="'gpx-d-read-' + spec.id">{{ readText }}</span></div>
    <div class="chart-box" :id="'gpx-d-chart-box-' + spec.id" ref="box">
      <svg v-if="mounted" ref="svg" :id="'gpx-d-chart-' + spec.id" :viewBox="'0 0 ' + g.W + ' ' + g.H" :width="g.W" :height="g.H" role="img" tabindex="0" :aria-label="g.label" @pointermove="fromEvent" @pointerdown="fromEvent" @keydown="onKey">
        <template v-for="(t, i) in g.yTicks" :key="'y' + i">
          <line class="ch-grid" :x1="g.L" :x2="g.W - g.R" :y1="t.y" :y2="t.y" />
          <text class="ch-ax" :x="g.L - 6" :y="t.y + 4" text-anchor="end">{{ t.text }}</text>
        </template>
        <line class="ch-axis" :x1="g.L" :x2="g.W - g.R" :y1="g.T + g.ih" :y2="g.T + g.ih" />
        <text v-for="(t, i) in g.xTicks" :key="'x' + i" class="ch-ax" :x="t.x" :y="g.H - 6" :text-anchor="t.anchor">{{ t.text }}</text>
        <path v-if="g.area" class="ch-area" :d="g.area" />
        <path class="ch-line" :d="g.line" />
        <line class="ch-cur" :x1="cur ? cur.x : 0" :x2="cur ? cur.x : 0" :y1="g.T" :y2="g.T + g.ih" :visibility="cur ? 'visible' : 'hidden'" />
        <circle class="ch-dot" r="4" :cx="cur && cur.dotY !== null ? cur.x : 0" :cy="cur && cur.dotY !== null ? cur.dotY : 0" :visibility="cur && cur.dotY !== null ? 'visible' : 'hidden'" />
      </svg>
    </div>
    <figcaption v-if="note" class="small muted">{{ note }}</figcaption>
  </figure>
</template>
