<script setup>
/* #live, the polite status region for announcements (web/index.html). The text comes from the
   ui store; notices raised in the auth store (New password saved., the sync store's notices)
   are forwarded here. `seq` changes on every announce, so the same text is read out again. The
   region only mounts with the app shell, so a notice raised before that (for example while the
   route is still /reset) is announced on mount; the ui store remembers the last seq it handled,
   so a remount never repeats a notice. */
import { watch } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useUiStore } from '../stores/ui.js';

const auth = useAuthStore();
const ui = useUiStore();

watch(function () { return auth.notice.seq; }, function (seq) {
  if (seq <= ui.noticeSeq) return;
  ui.noticeSeq = seq;
  if (auth.notice.text) ui.announce(auth.notice.text);
}, { immediate: true });
</script>

<template>
  <div class="sr-only" id="live" role="status" aria-live="polite">{{ ui.live }}</div>
</template>
