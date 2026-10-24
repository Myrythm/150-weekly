/*
 * The auth store: Supabase client, session, profile and the life of the sync store. Ported from
 * web/js/auth.js (boot, enterApp, logout, userSwitched, sessionEnded, login, register, recover,
 * the new password form and the window hooks). The pages keep only their field errors, focus
 * and busy buttons; the shared message (#auth-msg) lives here as `msg`.
 *
 *   configure(opts)      create the client from import.meta.env (VITE_SUPABASE_URL,
 *                        VITE_SUPABASE_ANON_KEY); tests pass { client, url, anonKey,
 *                        createSyncStore, createBackend, flushLimitMs }
 *   boot(link)           read the session once, then: an error link keeps the session for
 *                        "Back to log in", a recovery link opens reset mode, a signup link signs
 *                        out locally, a session enters the app. `ready` turns true at the end.
 *   whenReady()          resolves when boot is done (the router guard waits for it)
 *
 * Entering the app: read the profile, create the sync store over the backend (same-user guard on),
 * data.attach, hydrate, then data.load. When the session ends the store and its queue stay in
 * memory: the same user logging in again flushes the queue, a different user resets the store and
 * reloads the page so nothing queued for one user is written with another user's token.
 */
import { defineStore } from 'pinia';
import { ref, shallowRef, reactive, markRaw } from 'vue';
import { createClient } from '@supabase/supabase-js';
import { createStore } from '../sync/store.js';
import { createBackend, httpError } from '../sync/backend.js';
import { useDataStore } from './data.js';
import { COPY, SAVING, norm, validateRegister } from '../auth/copy.js';

const FLUSH_LIMIT_MS = 3000;

function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function redirectTo() { return window.location.origin + '/'; }

/* the request never reached the server (supabase-js reports status 0) */
function isNetworkAuthError(error) {
  return !!error && !error.status && (error.name === 'AuthRetryableFetchError' || /fetch|network/i.test(String(error.message || '')));
}

/* the auth screens follow the theme picked inside the app (stored in this browser) */
function applyStoredTheme() {
  try {
    const v = JSON.parse(localStorage.getItem('w150.theme') || '"auto"');
    if (v === 'light' || v === 'dark') document.documentElement.setAttribute('data-theme', v);
  } catch (e) { /* storage blocked: follow the system */ }
}

function readEnv() {
  try { return import.meta.env || {}; } catch (e) { return {}; }
}

