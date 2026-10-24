<script setup>
/* The sample week banner (web/index.html #sample-banner, the #sample-clear handler). Shown while the
   sample is active; Clear sample removes the made-up sessions and plan. The parent decides where
   the notice and focus go (`cleared`). */
import { useDataStore } from '../stores/data.js';
import { useUiStore } from '../stores/ui.js';

const NOTICE = 'Sample cleared. Your log starts now.';

const data = useDataStore();
const ui = useUiStore();
const emit = defineEmits(['cleared']);

function clear() {
  data.clearSample();
  ui.announce(NOTICE);
  emit('cleared', NOTICE);
}
</script>

<template>
  <div class="sample-banner hatch" id="sample-banner" :hidden="!data.meta.sampleActive">
    <div class="wrap sample-inner">
      <span class="label">Sample week</span>
      <p>These sessions and the plan below are made up so you can see how the log works. The first thing you add for real clears them.</p>
      <button class="btn btn-outline btn-small" id="sample-clear" type="button" @click="clear">Clear sample and start fresh</button>
    </div>
  </div>
</template>
