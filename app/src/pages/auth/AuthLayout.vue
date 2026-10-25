<script setup>
/* The entry card around every auth screen (markup from web/js/auth-screens.js). App.vue keeps one
   instance mounted from the loading state through every auth screen, so #auth-msg, a live
   region, is not recreated between screens. */
import { useAuthStore } from '../../stores/auth.js';

defineProps({ loading: { type: Boolean, default: false } });
const auth = useAuthStore();
</script>

<template>
  <div class="auth" id="auth">
    <header class="site-header auth-header">
      <div class="wrap header-inner">
        <span class="wordmark" id="auth-wordmark">Weekly<span>150</span></span>
      </div>
    </header>
    <main class="band auth-band" id="auth-main">
      <div class="wrap auth-grid">
        <div class="auth-intro">
          <p class="label">Race entry</p>
          <h1 class="h1" id="auth-heading">Bank 150 minutes a week.</h1>
          <p class="lead" id="auth-lead">Log in to pick up your log, plan and imports on any device. Only you can see them.</p>
        </div>
        <div class="panel auth-card">
          <div class="auth-strip label" aria-hidden="true"><span>Entry desk</span><span>Weekly 150</span></div>
          <div class="auth-body">
            <p class="small muted" id="auth-loading" :hidden="!loading">Checking your entry.</p>
            <p class="auth-msg" id="auth-msg" role="status" aria-live="polite" :data-tone="auth.msg.text && auth.msg.tone ? auth.msg.tone : null">{{ auth.msg.text }}</p>
            <slot />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
