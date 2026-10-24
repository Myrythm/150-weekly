<script setup>
/* Check your email, shown after a sign-up (markup from web/js/auth-screens.js). */
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { focusOnEnter, keepNext } from '../../auth/form.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

onMounted(function () { focusOnEnter(auth, 'auth-check-title'); });

function toLogin() {
  auth.setMsg('');
  auth.goLogin().then(function (entered) { if (!entered) router.push({ name: 'login', query: keepNext(route) }); });
}
</script>

<template>
  <section class="auth-screen" id="auth-check-email" aria-labelledby="auth-check-title">
    <h2 class="h3" id="auth-check-title" tabindex="-1">Check your email</h2>
    <p id="auth-check-text">Check your email to verify your account, then log in.</p>
    <p class="small muted" id="auth-check-help">No email after a few minutes? Look in your spam folder, or log in and ask for a new one.</p>
    <button class="btn btn-accent btn-block" id="check-to-login" type="button" @click="toLogin">Go to log in</button>
  </section>
</template>
