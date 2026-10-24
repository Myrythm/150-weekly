<script setup>
/* One activity (web/activity.html; renderActivityPage, renderDetail, setCursor and
   redrawDetailGraphics in web/js/app.js): /activity/:id?from=week|log. The header, effort and
   notes here; stats, route, charts and splits in their components. The page keeps the one shared
   cursor distance, so every chart and the route marker follow the same point, and announces the
   readings in #gpx-d-live when the cursor moves by key. It sets its own document title after the
   router's afterEach, and again when the session, its name or the route changes. */
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDataStore } from '../stores/data.js';
import { TYPE_LABEL } from '../core/rules.js';
import { fmtDay } from '../core/dates.js';
import { isNum, getTrack } from '../core/gpxEffort.js';
import { TRACK_CAP } from '../core/sanitize.js';
import { fmtStartTime } from '../core/format.js';
import { chartSpecs, readAt } from '../core/chartMath.js';
import ActivityStats from '../components/ActivityStats.vue';
import RouteMap from '../components/RouteMap.vue';
import LineChart from '../components/LineChart.vue';
import SplitsSheet from '../components/SplitsSheet.vue';

const route = useRoute();
const data = useDataStore();

const id = computed(function () { return String(route.params.id || ''); });
const fromWeek = computed(function () { return route.query.from === 'week'; });
const backTo = computed(function () { return fromWeek.value ? '/#splits' : '/log'; });
const backText = computed(function () { return fromWeek.value ? 'Back to this week' : 'Back to the full log'; });

const session = computed(function () { return data.sessions.find(function (x) { return x.id === id.value; }) || null; });
const rec = computed(function () { return session.value ? getTrack(session.value, data.tracks, data.prefs.age) : null; });
const label = computed(function () { return session.value ? TYPE_LABEL[session.value.type] : ''; });

const titleText = computed(function () { return session.value ? (rec.value && rec.value.name) || label.value : ''; });
const metaText = computed(function () {
  const s = session.value, r = rec.value;
  if (!s) return '';
  return [label.value, r && isNum(r.startTime) ? fmtStartTime(r.startTime) : fmtDay(s.date), s.minutes + ' min logged'].join(' · ');
});
const intensity = computed(function () { return session.value ? session.value.intensity : ''; });
const effortClass = computed(function () { return 'tag ' + (intensity.value === 'vigorous' ? 'tag-vig' : intensity.value === 'light' ? 'tag-neutral' : 'tag-mod'); });
const cl = computed(function () { return rec.value && rec.value.classification; });
const basisText = computed(function () {
  const c = cl.value;
  return c ? c.text + (c.intensity && c.intensity !== intensity.value ? ' You logged it as ' + intensity.value + '.' : '') : '';
});
const hrNote = computed(function () { return !!(cl.value && cl.value.basis === 'hr'); });
const missingText = computed(function () {
  const s = session.value;
  if (!s || rec.value) return '';
  return s.trackId ? 'The route for this session is no longer stored. Your account keeps the details of the ' + TRACK_CAP + ' most recent imports. The session stays in your log.' : 'The route for this session was not stored with the import. The session is in your log.';
});
const deviceNote = computed(function () { return (rec.value && rec.value.deviceNote) || ''; });

const specs = computed(function () { return rec.value ? chartSpecs(rec.value.metrics, session.value.type) : []; });
const distM = computed(function () { const m = rec.value && rec.value.metrics; return (m && m.series && m.series.distM) || []; });
const total = computed(function () { return distM.value.length ? distM.value[distM.value.length - 1] : (rec.value ? rec.value.metrics.distanceM : 0); });

/* the shared crosshair distance; a new activity starts without one */
const cursor = ref(null);
const live = ref('');
watch(id, function () { cursor.value = null; live.value = ''; });

function onCursor(d, fromKey) {
  cursor.value = d;
  if (fromKey) live.value = specs.value.map(function (sp) { return sp.title + ' ' + readAt(sp, distM.value, d).txt; }).join('. ');
}

/* after the router's afterEach (which sets the default title) and on every change of name or route */
const docTitle = computed(function () { return session.value ? titleText.value + ', Weekly 150' : 'Activity not found, Weekly 150'; });
watch(function () { return [docTitle.value, route.fullPath]; }, function () {
  if (route.name === 'activity') document.title = docTitle.value;
}, { flush: 'post', immediate: true });
</script>

<template>
  <main id="main">
    <section class="section page-top" id="activity" aria-label="Activity details">
      <div class="wrap">
        <p class="page-back"><RouterLink class="btn-text" :to="backTo" id="activity-back">{{ backText }}</RouterLink></p>
        <article class="gpx-detail" id="gpx-detail" aria-labelledby="gpx-d-title" :hidden="!session">
          <div class="gpx-d-top">
            <div class="gpx-d-id">
              <p class="label gpx-d-eyebrow"><span>Activity details</span><span class="tag tag-sample" id="gpx-d-sample" :hidden="!(session && session.sample)">Sample</span></p>
              <h1 class="gpx-d-title" id="gpx-d-title">{{ titleText }}</h1>
              <p class="gpx-d-meta" id="gpx-d-meta">{{ metaText }}</p>
            </div>
          </div>
          <p class="gpx-d-effort"><span :class="effortClass" id="gpx-d-effort">{{ intensity }}</span><span id="gpx-d-basis">{{ basisText }}</span></p>
          <p class="small muted" id="gpx-d-hrnote" :hidden="!hrNote">Estimated max heart rate is 220 minus your age (208 minus 0.7 x age under 18). Real maximums vary by about 10 bpm either way.</p>
          <p class="gpx-d-missing" id="gpx-d-missing" :hidden="!missingText">{{ missingText }}</p>
          <div id="gpx-d-body">
            <template v-if="session && rec">
              <ActivityStats :m="rec.metrics" :type="session.type" />
              <div class="gpx-d-grid">
                <RouteMap :track="rec" :type="session.type" :cursor="cursor" />
                <div class="charts" id="gpx-d-charts">
                  <LineChart v-for="sp in specs" :key="sp.id" :spec="sp" :dist-m="distM" :total="total" :cursor="cursor" @cursor="onCursor" />
                  <template v-if="specs.length">
                    <p class="small muted" id="gpx-d-chart-help">Point at a chart, or focus it and use the arrow keys, to read values at any distance.</p>
                    <p class="sr-only" id="gpx-d-live" role="status" aria-live="polite">{{ live }}</p>
                  </template>
                  <template v-else>
                    <p class="small muted">This file has no times, heart rate or elevation to chart.</p>
                    <p class="sr-only" id="gpx-d-live"></p>
                  </template>
                </div>
              </div>
              <SplitsSheet :m="rec.metrics" :type="session.type" />
            </template>
          </div>
          <div class="gpx-d-foot">
            <p class="small gpx-note" id="gpx-d-device" :hidden="!deviceNote">{{ deviceNote }}</p>
            <p class="small muted" id="gpx-d-privacy">Saved to your account. Only you can see it.</p>
          </div>
        </article>
        <div class="activity-missing" id="activity-missing" :hidden="!!session">
          <h1 class="h2" id="activity-missing-title">Activity not found</h1>
          <p class="section-intro" id="activity-missing-text">This activity is not in your log. It may have been removed.</p>
          <p><RouterLink class="btn btn-outline btn-small" to="/log" id="activity-missing-link">Open the full log</RouterLink></p>
        </div>
      </div>
    </section>
  </main>
</template>
