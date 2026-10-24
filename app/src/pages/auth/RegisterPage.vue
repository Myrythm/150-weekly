<script setup>
/* Create an account (port of the register screen in web/js/auth.js and auth-screens.js). */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { COPY, USERNAME_RE, REG_FIELDS, norm } from '../../auth/copy.js';
import { focusId, focusOnEnter, useFieldErrors, keepNext } from '../../auth/form.js';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const d = auth.drafts;
const password = ref('');
const password2 = ref('');
const busy = ref(false);
const { errs, setErr } = useFieldErrors(REG_FIELDS);
let availTimer = 0;
let availSeq = 0;

onMounted(function () { focusOnEnter(auth, 'auth-register-title'); });
onBeforeUnmount(function () { clearTimeout(availTimer); });

function toLogin() {
  auth.setMsg('');
  auth.goLogin().then(function (entered) { if (!entered) router.push({ name: 'login', query: keepNext(route) }); });
}

async function checkAvailable() {
  const u = norm(d.regUsername);
  if (!u) return;
  if (!USERNAME_RE.test(u)) { setErr('reg-username', COPY.usernameFormat); return; }
  const seq = ++availSeq;
  const status = await auth.usernameStatus(u);
  if (seq !== availSeq || norm(d.regUsername) !== u) return;
  if (status === null) return;   /* the sign-up trigger checks again */
  if (status === 'taken') { auth.markTaken(u); setErr('reg-username', COPY.taken); }
  else if (errs['reg-username'] === COPY.taken || errs['reg-username'] === COPY.usernameFormat) setErr('reg-username', '');
}
function onUsernameBlur() {
  clearTimeout(availTimer);
  availTimer = setTimeout(checkAvailable, 300);
}
function onUsernameInput() {
  auth.clearTaken();
  availSeq++;
  if (errs['reg-username']) setErr('reg-username', '');
}
function onInput(id) { if (errs[id]) setErr(id, ''); }
function onAgeInput(ev) { d.regAge = ev.target.value; onInput('reg-age'); }

function fields() {
  return { username: d.regUsername, displayName: d.regDisplay, email: d.regEmail, age: d.regAge, password: password.value, password2: password2.value };
}

async function onSubmit() {
  clearTimeout(availTimer);
  auth.setMsg('');
  const check = auth.checkRegister(fields());
  REG_FIELDS.forEach(function (id) { setErr(id, check.errors[id] || ''); });
  if (check.first) { focusId(check.first); return; }
  busy.value = true;
  const r = await auth.register(fields());
  busy.value = false;
  if (r.ok) {
    password.value = '';
    password2.value = '';
    router.push({ name: 'check-email', query: keepNext(route) });
    return;
  }
  Object.keys(r.errors || {}).forEach(function (id) { setErr(id, r.errors[id]); });
  if (r.first) focusId(r.first);
}
</script>

<template>
  <section class="auth-screen" id="auth-register" aria-labelledby="auth-register-title">
    <h2 class="h3" id="auth-register-title" tabindex="-1">Create an account</h2>
    <form class="form-stack" id="register-form" novalidate @submit.prevent="onSubmit">
      <div class="field">
        <label class="label" for="reg-username">Username</label>
        <input class="input" id="reg-username" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" aria-describedby="reg-username-help reg-username-err"
          v-model="d.regUsername" :aria-invalid="errs['reg-username'] ? 'true' : null" @input="onUsernameInput" @blur="onUsernameBlur">
        <p class="small muted" id="reg-username-help">3 to 20 lowercase letters, numbers or underscores. You log in with it, and it cannot be changed later.</p>
        <p class="error" id="reg-username-err" :hidden="!errs['reg-username']">{{ errs['reg-username'] }}</p>
      </div>
      <div class="field">
        <label class="label" for="reg-display">Display name</label>
        <input class="input" id="reg-display" name="display_name" type="text" autocomplete="nickname" maxlength="60" aria-describedby="reg-display-help reg-display-err"
          v-model="d.regDisplay" :aria-invalid="errs['reg-display'] ? 'true' : null" @input="onInput('reg-display')">
        <p class="small muted" id="reg-display-help">Printed on your race bib. Up to 40 characters.</p>
        <p class="error" id="reg-display-err" :hidden="!errs['reg-display']">{{ errs['reg-display'] }}</p>
      </div>
      <div class="field">
        <label class="label" for="reg-email">Email</label>
        <input class="input" id="reg-email" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" aria-describedby="reg-email-help reg-email-err"
          v-model="d.regEmail" :aria-invalid="errs['reg-email'] ? 'true' : null" @input="onInput('reg-email')">
        <p class="small muted" id="reg-email-help">Only used to verify your account and reset your password.</p>
        <p class="error" id="reg-email-err" :hidden="!errs['reg-email']">{{ errs['reg-email'] }}</p>
      </div>
      <div class="field">
        <label class="label" for="reg-age">Age in years</label>
        <input class="input age-input" id="reg-age" name="age" type="number" inputmode="numeric" min="0" max="120" step="1" autocomplete="off" aria-describedby="reg-age-help reg-age-err"
          :value="d.regAge" :aria-invalid="errs['reg-age'] ? 'true' : null" @input="onAgeInput">
        <p class="small muted" id="reg-age-help">Sets which WHO targets you see. You can change it later.</p>
        <p class="error" id="reg-age-err" :hidden="!errs['reg-age']">{{ errs['reg-age'] }}</p>
      </div>
      <div class="field">
        <label class="label" for="reg-password">Password</label>
        <input class="input" id="reg-password" name="password" type="password" autocomplete="new-password" aria-describedby="reg-password-help reg-password-err"
          v-model="password" :aria-invalid="errs['reg-password'] ? 'true' : null" @input="onInput('reg-password')">
        <p class="small muted" id="reg-password-help">At least 8 characters.</p>
        <p class="error" id="reg-password-err" :hidden="!errs['reg-password']">{{ errs['reg-password'] }}</p>
      </div>
      <div class="field">
        <label class="label" for="reg-password2">Verify password</label>
        <input class="input" id="reg-password2" name="password2" type="password" autocomplete="new-password" aria-describedby="reg-password2-err"
          v-model="password2" :aria-invalid="errs['reg-password2'] ? 'true' : null" @input="onInput('reg-password2')">
        <p class="error" id="reg-password2-err" :hidden="!errs['reg-password2']">{{ errs['reg-password2'] }}</p>
      </div>
      <button class="btn btn-accent btn-block" id="reg-submit" type="submit" :disabled="busy" :aria-busy="busy ? 'true' : null">Create account</button>
    </form>
    <div class="auth-links">
      <button class="btn-text" id="to-login" type="button" @click="toLogin">I have an account. Log in</button>
    </div>
  </section>
</template>
