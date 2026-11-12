<script setup>
/* The story page: /story/:id?from=week|log. Looks up the session and its activity record like the
   activity page; a run with a stored route gets the live preview (StoryCanvas) and the controls
   (StoryControls), anything else the not available message.

   State flow: the saved settings (data.prefs.story: template, colour, opacity, main number, small
   numbers) and the page state (photo, view, the created file) make one `state` object, rebuilt on
   every change; the preview draws it, and the export draws the same object with the same
   drawStory() on its own offscreen canvas, so the two cannot differ. Every choice from the controls
   goes through data.setStoryPrefs() here; the photo, zoom and position never leave the page and the
   photo is released when it is replaced, removed or the page is left. Changing anything drops the
   created file. The page sets its own document title after the router's afterEach. */
import { ref, shallowRef, reactive, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useDataStore } from '../stores/data.js';
import { TYPE_LABEL } from '../core/rules.js';
import { getTrack } from '../core/gpxEffort.js';
import { storyEligible, buildModel } from '../story/model.js';
import { TEMPLATE_IDS, resolveNumbers, toggleSmall, DEFAULT_STORY_PREFS } from '../story/numbers.js';
import { drawStory, W, H } from '../story/render.js';
import { DURATION, isAnimated } from '../story/timeline.js';
import { loadPhoto, releasePhoto } from '../story/photo.js';
import { exportPng, exportVideo, storyFileName, canShareFile, shareFile, downloadBlob } from '../story/export.js';
import { MAX_NUMBERS as WEEKLAP_MAX_NUMBERS } from '../story/templates/weeklap.js';
import StoryCanvas from '../components/StoryCanvas.vue';
import StoryControls from '../components/StoryControls.vue';

const TEMPLATE_NAMES = { A: 'Race bib', B: 'Clean', C: 'Splits', D: 'Route trace', E: 'Week lap', F: 'Poster' };
/* the text alternative: name and the way the number is read out */
const SPOKEN = {
  dist: function (v) { return 'distance ' + v.value + (v.unit === 'KM' ? ' km' : ' m'); },
  time: function (v) { return 'time ' + v.value; },
  pace: function (v) { return 'pace ' + v.value + ' per km'; },
  hr: function (v) { return 'average heart rate ' + v.value + ' bpm'; },
  best: function (v) { return 'best km ' + v.value + ' per km'; },
  maxhr: function (v) { return 'max heart rate ' + v.value + ' bpm'; },
  climb: function (v) { return 'climb ' + v.value.replace(/^\+/, '') + ' m'; },
  cad: function (v) { return 'cadence ' + v.value + ' steps per minute'; }
};
const MSG_NO_VIDEO = 'This browser cannot make a video that Instagram accepts. Here is the picture instead.';
const MSG_IOS = 'Saved to Files, in Downloads.';

const route = useRoute();
const data = useDataStore();

const id = computed(function () { return String(route.params.id || ''); });
const backQuery = computed(function () { return route.query.from ? { from: route.query.from } : {}; });

const session = computed(function () { return data.sessions.find(function (x) { return x.id === id.value; }) || null; });
const rec = computed(function () { return session.value ? getTrack(session.value, data.tracks, data.prefs.age) : null; });
const eligible = computed(function () { return storyEligible(session.value, rec.value); });
const model = computed(function () { return eligible.value ? buildModel(session.value, rec.value, data.sessions, data.prefs.age) : null; });
const activityTitle = computed(function () { return session.value ? (rec.value && rec.value.name) || TYPE_LABEL[session.value.type] : ''; });

const backTo = computed(function () { return { name: 'activity', params: { id: id.value }, query: backQuery.value }; });
const missingTo = computed(function () { return session.value ? backTo.value : '/log'; });
const missingLinkText = computed(function () { return session.value ? 'Back to the activity' : 'Open the full log'; });

const prefs = computed(function () { return data.prefs.story || DEFAULT_STORY_PREFS; });
const templates = computed(function () {
  const m = model.value;
  return TEMPLATE_IDS.map(function (t) {
    const st = m ? m.templates[t] : { ok: false };
    return { id: t, name: TEMPLATE_NAMES[t], animated: isAnimated(t), ok: !!st.ok, reason: st.reason || '' };
  });
});
/* a saved template this run cannot use shows A, without changing the saved setting */
const template = computed(function () {
  const m = model.value, t = prefs.value.template;
  return m && m.templates[t] && m.templates[t].ok ? t : 'A';
});
const numbers = computed(function () { return model.value ? resolveNumbers(prefs.value, model.value.values) : { hero: 'dist', small: [] }; });
const opacity = computed(function () { return Number(prefs.value.opacity); });
const animated = computed(function () { return isAnimated(template.value); });

