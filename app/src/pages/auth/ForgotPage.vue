<script setup>
/* Reset your password, and send a new verification email (port of the forgot screen in
   web/js/auth.js and auth-screens.js). Both answers use the same neutral copy. */
import { reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { COPY, norm } from '../../auth/copy.js';
import { focusId, focusOnEnter, useFieldErrors, keepNext } from '../../auth/form.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const busy = reactive({ submit: false, resend: false });
const { errs, setErr } = useFieldErrors(['forgot-identifier']);

onMounted(function () { focusOnEnter(auth, 'auth-forgot-title'); });

function toLogin() {
  auth.setMsg('');
  auth.goLogin().then(function (entered) { if (!entered) router.push({ name: 'login', query: keepNext(route) }); });
}

async function recover(action, key) {
  const identifier = norm(auth.drafts.forgotIdentifier);
  setErr('forgot-identifier', '');
  if (!identifier) { setErr('forgot-identifier', COPY.needIdentifier); focusId('forgot-identifier'); return; }
  busy[key] = true;
  await auth.recover(identifier, action);
  busy[key] = false;
}
function onInput() { if (errs['forgot-identifier']) setErr('forgot-identifier', ''); }
</script>

<template>
  <section class="auth-screen" id="auth-forgot" aria-labelledby="auth-forgot-title">
    <h2 class="h3" id="auth-forgot-title" tabindex="-1">Reset your password</h2>
    <form class="form-stack" id="forgot-form" novalidate @submit.prevent="recover('reset', 'submit')">
      <p class="small muted" id="forgot-help">Enter your username or the email you signed up with. We send a link to set a new password.</p>
      <div class="field">
        <label class="label" for="forgot-identifier">Username or email</label>
        <input class="input" id="forgot-identifier" name="identifier" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" aria-describedby="forgot-help forgot-identifier-err"
          v-model="auth.drafts.forgotIdentifier" :aria-invalid="errs['forgot-identifier'] ? 'true' : null" @input="onInput">
        <p class="error" id="forgot-identifier-err" :hidden="!errs['forgot-identifier']">{{ errs['forgot-identifier'] }}</p>
      </div>
      <button class="btn btn-accent btn-block" id="forgot-submit" type="submit" :disabled="busy.submit" :aria-busy="busy.submit ? 'true' : null">Send reset link</button>
      <button class="btn btn-outline btn-block" id="forgot-resend" type="button" :disabled="busy.resend" :aria-busy="busy.resend ? 'true' : null" @click="recover('resend', 'resend')">Send a new verification email</button>
    </form>
    <div class="auth-links">
      <button class="btn-text" id="forgot-to-login" type="button" @click="toLogin">Back to log in</button>
    </div>
  </section>
</template>
