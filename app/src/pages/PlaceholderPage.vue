<script setup>
/* PLACEHOLDER for the app routes (week, log, activity) until their pages exist (Tasks 7 to 9
   replace it route by route). It only shows the route and who is logged in; Log out is in the header. */
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const auth = useAuthStore();
</script>

<template>
  <main class="band" id="main">
    <div class="wrap" id="placeholder-page">
      <p class="label" id="placeholder-route">{{ String(route.name || '') }}</p>
      <p id="placeholder-who">{{ auth.profile ? auth.profile.displayName : '' }}</p>
    </div>
  </main>
</template>
