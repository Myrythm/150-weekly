<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useDataStore } from './stores/data.js';
import { useUiStore } from './stores/ui.js';
import AuthLayout from './pages/auth/AuthLayout.vue';
import AppHeader from './components/AppHeader.vue';
import AppFooter from './components/AppFooter.vue';
import LiveRegion from './components/LiveRegion.vue';

const auth = useAuthStore();
const data = useDataStore();
useUiStore();   /* creating it applies the stored theme */
const route = useRoute();
/* until boot is done and the first route resolved, the entry card shows "Checking your entry." */
const routed = computed(function () { return auth.ready && route.matched.length > 0; });
/* one AuthLayout stays mounted from loading through every auth screen (its #auth-msg is a live region) */
const authView = computed(function () { return !routed.value || route.meta.guest === true; });

/* day rollover: the week moves at local midnight even when the page stays open */
let timer = null;
function onVisible() { if (document.visibilityState === 'visible') data.tick(); }
onMounted(function () {
  timer = setInterval(data.tick, 60000);
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(function () {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
  <AuthLayout v-if="authView" :loading="!routed">
    <router-view v-if="routed" />
  </AuthLayout>
  <template v-else>
    <a class="skip-link" href="#main">Skip to content</a>
    <AppHeader />
    <LiveRegion />
    <router-view />
    <AppFooter />
  </template>
</template>