export const useAuthStore = defineStore('auth', function () {
  const data = useDataStore();

  const client = shallowRef(null);
  const user = ref(null);            /* the user whose app is open (null until enterApp succeeds) */
  const profile = ref(null);         /* { username, displayName } */
  const ready = ref(false);
  const sessionEnded = ref(false);
  const syncState = ref('');         /* '' | 'saving' | 'saved' | 'error' */
  const msg = ref({ text: '', tone: '' });
  const notice = ref({ text: '', seq: 0 });   /* text for the live region (onNotice, New password saved.) */
  const recoveryMode = ref(false);
  const loggingOut = ref(false);
  /* typed values that the reference kept in hidden screens while switching between them */
  const drafts = reactive({ loginUsername: '', forgotIdentifier: '', regUsername: '', regDisplay: '', regEmail: '', regAge: '' });

  const deps = { createStore: createStore, createBackend: createBackend, flushLimitMs: FLUSH_LIMIT_MS };
  let api = '';
  let anon = '';
  let sync = null;
  let userId = null;
  let appStarted = false;
  let entering = false;
  let expectSignOut = false;
  let switching = false;
  let bootSession = null;
  let bootPromise = null;
  let takenName = null;
  let focusTarget = false;   /* the first screen after load shows without moving focus */
  let unsubscribe = null;
  let hooked = false;

  /* ===== messages and focus ===== */
  function setMsg(text, tone) { msg.value = { text: text || '', tone: text && tone ? tone : '' }; }
  /* id to focus on the next auth screen: a string, false for none, undefined for its title */
  function setFocus(id) { focusTarget = id; }
  function takeFocus() { const f = focusTarget; focusTarget = undefined; return f; }
  function announce(text) { notice.value = { text: String(text || ''), seq: notice.value.seq + 1 }; }

  /* ===== client ===== */
  function configure(opts) {
    opts = opts || {};
    const env = readEnv();
    if (typeof opts.createSyncStore === 'function') deps.createStore = opts.createSyncStore;
    if (typeof opts.createBackend === 'function') deps.createBackend = opts.createBackend;
    if (typeof opts.flushLimitMs === 'number') deps.flushLimitMs = opts.flushLimitMs;
    api = String(('url' in opts ? opts.url : env.VITE_SUPABASE_URL) || '').replace(/\/+$/, '');
    anon = String(('anonKey' in opts ? opts.anonKey : env.VITE_SUPABASE_ANON_KEY) || '');
    let c = null;
    if ('client' in opts) c = opts.client || null;
    else if (api && anon) {
      try { c = createClient(api, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }); } catch (e) { c = null; }
    }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    client.value = c ? markRaw(c) : null;
    if (c) listen(c);
  }

  function ensureClient() {
    if (client.value) return true;
    setMsg(COPY.notConfigured, 'error');
    return false;
  }

  function listen(c) {
    const r = c.auth.onAuthStateChange(function (event, session) {
      /* no awaited auth calls inside this callback (supabase-js holds a lock): defer the work */
      const otherId = session && session.user ? session.user.id : null;
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && otherId && userId && !entering) {
        if (otherId !== userId) setTimeout(userSwitched, 0);
        /* this user logged in again in another tab: carry on here and send what was held */
        else if (sessionEnded.value) setTimeout(function () { if (sessionEnded.value) enterApp(session); }, 0);
        return;
      }
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode.value = true;
      } else if (event === 'SIGNED_OUT') {
        if (expectSignOut) return;
        setTimeout(onSessionEnded, 0);
      }
    });
    const sub = r && r.data && r.data.subscription;
    unsubscribe = sub && typeof sub.unsubscribe === 'function' ? function () { sub.unsubscribe(); } : null;
  }

  /* ===== Edge Functions ===== */
  async function callFunction(name, body) {
    try {
      const res = await fetch(api + '/functions/v1/' + name, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: anon, authorization: 'Bearer ' + anon },
        body: JSON.stringify(body)
      });
      let out = null;
      try { out = await res.json(); } catch (e) { out = null; }
      return { status: res.status, data: out || {} };
    } catch (e) {
      return { status: 0, data: {} };
    }
  }
  function serverCopy(r, fallback) {
    if (r.status === 0) return COPY.offline;
    if (r.status === 429) return (r.data && r.data.message) || COPY.rate;
    return (r.data && typeof r.data.message === 'string' && r.data.message) || fallback;
  }

  /* ===== app lifecycle ===== */
  async function loadProfile(session) {
    const r = await client.value.from('profiles').select('username, display_name').eq('user_id', session.user.id).maybeSingle();
    if (r.error) throw httpError(r.error, r.status);
    const meta = (session.user && session.user.user_metadata) || {};
    return {
      username: (r.data && r.data.username) || meta.username || '',
      displayName: (r.data && r.data.display_name) || meta.display_name || ''
    };
  }

  async function refreshFromServer() {
    if (!sync || !appStarted || sessionEnded.value) return;
    try {
      const keys = await sync.refresh();
      if (keys && keys.length) data.load();
    } catch (e) { /* offline: the next visibility change tries again */ }
  }

  /* resolves true when the app is open for this session's user */
  async function enterApp(session, text) {
    if (!session || !session.user || entering) return false;
    entering = true;
    try {
      if (sync && userId) {
        if (session.user.id !== userId) {
          /* a different account in the same tab: drop the old queue, start clean for the new user */
          userSwitched();
          return false;
        }
        sessionEnded.value = false;
        setMsg('');
        await sync.flush();
        await refreshFromServer();
        if (text) announce(text);
        return true;
      }
      const p = await loadProfile(session);
      const backend = deps.createBackend(client.value, {
        onAuthLost: onSessionEnded,
        getUserId: function () { return userId; },
        onUserSwitched: userSwitched
      });
      const s = deps.createStore(backend, {
        onStatus: function (state) { syncState.value = state; },
        onRemoteChange: function () { if (appStarted) data.load(); },
        onNotice: announce
      });
      data.attach(s);
      await s.hydrate();
      data.load();
      sync = s;
      userId = session.user.id;
      profile.value = p;
      user.value = session.user;
      sessionEnded.value = false;
      appStarted = true;
      setMsg('');
      if (text) announce(text);
      return true;
    } catch (e) {
      if (!appStarted) sync = null;
      setMsg(COPY.loadFailed, 'error');
      focusTarget = undefined;
      return false;
    } finally {
      entering = false;
    }
  }

  /* another account is now signed in (this tab or another one): drop this user's cache and queue */
  function userSwitched() {
    if (switching) return;
    switching = true;
    if (sync) sync.reset();
    window.location.reload();
  }

  /* a refresh failed or supabase-js signed out on its own; fires once per pending key, so only
     the first call counts. The store keeps its queue for the next login. */
  function onSessionEnded() {
    if (!sync || !appStarted || sessionEnded.value) return;
    sessionEnded.value = true;
    drafts.loginUsername = (profile.value && profile.value.username) || '';
    setMsg(COPY.ended, 'error');
    focusTarget = 'login-password';
  }

  async function logout() {
    loggingOut.value = true;
    try { if (sync) await Promise.race([sync.flush(), wait(deps.flushLimitMs)]); } catch (e) { /* the reset below drops what is left */ }
    expectSignOut = true;
    try { if (client.value) await client.value.auth.signOut({ scope: 'local' }); } catch (e) { /* the local session is removed either way */ }
    if (sync) sync.reset();
    window.location.reload();
  }

  function flush() { return sync ? sync.flush() : Promise.resolve(); }
  function pending() { return !!sync && sync.pending(); }

  function installWindowHooks() {
    if (hooked) return;
    hooked = true;
    window.addEventListener('beforeunload', function (ev) {
      if (sync && sync.pending()) {
        ev.preventDefault();
        ev.returnValue = SAVING;
        return SAVING;
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') refreshFromServer();
    });
  }

  /* ===== boot ===== */
  async function bootImpl(link) {
    link = link || { type: '', errorCode: '' };
    applyStoredTheme();
    if (!client.value) { setMsg(COPY.notConfigured, 'error'); focusTarget = false; return; }
    if (link.type === 'recovery') recoveryMode.value = true;
    let session = null;
    try {
      const r = await client.value.auth.getSession();
      session = (r && r.data && r.data.session) || null;
    } catch (e) { session = null; }

    if (link.errorCode) { bootSession = session; return; }
    if (recoveryMode.value) {
      /* without a session the /reset route shows the expired copy on the forgot screen */
      if (!session) recoveryMode.value = false;
      return;
    }
    if (link.type === 'signup') {
      expectSignOut = true;
      try { if (session) await client.value.auth.signOut({ scope: 'local' }); } catch (e) { /* local session is gone either way */ }
      expectSignOut = false;
      return;
    }
    if (session) await enterApp(session);
  }

  function boot(link) {
    if (bootPromise) return bootPromise;
    bootPromise = bootImpl(link).catch(function () { /* each step handles its own errors */ }).then(function () { ready.value = true; });
    return bootPromise;
  }
  function whenReady() { return bootPromise || Promise.resolve(); }

  /* Back to log in: after an expired link the session found at boot (if any) opens the app */
  async function goLogin() {
    if (bootSession && !sync) return enterApp(bootSession);
    return false;
  }

  /* ===== login ===== */
  async function login(username, password) {
    if (!ensureClient()) return { ok: false };
    const r = await callFunction('auth-login', { username: norm(username), password: password });
    if (r.status === 200 && r.data.session && r.data.session.access_token) {
      let set;
      try { set = await client.value.auth.setSession({ access_token: r.data.session.access_token, refresh_token: r.data.session.refresh_token }); } catch (e) { set = { error: e }; }
      if (set.error || !set.data || !set.data.session) { setMsg(COPY.failed, 'error'); return { ok: false }; }
      const entered = await enterApp(set.data.session);
      return { ok: true, entered: entered };
    }
    if (r.status === 403) { setMsg(serverCopy(r, COPY.unverified), 'error'); return { ok: false, unverified: true }; }
    if (r.status === 401) { setMsg(serverCopy(r, COPY.wrong), 'error'); return { ok: false, wrong: true }; }
    setMsg(serverCopy(r, r.status === 400 ? COPY.wrong : COPY.failed), 'error');
    return { ok: false };
  }

  /* ===== forgot password, resend verification ===== */
  async function recover(identifier, action) {
    if (!ensureClient()) return false;
    const r = await callFunction('auth-recover', { identifier: norm(identifier), action: action, redirectTo: redirectTo() });
    setMsg(serverCopy(r, r.status === 200 ? COPY.recovery : COPY.failed), r.status === 200 ? 'ok' : 'error');
    return r.status === 200;
  }

  /* ===== register ===== */
  /* 'taken', 'free', or null when the server could not answer */
  async function usernameStatus(u) {
    if (!client.value) return null;
    try {
      const r = await client.value.rpc('username_available', { p_username: u });
      if (r.error) return null;
      return r.data === false ? 'taken' : 'free';
    } catch (e) { return null; }
  }
  /* true only when the server says the username is taken; any error or doubt gives false */
  async function usernameTaken(u) { return (await usernameStatus(u)) === 'taken'; }
  function markTaken(u) { takenName = u; }
  function clearTaken() { takenName = null; }
  function checkRegister(fields) { return validateRegister(fields, takenName); }

  /* fields: { username, displayName, email, age, password, password2 } as typed.
     -> { ok: true } or { ok: false, errors: { [fieldId]: text }, first } (the message, if any, is in msg) */
  async function register(fields) {
    const check = validateRegister(fields, takenName);
    if (check.first) return { ok: false, errors: check.errors, first: check.first };
    if (!ensureClient()) return { ok: false, errors: {}, first: null };
    const v = check.values;
    function fieldErr(id, text) { const e = {}; e[id] = text; return { ok: false, errors: e, first: id }; }
    let r;
    try {
      r = await client.value.auth.signUp({
        email: v.email,
        password: v.password,
        options: { data: { username: v.username, display_name: v.displayName, age: String(v.age) }, emailRedirectTo: redirectTo() }
      });
    } catch (e) { r = { error: e }; }
    const err = r && r.error;
    if (err) {
      const code = String(err.code || '');
      const status = typeof err.status === 'number' ? err.status : 0;
      if (status === 429 || /rate_limit/.test(code)) { setMsg(COPY.rate, 'error'); return { ok: false, errors: {}, first: null }; }
      if (code === 'weak_password') return fieldErr('reg-password', COPY.passwordWeak);
      if (code === 'email_address_invalid' || (code === 'validation_failed' && /email/i.test(String(err.message)))) return fieldErr('reg-email', COPY.emailFormat);
      if (isNetworkAuthError(err)) { setMsg(COPY.offline, 'error'); return { ok: false, errors: {}, first: null }; }
      /* supabase-js 2.118 reports this 500 as AuthRetryableFetchError, so match on status and code.
         A 500 is the sign-up trigger refusing a username taken after the availability check, or
         any other server failure (for example the confirmation email could not be sent): ask the
         server which one before blaming the username */
      if ((status === 500 || code === 'unexpected_failure' || /database/i.test(String(err.message)))
          && await usernameTaken(v.username)) {
        takenName = v.username;
        return fieldErr('reg-username', COPY.taken);
      }
      setMsg(COPY.failed, 'error');
      return { ok: false, errors: {}, first: null };
    }
    drafts.loginUsername = v.username;
    return { ok: true };
  }

  /* ===== set a new password (recovery link) =====
     -> { ok, entered } on success, { field, error } for a field, { expired: true }, or {} (msg set) */
  async function resetPassword(password) {
    if (!ensureClient()) return {};
    let r;
    try { r = await client.value.auth.updateUser({ password: password }); } catch (e) { r = { error: e }; }
    if (r.error) {
      const code = String(r.error.code || '');
      if (code === 'same_password') return { field: 'reset-password', error: COPY.passwordSame };
      if (code === 'weak_password') return { field: 'reset-password', error: COPY.passwordWeak };
      if (isNetworkAuthError(r.error)) { setMsg(COPY.offline, 'error'); return {}; }
      if (r.error.name === 'AuthSessionMissingError' || r.error.status === 401 || r.error.status === 403) {
        setMsg(COPY.expired, 'error');
        return { expired: true };
      }
      setMsg(COPY.failed, 'error');
      return {};
    }
    try { await client.value.auth.signOut({ scope: 'others' }); } catch (e) { /* other devices sign out when their token expires */ }
    recoveryMode.value = false;
    let s = null;
    try { s = await client.value.auth.getSession(); } catch (e) { s = null; }
    if (s && s.data && s.data.session) {
      const entered = await enterApp(s.data.session, COPY.passwordSaved);
      return { ok: true, entered: entered };
    }
    setMsg(COPY.passwordSaved, 'ok');
    return { ok: true, entered: false };
  }

  return {
    client, user, profile, ready, sessionEnded, syncState, msg, notice, recoveryMode, loggingOut, drafts,
    configure, boot, whenReady, setMsg, setFocus, takeFocus, announce,
    login, register, checkRegister, usernameStatus, usernameTaken, markTaken, clearTaken,
    recover, resetPassword, goLogin, logout, onSessionEnded, flush, pending, installWindowHooks
  };
});
