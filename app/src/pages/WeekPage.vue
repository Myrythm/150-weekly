<script setup>
/* The week page (web/index.html with the week half of web/js/app.js). Sections are separate
   components in the reference order: sample banner, hero band (age step and log panel inside it),
   splits. The streak, plan, snacks and evidence sections follow in the next task. The header Log
   links and Change age ask for focus through ui.pendingFocus; the page does it once the hero is
   mounted. The page owns the GPX import queue (useGpxQueue), which also guards the window
   against a file dropped outside the drop zones. */
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useUiStore } from '../stores/ui.js';
import SampleBanner from '../components/SampleBanner.vue';
import HeroBand from '../components/HeroBand.vue';
import SplitsSection from '../components/SplitsSection.vue';
import GpxImport from '../components/GpxImport.vue';
import { useGpxQueue } from '../composables/useGpxQueue.js';

const ui = useUiStore();
/* the page's one GPX import queue: the log panel drop zone and the splits import controls share it */
useGpxQueue();
const hero = ref(null);
const logStatus = ref('');

async function takeFocusRequest() {
  const want = ui.pendingFocus;
  if (!want) return;
  ui.pendingFocus = '';
  await nextTick();
  if (!hero.value) return;
  /* the log panel is hidden while the age step shows, so a request for it goes to the age input */
  if (want === 'age' || ui.ageStepOpen) hero.value.focusAge();
  else hero.value.focusLog();
}
watch(function () { return ui.pendingFocus; }, takeFocusRequest);
onMounted(takeFocusRequest);
onBeforeUnmount(function () { ui.askingAge = false; });

async function onSampleCleared(notice) {
  logStatus.value = notice;
  await nextTick();
  if (hero.value) hero.value.focusHeading();
}
</script>

<template>
  <SampleBanner @cleared="onSampleCleared" />
  <main id="main">
    <HeroBand ref="hero" v-model:log-status="logStatus" />
    <SplitsSection>
      <template #import><GpxImport /></template>
    </SplitsSection>
  </main>
</template>
