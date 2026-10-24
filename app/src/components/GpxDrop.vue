<script setup>
/* The GPX drop zone in the log panel (web/index.html #gpx-drop). Its button opens the page's one
   file input (in #gpx-bar); files dropped here go to the same queue, credited to #gpx-pick-log. */
import { useGpxQueue, useDropTarget } from '../composables/useGpxQueue.js';

const q = useGpxQueue();
const zone = useDropTarget(q, 'gpx-pick-log');
</script>

<template>
  <div class="gpx-drop drop-target" id="gpx-drop" :class="{ 'is-over': zone.isOver.value }" @dragover="zone.onDragover" @dragleave="zone.onDragleave" @drop="zone.onDrop">
    <p class="label" id="gpx-drop-label">From a watch or app</p>
    <button class="btn btn-outline btn-block" id="gpx-pick-log" type="button" aria-describedby="gpx-drop-help" @click="q.pick('gpx-pick-log')">Import GPX</button>
    <p class="small muted" id="gpx-drop-help">Pick or drop a .gpx file from a run, ride, walk or open-water swim. You check it before it is saved. Only you can see your imports.</p>
  </div>
</template>
