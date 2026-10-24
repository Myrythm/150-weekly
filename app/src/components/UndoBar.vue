<script setup>
/* The Undo toast (web/js/app.js UNDO, hideUndo). idPrefix '' gives undo-bar, undo-text, undo-btn
   (week page); 'history-' gives history-undo-bar, history-undo-text, history-undo (full log).
   show(text, onUndo) shows the bar, moves focus to Undo and hides it after 6 seconds; a second
   show replaces the first. Undo hides the bar, then calls onUndo. hide() closes it. */
import { ref, computed, nextTick, onBeforeUnmount } from 'vue';

const props = defineProps({ idPrefix: { type: String, default: '' } });

const UNDO_MS = 6000;
const visible = ref(false);
const message = ref('');
const btn = ref(null);
let onUndo = null;
let timer = 0;

const ids = computed(function () {
  return props.idPrefix === 'history-'
    ? { bar: 'history-undo-bar', text: 'history-undo-text', btn: 'history-undo' }
    : { bar: props.idPrefix + 'undo-bar', text: props.idPrefix + 'undo-text', btn: props.idPrefix + 'undo-btn' };
});

function hide() {
  clearTimeout(timer);
  timer = 0;
  visible.value = false;
  onUndo = null;
}

async function show(text, undo) {
  message.value = String(text || '');
  onUndo = typeof undo === 'function' ? undo : null;
  visible.value = true;
  clearTimeout(timer);
  timer = setTimeout(hide, UNDO_MS);
  await nextTick();
  if (btn.value) btn.value.focus();
}

function undo() {
  const fn = onUndo;
  hide();
  if (fn) fn();
}

onBeforeUnmount(function () { clearTimeout(timer); });

defineExpose({ show, hide });
</script>

<template>
  <div class="toast" :id="ids.bar" role="status" :hidden="!visible">
    <span :id="ids.text">{{ message }}</span>
    <button class="btn-text" :id="ids.btn" type="button" ref="btn" @click="undo">Undo</button>
  </div>
</template>