/* ---------- page state: never saved ---------- */
const photo = shallowRef(null);
const view = reactive({ zoom: 1, x: 0, y: 0 });
const photoError = ref(false);
const photoLoading = ref(false);
let alive = true;
/* up on every pick, No photo, a new :id and unmount: a load that finishes under an older number is dropped */
let photoGen = 0;

const state = computed(function () {
  return {
    template: template.value,
    model: model.value,
    numbers: numbers.value,
    color: prefs.value.color,
    opacity: opacity.value,
    photo: photo.value,
    view: { zoom: view.zoom, x: view.x, y: view.y }
  };
});

/* the numbers the template draws: Week lap (E) shows the main number and at most MAX_NUMBERS - 1 small ones */
const shownSmall = computed(function () {
  const small = numbers.value.small;
  return template.value === 'E' ? small.slice(0, WEEKLAP_MAX_NUMBERS - 1) : small;
});

const canvasLabel = computed(function () {
  const m = model.value;
  if (!m) return '';
  const parts = [numbers.value.hero].concat(shownSmall.value).map(function (k) {
    return m.values[k] ? SPOKEN[k](m.values[k]) : '';
  }).filter(Boolean);
  const list = parts.join(', ');
  return 'Story preview, template ' + TEMPLATE_NAMES[template.value] + '. ' + list.charAt(0).toUpperCase() + list.slice(1) + '.' + (photo.value ? ' With your photo.' : '');
});

function resetView() { view.zoom = 1; view.x = 0; view.y = 0; }

function setPhoto(p) {
  const old = photo.value;
  photo.value = p;
  resetView();
  if (old && old !== p) releasePhoto(old);
}

function current(mine) { return alive && mine === photoGen; }

function onPhoto(file) {
  const mine = ++photoGen;
  photoLoading.value = true;
  loadPhoto(file).then(function (p) {
    /* an older pick, another activity, a left page, or an export that started meanwhile: never shown */
    if (!current(mine) || busy.value) {
      releasePhoto(p);
      if (current(mine)) photoLoading.value = false;
      return;
    }
    photoLoading.value = false;
    photoError.value = false;
    setPhoto(p);
  }, function () {
    if (!current(mine)) return;
    photoLoading.value = false;
    photoError.value = true;
  });
}

function stopPhotoLoad() {
  photoGen++;
  photoLoading.value = false;
}

function onNoPhoto() { stopPhotoLoad(); photoError.value = false; setPhoto(null); }
function onZoom(z) { if (photo.value) view.zoom = Math.min(3, Math.max(1, Number(z) || 1)); }
function onMove(v) { if (photo.value && !busy.value) { view.x = v.x; view.y = v.y; } }

/* ---------- saved settings ---------- */
function onTemplate(t) {
  const st = model.value && model.value.templates[t];
  if (st && st.ok) data.setStoryPrefs({ template: t });
}
function onColor(hex) { data.setStoryPrefs({ color: String(hex) }); }
function onColorReset() { data.setStoryPrefs({ color: DEFAULT_STORY_PREFS.color, opacity: DEFAULT_STORY_PREFS.opacity }); }
function onOpacity(v) { data.setStoryPrefs({ opacity: Number(v) }); }
function onHero(k) { if (model.value && model.value.values[k]) data.setStoryPrefs({ hero: k }); }
function onSmall(k) {
  if (!model.value) return;
  const next = toggleSmall(prefs.value, k, model.value.values);
  if (next !== prefs.value) data.setStoryPrefs({ small: next.small });
}
function onRecommended() { data.setStoryPrefs({ hero: 'dist', small: null }); }

/* ---------- export ---------- */
const busy = ref(false);
const file = shallowRef(null);
const canShare = ref(false);
const status = ref('');
let readyText = '';
let gen = 0;

function isIos() {
  const n = typeof navigator !== 'undefined' ? navigator : {};
  return /iPhone|iPad|iPod/.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
}

function pct(p) { return Math.round(p * 100); }

/* thrown by a frame of an export that the page no longer wants, so exportVideo's attempts end early */
function staleExport() { return new Error('The export is no longer wanted.'); }

