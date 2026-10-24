<script setup>
/* The splits table of the activity page (splitsSheet in web/js/app.js): one row per km
   (per 100 m for swims, per 5 km for rides); renders nothing when the track has no splits. */
import { computed } from 'vue';
import { GPX } from '../core/gpx.js';
import { isNum, km1 } from '../core/gpxEffort.js';
import { fmtMinSec, fmtDistShort } from '../core/format.js';

const props = defineProps({
  m: { type: Object, required: true },
  type: { type: String, required: true }
});

const sheet = computed(function () {
  const m = props.m, type = props.type, sp = m.splits || [];
  if (!sp.length) return null;
  const lt = m.type || type, len = lt === 'swim' ? 100 : lt === 'cycle' ? 5000 : 1000;
  const hasT = sp.some(function (x) { return isNum(x.timeS); }), hasHr = sp.some(function (x) { return isNum(x.avgHr); }), hasEle = sp.some(function (x) { return isNum(x.elevDeltaM); });
  const paceHead = type === 'cycle' ? 'Speed km/h' : type === 'swim' ? 'Pace /100 m' : 'Pace /km';
  const cols = [{ text: 'Split', num: false }];
  if (hasT) { cols.push({ text: 'Time', num: true }); cols.push({ text: paceHead, num: true }); }
  if (hasHr) cols.push({ text: 'Avg HR', num: true });
  if (hasEle) cols.push({ text: 'Elev m', num: true });
  const what = lt === 'swim' ? '100 m' : lt === 'cycle' ? '5 km' : 'km';
  let partial = false;
  const rows = sp.map(function (x, i) {
    if (x.partial) partial = true;
    const cells = [];
    if (hasT) {
      cells.push(isNum(x.timeS) ? GPX.fmtDuration(x.timeS) : '-');
      const pv = type === 'cycle' ? (isNum(x.timeS) && x.timeS > 0 ? km1(x.distanceM / x.timeS * 3.6) : null) : type === 'swim' ? fmtMinSec(x.paceSPer100m) : fmtMinSec(x.paceSPerKm);
      cells.push(pv || '-');
    }
    if (hasHr) cells.push(isNum(x.avgHr) ? String(Math.round(x.avgHr)) : '-');
    if (hasEle) cells.push(isNum(x.elevDeltaM) ? (x.elevDeltaM > 0 ? '+' : '') + Math.round(x.elevDeltaM) : '-');
    return { key: i, partial: !!x.partial, split: x.partial ? 'Last ' + fmtDistShort(x.distanceM) : fmtDistShort(x.index * len), cells: cells };
  });
  return { cols: cols, rows: rows, what: what, partial: partial };
});
</script>

<template>
  <div v-if="sheet">
    <div class="sheet-wrap">
      <table class="sheet" id="gpx-d-splits">
        <caption>Splits per {{ sheet.what }}</caption>
        <thead>
          <tr><th v-for="c in sheet.cols" :key="c.text" scope="col" :class="c.num ? 'num' : null">{{ c.text }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in sheet.rows" :key="r.key" :class="r.partial ? 'is-partial' : null">
            <td>{{ r.split }}<span v-if="r.partial" class="sr-only"> (partial split)</span></td>
            <td v-for="(c, j) in r.cells" :key="j" class="num">{{ c }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="sheet.partial" class="small muted" id="gpx-d-splits-note">The last row is a partial split, shorter than a full {{ sheet.what }}.</p>
  </div>
</template>
