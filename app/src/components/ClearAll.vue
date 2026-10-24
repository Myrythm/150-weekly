<script setup>
/* The Clear all block of the week page footer (web/index.html .footer-actions; clearAllData and the
   clear-all handlers of wireWeek). It sits in AppFooter's actions slot, so it cannot share state with
   the page: data.clearAll() empties the data and raises data.clearSeq, which the page parts watch to
   reset themselves. The queued deletes are then flushed to the account before "All cleared." shows. */
import { ref, nextTick } from 'vue';
import { useDataStore } from '../stores/data.js';
import { useAuthStore } from '../stores/auth.js';

const data = useDataStore();
const auth = useAuthStore();

const confirming = ref(false);
const busy = ref(false);
const status = ref('');
const openBtn = ref(null);
const noBtn = ref(null);

async function ask() {
  confirming.value = true;
  status.value = '';
  await nextTick();
  if (noBtn.value) noBtn.value.focus();
}
async function keep() {
  confirming.value = false;
  await nextTick();
  if (openBtn.value) openBtn.value.focus();
}
async function confirmClear() {
  if (busy.value) return;
  busy.value = true;
  data.clearAll();
  /* the screen is already cleared; the flush sends the deletes (its failure shows in the sync status) */
  try { await auth.flush(); } catch (e) { /* the sync status shows the failure */ }
  busy.value = false;
  confirming.value = false;
  status.value = 'All cleared.';
  await nextTick();
  if (openBtn.value) openBtn.value.focus();
}
</script>

<template>
  <button class="btn-text" id="clear-all" type="button" ref="openBtn" :hidden="confirming" @click="ask">Clear all my data</button>
  <div class="confirm" id="clear-confirm" role="group" aria-label="Confirm clear all data" :hidden="!confirming">
    <p>Delete all your sessions, plans and imports from your account on every device?</p>
    <div class="row">
      <button class="btn btn-accent btn-small" id="clear-yes" type="button" :disabled="busy" @click="confirmClear">Yes, clear it</button>
      <button class="btn btn-outline btn-small" id="clear-no" type="button" ref="noBtn" :disabled="busy" @click="keep">Keep my data</button>
    </div>
  </div>
  <p class="status" id="clear-status" role="status" aria-live="polite">{{ status }}</p>
</template>