async function onCreate() {
  /* one export at a time, and never from a photo that is still loading */
  if (busy.value || photoLoading.value || !model.value) return;
  const snap = state.value;
  const mine = ++gen;
  busy.value = true;
  file.value = null;
  canShare.value = false;
  const video = isAnimated(snap.template);
  status.value = video ? 'Creating the video. 0%' : 'Creating the picture.';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const drawFrame = function (t) {
    if (!alive || mine !== gen) throw staleExport();
    drawStory(ctx, snap, t);
  };
  let blob = null, ext = 'png', text = 'Your picture is ready.';
  try {
    if (video) {
      const out = await exportVideo(canvas, drawFrame, function (p) {
        /* in steps of 10 percent, so a screen reader is not flooded */
        if (alive && mine === gen) status.value = 'Creating the video. ' + Math.floor(pct(p) / 10) * 10 + '%';
      });
      if (out && out.blob) {
        blob = out.blob;
        ext = 'mp4';
        text = 'Your video is ready.';
      } else {
        drawFrame(DURATION);
        blob = await exportPng(canvas);
        text = MSG_NO_VIDEO;
      }
    } else {
      drawFrame(DURATION);
      blob = await exportPng(canvas);
    }
  } catch (e) {
    blob = null;
  }
  /* busy ends only here, when this export has really ended, so two never run at once */
  if (!alive) return;
  busy.value = false;
  if (mine !== gen) return;
  /* something drawn changed while the file was made (synced data, say): the file would not match */
  if (state.value !== snap) { discard(); return; }
  if (!blob) {
    status.value = 'The file could not be created. Try again.';
    return;
  }
  const type = ext === 'mp4' ? 'video/mp4' : 'image/png';
  const f = new File([blob], storyFileName(session.value, ext), { type: type });
  canShare.value = canShareFile(f);
  readyText = text;
  file.value = f;
  status.value = text;
}

/* called straight from the click, so the tap still counts for the share sheet */
function onShare() {
  const f = file.value;
  if (!f) return;
  shareFile(f).then(function () {
    if (alive && file.value === f) status.value = readyText;
  }, function (e) {
    if (!alive || file.value !== f) return;
    if (e && e.name === 'AbortError') return;
    status.value = 'Sharing did not work. Use Download instead.';
  });
}

function onDownload() {
  const f = file.value;
  if (!f) return;
  downloadBlob(f, f.name);
  status.value = isIos() ? readyText + ' ' + MSG_IOS : readyText;
}

/* drops the created file; an export still running is left to end by itself (its frames now throw) */
function discard() {
  gen++;
  file.value = null;
  canShare.value = false;
  status.value = '';
  readyText = '';
}

/* any change of what is drawn drops the created file and brings Create back */
watch(state, function () { if (file.value) discard(); });

/* another activity in the same page instance: start clean */
watch(id, function () {
  discard();
  stopPhotoLoad();
  photoError.value = false;
  setPhoto(null);
});

onBeforeUnmount(function () {
  alive = false;
  gen++;
  photoGen++;
  releasePhoto(photo.value);
  photo.value = null;
});

/* after the router's afterEach (which sets the default title) and on every change of name or route */
const docTitle = computed(function () { return model.value ? 'Story, ' + activityTitle.value + ', Weekly 150' : 'Story not available, Weekly 150'; });
watch(function () { return [docTitle.value, route.fullPath]; }, function () {
  if (route.name === 'story') document.title = docTitle.value;
}, { flush: 'post', immediate: true });
</script>

<template>
  <main id="main">
    <section class="section page-top" id="story" aria-label="Run story">
      <div class="wrap">
        <p class="page-back"><RouterLink class="btn-text" :to="missingTo" id="story-back">{{ session ? 'Back to the activity' : 'Back to the full log' }}</RouterLink></p>
        <article v-if="model" class="story-page" id="story-page" aria-labelledby="story-title">
          <div class="story-head">
            <p class="label story-eyebrow">Share your run</p>
            <h1 class="gpx-d-title" id="story-title">Story</h1>
            <p class="gpx-d-meta" id="story-meta">{{ activityTitle }}</p>
          </div>
          <div class="story-grid">
            <StoryCanvas :state="state" :animated="animated" :paused="busy" :locked="busy" :label="canvasLabel" @move="onMove" />
            <StoryControls
              :templates="templates"
              :template="template"
              :values="model.values"
              :numbers="numbers"
              :color="state.color"
              :opacity="opacity"
              :has-photo="!!photo"
              :zoom="view.zoom"
              :photo-error="photoError"
              :busy="busy"
              :photo-loading="photoLoading"
              :animated="animated"
              :status="status"
              :ready="!!file"
              :can-share="canShare"
              @template="onTemplate"
              @photo="onPhoto"
              @zoom="onZoom"
              @nophoto="onNoPhoto"
              @color="onColor"
              @color-reset="onColorReset"
              @opacity="onOpacity"
              @hero="onHero"
              @small="onSmall"
              @recommended="onRecommended"
              @create="onCreate"
              @share="onShare"
              @download="onDownload"
            />
          </div>
        </article>
        <div class="activity-missing" id="story-missing" :hidden="!!model">
          <h1 class="h2" id="story-missing-title">No story for this run</h1>
          <p class="section-intro" id="story-missing-text">This run cannot be made into a story. A story needs a run with a stored route.</p>
          <p><RouterLink class="btn btn-outline btn-small" :to="missingTo" id="story-missing-link">{{ missingLinkText }}</RouterLink></p>
        </div>
      </div>
    </section>
  </main>
</template>
