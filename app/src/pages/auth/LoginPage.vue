<script setup>
/* Log in (port of the login screen in web/js/auth.js and auth-screens.js). */
import { ref, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { COPY, norm } from '../../auth/copy.js';
import { focusId, focusOnEnter, useFieldErrors, keepNext } from '../../auth/form.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const password = ref('');
const showResend = ref(false);
const busy = reactive({ submit: false, resend: false });
const { errs, setErr, clearErrs } = useFieldErrors(['login-username', 'login-password']);

onMounted(function () { focusOnEnter(auth, 'auth-login-title'); });

function go(name) { router.push({ name: name, query: keepNext(route) }); }
function toRegister() { auth.setMsg(''); go('register'); }
function toForgot() {
  auth.setMsg('');
  const typed = auth.drafts.loginUsername.trim();
  if (typed && !auth.drafts.forgotIdentifier) auth.drafts.forgotIdentifier = typed;
  go('forgot');
}

async function onSubmit() {
  const username = norm(auth.drafts.loginUsername);
  const pw = password.value;
  clearErrs();
  showResend.value = false;
  if (!username) { setErr('login-username', COPY.needUsername); focusId('login-username'); return; }
  if (!pw) { setErr('login-password', COPY.needPassword); focusId('login-password'); return; }
  busy.submit = true;
  auth.setMsg('');
  const r = await auth.login(username, pw);
  busy.submit = false;
  if (r.ok) {
    password.value = '';
    if (!r.entered) focusId('auth-login-title');
    return;
  }
  if (r.unverified) { showResend.value = true; return; }
  if (r.wrong) { password.value = ''; focusId('login-password'); }
}

async function onResend() {
  const identifier = norm(auth.drafts.loginUsername);
  if (!identifier) { setErr('login-username', COPY.needUsername); focusId('login-username'); return; }
  busy.resend = true;
  await auth.recover(identifier, 'resend');
  busy.resend = false;
}
</script>

<template>
  <section class="auth-screen" id="auth-login" aria-labelledby="auth-login-title">
    <h2 class="h3" id="auth-login-title" tabindex="-1">Log in</h2>
    <form class="form-stack" id="login-form" novalidate @submit.prevent="onSubmit">
      <div class="field">
        <label class="label" for="login-username">Username</label>
        <input class="input" id="login-username" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" aria-describedby="login-username-err"
          v-model="auth.drafts.loginUsername" :aria-invalid="errs['login-username'] ? 'true' : null">
        <p class="error" id="login-username-err" :hidden="!errs['login-username']">{{ errs['login-username'] }}</p>
      </div>
      <div class="field">
        <label class="label" for="login-password">Password</label>
        <input class="input" id="login-password" name="password" type="password" autocomplete="current-password" aria-describedby="login-password-err"
          v-model="password" :aria-invalid="errs['login-password'] ? 'true' : null">
        <p class="error" id="login-password-err" :hidden="!errs['login-password']">{{ errs['login-password'] }}</p>
      </div>
      <button class="btn btn-accent btn-block" id="login-submit" type="submit" :disabled="busy.submit" :aria-busy="busy.submit ? 'true' : null">Log in</button>
      <button class="btn btn-outline btn-block" id="resend-verification" type="button" :hidden="!showResend" :disabled="busy.resend" :aria-busy="busy.resend ? 'true' : null" @click="onResend">Resend verification email</button>
    </form>
    <div class="auth-links">
      <button class="btn-text" id="to-forgot" type="button" @click="toForgot">Forgot password?</button>
      <button class="btn-text" id="to-register" type="button" @click="toRegister">Create an account</button>
    </div>
  </section>
</template>
