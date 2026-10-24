<script setup>
/* The site header of every app page (web/index.html, log.html, activity.html): wordmark, section
   links, sync status, the name, the theme button and Log out. The Log links (#nav-log, #header-log)
   go to /#log; while the week page shows the age step they focus its input instead (the log panel
   is hidden then), and Log a session otherwise focuses the activity select once the page is there
   (web/js/app.js wireWeek). The focus is requested through the ui store. */
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

/* true when the click was taken over: the age step is showing, so the age input gets the focus */
function takeOverForAge(ev) {
  if (route.name !== 'week' || !ui.ageStepOpen) return false;
  ev.preventDefault();
  ui.requestFocus('age');
  return true;
}
function onHeaderLog(ev) { if (!takeOverForAge(ev)) ui.requestFocus('log'); }
function onNavLog(ev) { takeOverForAge(ev); }
</script>

<template>
  <header class="site-header">
    <div class="wrap header-inner">
      <NavLink class="wordmark" to="/#week" id="wordmark">Weekly<span>150</span></NavLink>
      <nav class="nav" aria-label="Sections">
        <NavLink to="/#log" id="nav-log" @click="onNavLog">Log</NavLink>
        <NavLink to="/#streak" id="nav-streak">Streak</NavLink>
        <NavLink to="/#plan" id="nav-plan">Plan</NavLink>
        <NavLink to="/#snacks" id="nav-snacks">Snacks</NavLink>
        <NavLink to="/log" id="nav-history" :current="onLog">Full log</NavLink>
        <NavLink to="/#evidence" id="nav-evidence">Evidence</NavLink>
      </nav>
      <div class="header-actions">
        <span class="small sync-status" id="sync-status" role="status" aria-live="polite" :data-state="auth.syncState">{{ syncText }}</span>
        <span class="who" id="who-name">{{ auth.profile ? auth.profile.displayName : '' }}</span>
        <NavLink class="btn btn-accent btn-small only-mobile" id="header-log" to="/#log" @click="onHeaderLog">Log a session</NavLink>
        <button class="btn btn-outline btn-small" id="theme-toggle" type="button" @click="ui.cycleTheme()">{{ themeLabel }}</button>
        <button class="btn btn-outline btn-small" id="logout" type="button" :disabled="auth.loggingOut" :aria-busy="auth.loggingOut ? 'true' : null" @click="auth.logout()">Log out</button>
      </div>
    </div>
  </header>
</template>
