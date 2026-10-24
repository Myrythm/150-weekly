<script setup>
/* The route figure of the activity page (drawRoute, routeLegend and the route half of setCursor in
   web/js/app.js): the GPS points drawn without a map at the real box width, coloured by heart rate
   (else speed), numbered distance dots, start and finish, and a marker at the shared cursor.

   props: track (the stored track record: { track, metrics, ... }), type (session type), cursor (distance or null) */
import { ref, computed } from 'vue';
import { GPX } from '../core/gpx.js';
import { isNum } from '../core/gpxEffort.js';
import { f1, sortedNums, pctile } from '../core/chartMath.js';
import { useBoxWidth } from '../composables/useBoxWidth.js';

const props = defineProps({
  track: { type: Object, required: true },
  type: { type: String, required: true },
  cursor: { type: Number, default: null }
});

const box = ref(null);
const { width, mounted } = useBoxWidth(box);

/* route: equirectangular projection (longitude scaled by cos(latitude)), fitted to the box with padding, aspect kept */
const rt = computed(function () {
  const rec = props.track, type = props.type;
  const tr = rec.track, n = tr.lat.length, total = rec.metrics.distanceM;
  const W = Math.max(260, Math.round(width.value || 360)), PAD = 28;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (let i = 0; i < n; i++) { minLat = Math.min(minLat, tr.lat[i]); maxLat = Math.max(maxLat, tr.lat[i]); minLon = Math.min(minLon, tr.lon[i]); maxLon = Math.max(maxLon, tr.lon[i]); }
  const k = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const mx = function (lon) { return (lon - minLon) * 111320 * k; }, my = function (lat) { return (maxLat - lat) * 110574; };
  const dx = mx(maxLon), dy = my(minLat);
  let H = dx > 0 ? Math.round(dy * (W - 2 * PAD) / dx + 2 * PAD) : W;
  H = Math.max(200, Math.min(H, Math.max(320, Math.round(W * 1.1))));
  let s = Math.min(dx > 0 ? (W - 2 * PAD) / dx : Infinity, dy > 0 ? (H - 2 * PAD) / dy : Infinity);
  if (!isFinite(s)) s = 1;
  const ox = (W - dx * s) / 2, oy = (H - dy * s) / 2;
  const brk = {};
  (tr.brk || []).forEach(function (b) { brk[b] = true; });
  const px = [], py = [], cum = [0];
  for (let i = 0; i < n; i++) {
    px.push(ox + mx(tr.lon[i]) * s); py.push(oy + my(tr.lat[i]) * s);
    if (i) cum.push(cum[i - 1] + (brk[i] ? 0 : GPX.haversine({ lat: tr.lat[i - 1], lon: tr.lon[i - 1] }, { lat: tr.lat[i], lon: tr.lon[i] })));
  }
  /* colour: heart rate if present, else speed from the point times; quartiles of one blue ramp */
  let col = null;
  if (Array.isArray(tr.hr) && tr.hr.filter(isNum).length >= 10) col = { vals: tr.hr.map(function (x, i) { let a = 0, c = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) if (isNum(tr.hr[j])) { a += tr.hr[j]; c++; } return c ? a / c : null; }), low: 'Lower heart rate', high: 'Higher' };
  else if (Array.isArray(tr.t) && tr.t.filter(isNum).length >= 10) col = { vals: tr.t.map(function (x, i) { const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2), dt = tr.t[b] - tr.t[a]; return isNum(dt) && dt > 0 ? (cum[b] - cum[a]) / dt : null; }), low: 'Slower', high: 'Faster' };
  const q = col ? sortedNums(col.vals) : [];
  const qs = q.length >= 8 ? [pctile(q, 0.25), pctile(q, 0.5), pctile(q, 0.75)] : null;
  if (!qs) col = null;
  const bucket = function (i) { if (!col) return 3; const v = col.vals[i]; if (!isNum(v)) return 2; return v < qs[0] ? 1 : v < qs[1] ? 2 : v < qs[2] ? 3 : 4; };
  let dCase = '';
  for (let i = 0; i < n; i++) dCase += (i === 0 || brk[i] ? 'M' : 'L') + f1(px[i]) + ' ' + f1(py[i]);
  let run = null;
  const runs = [];
  for (let i = 1; i < n; i++) {
    if (brk[i]) { run = null; continue; }
    const b = bucket(i);
    if (!run || run.b !== b) { run = { b: b, d: 'M' + f1(px[i - 1]) + ' ' + f1(py[i - 1]) }; runs.push(run); }
    run.d += 'L' + f1(px[i]) + ' ' + f1(py[i]);
  }
  /* numbered distance markers: km (100 m for swims), thinned to at most 12 */
  const unit = type === 'swim' ? 100 : 1000;
  let step = unit;
  while (total / step > 12) step *= 2;
  const ratio = total > 0 ? cum[n - 1] / total : 1;
  const kms = [];
  let j = 1;
  for (let d = step; d < total - step * 0.15; d += step) {
    const rd = d * ratio;
    while (j < n - 1 && cum[j] < rd) j++;
    const f = cum[j] > cum[j - 1] ? Math.max(0, Math.min(1, (rd - cum[j - 1]) / (cum[j] - cum[j - 1]))) : 0;
    const x = f1(px[j - 1] + (px[j] - px[j - 1]) * f), y = f1(py[j - 1] + (py[j] - py[j - 1]) * f);
    kms.push({ x: x, y: y, text: String(Math.round(d / unit)) });
  }
  return {
    W: W, H: H, px: px, py: py, cum: cum, ratio: ratio, col: col, step: step, unit: unit, dCase: dCase, runs: runs, kms: kms,
    start: { x: f1(px[0]), y: f1(py[0]) }, finish: { x: f1(px[n - 1]), y: f1(py[n - 1]) },
    label: 'Route shape, ' + GPX.fmtDistance(total) + ', drawn from the GPS points without a map. The green dot is the start and the red ring is the finish.'
  };
});

