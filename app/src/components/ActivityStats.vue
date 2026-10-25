<script setup>
/* The stat grid of the activity page (statItem and buildStats in web/js/app.js). */
import { computed } from 'vue';
import { GPX } from '../core/gpx.js';
import { isNum, km1 } from '../core/gpxEffort.js';
import { fmtMinSec } from '../core/format.js';

const props = defineProps({
  m: { type: Object, required: true },
  type: { type: String, required: true }
});

const items = computed(function () {
  const m = props.m, type = props.type, out = [];
  const add = function (l, v, u, n) { out.push({ label: l, value: v, unit: u || null, note: n || null }); };
  if (isNum(m.distanceM)) { if (m.distanceM < 1000) add('Distance', String(Math.round(m.distanceM)), 'm'); else add('Distance', (m.distanceM / 1000).toFixed(2), 'km'); }
  if (isNum(m.movingS)) add('Moving time', GPX.fmtDuration(m.movingS));
  if (isNum(m.elapsedS)) add('Elapsed time', GPX.fmtDuration(m.elapsedS));
  if (type === 'cycle') { if (isNum(m.avgSpeedKmh)) add('Avg speed', km1(m.avgSpeedKmh), 'km/h'); }
  else if (type === 'swim') { if (fmtMinSec(m.avgPaceSPer100m)) add('Avg pace', fmtMinSec(m.avgPaceSPer100m), '/100 m'); }
  else if (fmtMinSec(m.avgPaceSPerKm)) add('Avg pace', fmtMinSec(m.avgPaceSPerKm), '/km');
  if ((type === 'run' || type === 'walk') && fmtMinSec(m.bestKmPaceS)) add('Best km', fmtMinSec(m.bestKmPaceS), '/km');
  if (isNum(m.maxSpeedKmh)) add('Max speed', km1(m.maxSpeedKmh), 'km/h');
  if (isNum(m.elevGainM)) add('Climb, descent', '+' + Math.round(m.elevGainM) + ' / -' + Math.round(isNum(m.elevLossM) ? m.elevLossM : 0), 'm');
  if (isNum(m.minEle) && isNum(m.maxEle)) add('Elevation', Math.round(m.minEle) + ' to ' + Math.round(m.maxEle), 'm');
  if (isNum(m.avgHr)) add('Avg heart rate', String(Math.round(m.avgHr)), 'bpm');
  if (isNum(m.maxHr)) add('Max heart rate', String(Math.round(m.maxHr)), 'bpm');
  if (isNum(m.avgCad)) {
    const oneFoot = (type === 'run' || type === 'walk') && m.avgCad < 120;
    add('Avg cadence', String(Math.round(m.avgCad)), type === 'cycle' ? 'rpm' : 'spm', oneFoot ? 'Counts one foot. About ' + Math.round(m.avgCad * 2) + ' steps per minute.' : null);
  }
  if (isNum(m.avgPower)) add('Avg power', String(Math.round(m.avgPower)), 'W');
  if (isNum(m.maxPower)) add('Max power', String(Math.round(m.maxPower)), 'W');
  if (isNum(m.avgTemp)) add('Avg temperature', String(Math.round(m.avgTemp)), '°C');
  return out;
});
</script>

<template>
  <dl class="stats" id="gpx-d-stats">
    <div v-for="it in items" :key="it.label" class="stat">
      <dt>{{ it.label }}</dt>
      <dd>{{ it.value }}<span v-if="it.unit" class="u">{{ it.unit }}</span><span v-if="it.note" class="n">{{ it.note }}</span></dd>
    </div>
  </dl>
</template>
