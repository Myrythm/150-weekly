<script setup>
/* #live, the polite status region for announcements (web/index.html). The text comes from the
   ui store; notices raised in the auth store (New password saved., the sync store's notices)
   are forwarded here. `seq` changes on every announce, so the same text is read out again. */
import { watch } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useUiStore } from '../stores/ui.js';

const auth = useAuthStore();
const ui = useUiStore();

watch(function () { return auth.notice.seq; }, function () {
  if (auth.notice.text) ui.announce(auth.notice.text);
});
</script>

<template>
  <div class="sr-only" id="live" role="status" aria-live="polite">{{ ui.live }}</div>
</template>
