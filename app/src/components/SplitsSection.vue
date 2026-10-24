<script setup>
/* This week's splits (web/index.html #splits; renderSplits, renderEarlier, removeSession and
   undoRemove on the week page). The `import` slot is where the GPX import controls go: the drop bar
   (#gpx-bar), its messages and the review form. */
import { computed, nextTick, ref, watch } from 'vue';
import { useDataStore } from '../stores/data.js';
import { actLabel, isStrength, isLight, TYPE_LABEL } from '../core/rules.js';
import { ymd, addDays, fmtDay } from '../core/dates.js';
import { getTrack } from '../core/gpxEffort.js';
import { GPX } from '../core/gpx.js';
import SplitRow from './SplitRow.vue';
import UndoBar from './UndoBar.vue';

const data = useDataStore();
const undoBar = ref(null);

const c = computed(function () { return data.summary; });

/* oldest day first, then the order they were logged */
const rows = computed(function () {
  return c.value.cur.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt; });
});

const note = computed(function () {
  const hasS = rows.value.some(isStrength), hasL = rows.value.some(isLight);
  if (!hasS && !hasL) return '';
  if (hasS && hasL) return 'Strength work counts toward muscle days, not minutes. Light activity is good for you but is not counted either. The week total is aerobic minutes only.';
  if (hasL) return 'Light activity is good for you but does not count toward your ' + c.value.target + ' minutes. The week total is aerobic minutes only.';
  return 'Strength work counts toward muscle days, not minutes. The week total is aerobic minutes only.';
});

/* imports from other weeks keep their Details link; newest first */
const earlier = computed(function () {
  const a = ymd(c.value.ws), b = ymd(addDays(c.value.ws, 6));
  return data.sessions
    .filter(function (s) { return s.source === 'gpx' && (s.date < a || s.date > b) && getTrack(s, data.tracks, data.prefs.age); })
    .sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : y.createdAt - x.createdAt; })
    .map(function (s) {
      const rec = getTrack(s, data.tracks, data.prefs.age);
      return {
        id: s.id,
        day: fmtDay(s.date),
        what: TYPE_LABEL[s.type] + ', ' + GPX.fmtDistance(rec.metrics.distanceM) + ', ' + s.minutes + ' min' + (rec.name ? ', ' + rec.name : ''),
        label: 'Details for ' + TYPE_LABEL[s.type] + ', ' + fmtDay(s.date)
      };
    });
});

/* Clear all removes the sessions, so a pending Undo has nothing to restore */
watch(function () { return data.clearSeq; }, function () { if (undoBar.value) undoBar.value.hide(); });

function onRemove(id) {
  const result = data.removeSession(id);
  if (!result) return;
  const s = result.session;
  undoBar.value.show('Removed ' + actLabel(s) + ', ' + s.minutes + ' min.', async function () {
    data.restoreSession(result);
    await nextTick();
    const btn = document.getElementById('remove-' + s.id);
    if (btn) btn.focus();
  });
}
</script>

<template>
  <section class="section" id="splits" aria-labelledby="splits-heading">
    <div class="wrap">
      <div class="section-head">
        <p class="label">The log</p>
        <h2 class="h2" id="splits-heading">This week's splits</h2>
      </div>
      <slot name="import" />
      <div class="table-area">
        <table class="splits" id="splits-table" role="table" :hidden="rows.length === 0">
          <caption class="sr-only">Sessions logged this week</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">Day</th>
              <th role="columnheader" scope="col">Activity</th>
              <th role="columnheader" scope="col" class="num">Min</th>
              <th role="columnheader" scope="col">Effort</th>
              <th role="columnheader" scope="col" class="num">Counts as</th>
              <th role="columnheader" scope="col"><span class="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody id="splits-body" role="rowgroup">
            <SplitRow v-for="s in rows" :key="s.id" :session="s" :guide="data.guide" id-prefix="" from="week" @remove="onRemove" />
          </tbody>
          <tfoot role="rowgroup">
            <tr role="row"><th role="rowheader" scope="row" colspan="4" class="label">Week total, aerobic minutes</th><td role="cell" id="splits-total">{{ c.total }}</td><td role="cell"></td></tr>
          </tfoot>
        </table>
        <p class="small muted splits-note" id="splits-note" :hidden="!note">{{ note }}</p>
        <p class="empty" id="splits-empty" :hidden="rows.length !== 0">No sessions yet this week. Log your first one above, even if it was 5 minutes.</p>
        <UndoBar ref="undoBar" id-prefix="" />
      </div>
      <div class="history-link" id="history-link">
        <RouterLink class="btn btn-outline btn-small" to="/log" id="splits-history">See the full log</RouterLink>
        <p class="small muted" id="splits-history-help">Every week you have logged, newest first.</p>
      </div>
      <div class="gpx-earlier" id="gpx-earlier" :hidden="earlier.length === 0">
        <h3 class="label" id="gpx-earlier-heading">Earlier imports</h3>
        <p class="small muted" id="gpx-earlier-help">Imported activities from other weeks. They count toward their own week.</p>
        <ul class="earlier-list" id="gpx-earlier-list" aria-labelledby="gpx-earlier-heading">
          <li v-for="e in earlier" :key="e.id">
            <span class="earlier-day">{{ e.day }}</span>
            <span class="earlier-what">{{ e.what }}</span>
            <RouterLink class="btn-text" :id="'earlier-' + e.id" :to="{ name: 'activity', params: { id: e.id }, query: { from: 'week' } }" :aria-label="e.label">Details</RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
