<script setup>
/* The full log (web/log.html, renderHistory, showMoreHistory, removeSession and undoRemove on that
   page): every session grouped by week, newest first, 8 weeks at a time, with a period filter. */
import { ref, computed, watch, nextTick } from 'vue';
import { useDataStore } from '../stores/data.js';
import { buildHistory } from '../core/history.js';
import { actLabel } from '../core/rules.js';
import { fmtDay, fmtWeekRange, parseYmd, plural } from '../core/dates.js';
import SplitRow from '../components/SplitRow.vue';
import UndoBar from '../components/UndoBar.vue';

const PAGE_WEEKS = 8;

const data = useDataStore();
const period = ref('all');
const shown = ref(PAGE_WEEKS);
const undoBar = ref(null);
const list = ref(null);

const history = computed(function () { return buildHistory(data.sessions, data.guide, data.today, period.value); });
const target = computed(function () { return data.guide.aerobic; });
const under5 = computed(function () { return data.group === 'under5'; });
const visibleWeeks = computed(function () { return history.value.weeks.slice(0, shown.value); });
const more = computed(function () { return Math.max(0, history.value.weeks.length - shown.value); });

/* a year that no longer has a session falls back to all time, as the reference does */
watch(function () { return history.value.period; }, function (p) { if (p !== period.value) period.value = p; });

const periodModel = computed({
  get: function () { return history.value.period; },
  set: function (v) { period.value = v; shown.value = PAGE_WEEKS; }
});

const countUnit = computed(function () {
  return history.value.period === 'all' ? plural(history.value.count, 'session logged', 'sessions logged') : 'logged in ' + history.value.period;
});
const weeksUnit = computed(function () {
  const n = history.value.weeks.length;
  return 'of ' + n + ' ' + plural(n, 'week', 'weeks') + ' with a session';
});
const intro = computed(function () {
  return 'Every session you have logged, newest week first. ' + (under5.value ? 'Each week shows its aerobic minutes.' : 'Each week shows its aerobic minutes against your ' + target.value + '.');
});
const emptyText = computed(function () {
  return data.sessions.length ? 'Nothing logged in ' + history.value.period + '.' : 'Nothing logged yet. Every session you log shows up here, grouped by week.';
});

function weekRange(key) { return fmtWeekRange(parseYmd(key)); }

function weekSum(w) {
  const base = under5.value ? w.total + ' aerobic min' : w.total + ' of ' + target.value + ' aerobic min';
  return base + (w.muscleDays ? ', ' + w.muscleDays + ' ' + plural(w.muscleDays, 'muscle day', 'muscle days') : '');
}

async function showMore() {
  const first = shown.value;
  shown.value += PAGE_WEEKS;
  await nextTick();
  const heads = list.value ? list.value.querySelectorAll('.history-week-title') : [];
  if (heads[first]) heads[first].focus();
}

async function onRemove(id) {
  const result = data.removeSession(id);
  if (!result) return;
  const s = result.session;
  undoBar.value.show('Removed ' + actLabel(s) + ', ' + s.minutes + ' min, ' + fmtDay(s.date) + '.', async function () {
    data.restoreSession(result);
    await nextTick();
    const btn = document.getElementById('hist-remove-' + s.id);
    if (btn) btn.focus();
  });
}
</script>

<template>
  <main id="main">
    <section class="section page-top" id="history" aria-labelledby="history-heading">
      <div class="wrap">
        <p class="page-back"><RouterLink class="btn-text" to="/#splits" id="history-back">Back to this week</RouterLink></p>
        <div class="section-head">
          <p class="label">The log</p>
          <h1 class="h2" id="history-heading" tabindex="-1">Full log</h1>
        </div>
        <p class="section-intro" id="history-intro">{{ intro }}</p>
        <div class="tiles history-tiles" id="history-tiles">
          <div class="tile"><p class="label">Sessions</p><p class="tile-value" id="history-count">{{ history.count }}</p><p class="tile-unit" id="history-count-unit">{{ countUnit }}</p></div>
          <div class="tile"><p class="label">Aerobic minutes</p><p class="tile-value" id="history-minutes">{{ history.minutes }}</p><p class="tile-unit">counted toward targets</p></div>
          <div class="tile" id="history-hit-tile" :hidden="under5"><p class="label" id="history-hit-label">Weeks at {{ target }}</p><p class="tile-value" id="history-hit">{{ history.hit }}</p><p class="tile-unit" id="history-hit-unit">{{ weeksUnit }}</p></div>
        </div>
        <div class="field history-filter">
          <label class="label" for="history-period">Period</label>
          <select class="select" id="history-period" name="history-period" v-model="periodModel">
            <option value="all">All time</option>
            <option v-for="y in history.years" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>
        <div class="history-list" id="history-list" ref="list">
          <section v-for="w in visibleWeeks" :key="w.key" class="history-week" :aria-labelledby="'history-w-' + w.key">
            <div class="history-week-head">
              <h3 class="history-week-title" :id="'history-w-' + w.key" tabindex="-1">{{ w.title }}</h3>
              <p class="history-week-sum"><span>{{ weekSum(w) }}</span><span v-if="!under5 && w.hit" class="tag tag-mod">Hit {{ target }}</span></p>
            </div>
            <table class="splits" role="table">
              <caption class="sr-only">Sessions, week of {{ weekRange(w.key) }}</caption>
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
              <tbody role="rowgroup">
                <SplitRow v-for="s in w.rows" :key="s.id" :session="s" :guide="data.guide" id-prefix="hist-" from="log" @remove="onRemove" />
              </tbody>
            </table>
          </section>
        </div>
        <p class="empty" id="history-empty" :hidden="history.weeks.length !== 0">{{ emptyText }}</p>
        <button class="btn btn-outline history-more" id="history-more" type="button" :hidden="more <= 0" @click="showMore">Show older weeks ({{ more }} more)</button>
        <UndoBar id-prefix="history-" ref="undoBar" />
      </div>
    </section>
  </main>
</template>
