<script setup>
/* Set a new password after a recovery link (port of the reset screen in web/js/auth.js and
   auth-screens.js). The route only opens in recovery mode (see router.js). */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { COPY } from '../../auth/copy.js';
import { focusId, focusOnEnter, useFieldErrors, keepNext } from '../../auth/form.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const password = ref('');
const password2 = ref('');
const busy = ref(false);
const { errs, setErr, clearErrs } = useFieldErrors(['reset-password', 'reset-password2']);

onMounted(function () { focusOnEnter(auth, 'auth-reset-title'); });

async function onSubmit() {
  const pw = password.value, pw2 = password2.value;
  clearErrs();
  auth.setMsg('');
  if (pw.length < 8) { setErr('reset-password', COPY.passwordShort); focusId('reset-password'); return; }
  if (pw2 !== pw) { setErr('reset-password2', COPY.passwordMatch); focusId('reset-password2'); return; }
  busy.value = true;
  const r = await auth.resetPassword(pw);
  busy.value = false;
  if (r.field) { setErr(r.field, r.error); focusId(r.field); return; }
  if (r.expired) { router.replace({ name: 'forgot', query: keepNext(route) }); return; }
  if (!r.ok) return;
  password.value = '';
  password2.value = '';
  /* with a session the app opens (the router leaves this screen); without one, log in */
  if (!r.entered) router.replace({ name: 'login', query: keepNext(route) });
}
</script>

<template>
  <section class="auth-screen" id="auth-reset" aria-labelledby="auth-reset-title">
    <h2 class="h3" id="auth-reset-title" tabindex="-1">Set a new password</h2>
    <form class="form-stack" id="reset-form" novalidate @submit.prevent="onSubmit">
      <div class="field">
        <label class="label" for="reset-password">New password</label>
        <input class="input" id="reset-password" name="password" type="password" autocomplete="new-password" aria-describedby="reset-password-help reset-password-err"
          v-model="password" :aria-invalid="errs['reset-password'] ? 'true' : null">
        <p class="small muted" id="reset-password-help">At least 8 characters.</p>
        <p class="error" id="reset-password-err" :hidden="!errs['reset-password']">{{ errs['reset-password'] }}</p>
      </div>
      <div class="field">
        <label class="label" for="reset-password2">Verify new password</label>
        <input class="input" id="reset-password2" name="password2" type="password" autocomplete="new-password" aria-describedby="reset-password2-err"
          v-model="password2" :aria-invalid="errs['reset-password2'] ? 'true' : null">
        <p class="error" id="reset-password2-err" :hidden="!errs['reset-password2']">{{ errs['reset-password2'] }}</p>
      </div>
      <button class="btn btn-accent btn-block" id="reset-submit" type="submit" :disabled="busy" :aria-busy="busy ? 'true' : null">Save new password</button>
    </form>
  </section>
</template>
