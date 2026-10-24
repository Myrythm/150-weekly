<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import AuthLayout from './pages/auth/AuthLayout.vue';

const auth = useAuthStore();
const route = useRoute();
/* until boot is done and the first route resolved, the entry card shows "Checking your entry." */
const routed = computed(function () { return auth.ready && route.matched.length > 0; });
/* one AuthLayout stays mounted from loading through every auth screen (its #auth-msg is a live region) */
const authView = computed(function () { return !routed.value || route.meta.guest === true; });
</script>

<template>
  <AuthLayout v-if="authView" :loading="!routed">
    <router-view v-if="routed" />
  </AuthLayout>
  <router-view v-else />
</template>
