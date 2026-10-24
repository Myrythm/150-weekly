<script setup>
/* The site header of every app page (web/index.html, log.html, activity.html): wordmark, section
   links, sync status, the name, the theme button and Log out. The Log links (#nav-log, #header-log)
   are plain links to /#log for now; the age step and focus come with the week page. */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useUiStore } from '../stores/ui.js';
import NavLink from './NavLink.vue';

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();

const syncText = computed(function () {
  const s = auth.syncState;
  return s === 'saving' ? 'Saving' : s === 'error' ? 'Not saved, retrying' : s === 'saved' ? 'Saved' : '';
});
const themeLabel = computed(function () { return 'Theme: ' + ui.theme.charAt(0).toUpperCase() + ui.theme.slice(1); });
const onLog = computed(function () { return route.name === 'log'; });
</script>

<template>
  <header class="site-header">
    <div class="wrap header-inner">
      <NavLink class="wordmark" to="/#week" id="wordmark">Weekly<span>150</span></NavLink>
      <nav class="nav" aria-label="Sections">
        <NavLink to="/#log" id="nav-log">Log</NavLink>
        <NavLink to="/#streak" id="nav-streak">Streak</NavLink>
        <NavLink to="/#plan" id="nav-plan">Plan</NavLink>
        <NavLink to="/#snacks" id="nav-snacks">Snacks</NavLink>
        <NavLink to="/log" id="nav-history" :current="onLog">Full log</NavLink>
        <NavLink to="/#evidence" id="nav-evidence">Evidence</NavLink>
      </nav>
      <div class="header-actions">
        <span class="small sync-status" id="sync-status" role="status" aria-live="polite" :data-state="auth.syncState">{{ syncText }}</span>
        <span class="who" id="who-name">{{ auth.profile ? auth.profile.displayName : '' }}</span>
        <NavLink class="btn btn-accent btn-small only-mobile" id="header-log" to="/#log">Log a session</NavLink>
        <button class="btn btn-outline btn-small" id="theme-toggle" type="button" @click="ui.cycleTheme()">{{ themeLabel }}</button>
        <button class="btn btn-outline btn-small" id="logout" type="button" :disabled="auth.loggingOut" :aria-busy="auth.loggingOut ? 'true' : null" @click="auth.logout()">Log out</button>
      </div>
    </div>
  </header>
</template>