/* the marker at the shared cursor distance (series distance scaled to the drawn route length) */
const cur = computed(function () {
  const r = rt.value, d = props.cursor;
  if (d === null || r.cum.length <= 1) return null;
  const rd = d * r.ratio, c = r.cum;
  let i = 1;
  while (i < c.length - 1 && c[i] < rd) i++;
  const f = c[i] > c[i - 1] ? Math.max(0, Math.min(1, (rd - c[i - 1]) / (c[i] - c[i - 1]))) : 0;
  return { x: f1(r.px[i - 1] + (r.px[i] - r.px[i - 1]) * f), y: f1(r.py[i - 1] + (r.py[i] - r.py[i - 1]) * f) };
});

const stepText = computed(function () {
  const r = rt.value;
  return r.unit === 100 ? 'Numbered dots every ' + r.step + ' m (1 = 100 m).' : 'Numbered dots every ' + (r.step / 1000) + ' km.';
});
const distText = computed(function () { return GPX.fmtDistance(props.track.metrics.distanceM); });
const osm = computed(function () {
  const tr = props.track.track, lat0 = tr.lat[0].toFixed(5), lon0 = tr.lon[0].toFixed(5);
  return 'https://www.openstreetmap.org/?mlat=' + lat0 + '&mlon=' + lon0 + '#map=16/' + lat0 + '/' + lon0;
});
</script>

<template>
  <figure class="route" id="gpx-d-route-fig">
    <div class="fig-title"><span class="label">Route</span><span class="fig-read">{{ distText }}</span></div>
    <div class="route-box" id="gpx-d-route-box" ref="box">
      <svg v-if="mounted" id="gpx-d-route" :viewBox="'0 0 ' + rt.W + ' ' + rt.H" :width="rt.W" :height="rt.H" role="img" :aria-label="rt.label">
        <path class="rt-case" :d="rt.dCase" />
        <path v-for="(r, i) in rt.runs" :key="'r' + i" :class="'rt-line rt-' + r.b" :d="r.d" />
        <g v-for="(m, i) in rt.kms" :key="'k' + i" class="rt-km"><circle :cx="m.x" :cy="m.y" r="9" /><text :x="m.x" :y="m.y + 3.5">{{ m.text }}</text></g>
        <circle class="rt-finish" :cx="rt.finish.x" :cy="rt.finish.y" r="9" />
        <circle class="rt-start" :cx="rt.start.x" :cy="rt.start.y" r="6" />
        <circle class="rt-cur" r="6" :cx="cur ? cur.x : 0" :cy="cur ? cur.y : 0" :visibility="cur ? 'visible' : 'hidden'" />
      </svg>
    </div>
    <div class="route-legend small" id="gpx-d-route-legend">
      <span v-if="rt.col" class="lg">
        <span>{{ rt.col.low }}</span>
        <span class="ramp" aria-hidden="true"><i class="sw-r1"></i><i class="sw-r2"></i><i class="sw-r3"></i><i class="sw-r4"></i></span>
        <span>{{ rt.col.high }}</span>
      </span>
      <span class="lg">
        <span class="key-start" aria-hidden="true"></span>
        <span>Start</span>
      </span>
      <span class="lg">
        <span class="key-finish" aria-hidden="true"></span>
        <span>Finish</span>
      </span>
      <span>{{ stepText }}</span>
    </div>
    <figcaption class="small muted route-cap">No map background here: the line is drawn from the GPS points in the file. <a :href="osm" target="_blank" rel="noopener" id="gpx-d-osm">Open start point in OpenStreetMap</a><span class="sr-only"> (opens in a new tab)</span></figcaption>
  </figure>
</template>
