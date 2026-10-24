<script setup>
/* PLACEHOLDER for the app routes (week, log, activity) until their pages exist (Tasks 7 to 9
   replace it route by route). It only shows who is logged in and offers Log out. */
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const auth = useAuthStore();
</script>

<template>
  <main class="band" id="placeholder-page">
    <div class="wrap">
      <p class="label" id="placeholder-route">{{ String(route.name || '') }}</p>
      <p id="placeholder-who">{{ auth.profile ? auth.profile.displayName : '' }}</p>
      <button class="btn btn-outline btn-small" id="placeholder-logout" type="button" :disabled="auth.loggingOut" :aria-busy="auth.loggingOut ? 'true' : null" @click="auth.logout()">Log out</button>
    </div>
  </main>
</template>
