/*
 * Weekly 150 web: auth screens and app wiring. Loaded last, after supabase-js, config.js,
 * merge.js, store.js and app.js.
 *
 * Flow on load: stash location.hash (supabase-js consumes it), create the client, wait for its
 * session, then route: an error_code in the link opens the reset form with the expired-link
 * copy, a signup link signs out locally and asks for a login, a recovery link opens the
 * new password form, a session starts the app, otherwise the login screen.
 *
 * Starting the app: read the profile, create the store over the backend adapter below,
 * hydrate, unhide #app, call W150App.start once. When the session ends (a refresh failed or
 * supabase-js signed out on its own) the login screen comes back while the store and its queue
 * stay in memory: the same user logging in again flushes the queue, a different user resets the
 * store and reloads the page so nothing queued for one user is written to another.
 *
 * Every text from the server or the user goes through textContent.
 */
(function () {
  'use strict';

  /* supabase-js reads and clears the hash when the client is created, so read it first */
  var INITIAL_HASH = location.hash || '';
  var INITIAL_SEARCH = location.search || '';
  var link = readLink(INITIAL_HASH, INITIAL_SEARCH);

  var COPY = {
    wrong: 'Wrong username or password.',
    unverified: 'Email not verified yet.',
    recovery: 'If that account exists, we sent an email.',
    rate: 'Too many attempts. Try again in a few minutes.',
    expired: 'This link has expired or was already used. Request a new one.',
    verified: 'Email verified. You can log in now.',
    checkEmail: 'Check your email to verify your account, then log in.',
    ended: 'Your session ended. Log in again to keep saving.',
    taken: 'Username taken.',
    offline: 'Could not reach the server. Check your connection and try again.',
    failed: 'Something went wrong. Try again.',
    loadFailed: 'Could not load your log. Check your connection and log in again.',
    usernameFormat: 'Use 3 to 20 lowercase letters, numbers or underscores.',
    displayFormat: 'Enter a display name of 1 to 40 characters.',
    emailFormat: 'Enter a valid email address.',
    ageFormat: 'Enter your age as a whole number from 0 to 120.',
    passwordShort: 'Use at least 8 characters.',
    passwordMatch: 'The passwords do not match.',
    passwordSame: 'Choose a password that differs from your current one.',
    passwordWeak: 'Choose a stronger password.',
    passwordSaved: 'New password saved.',
    needUsername: 'Enter your username.',
    needPassword: 'Enter your password.',
    needIdentifier: 'Enter your username or email.',
    notConfigured: 'This page could not start. Try again later.'
  };
  var USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var FLUSH_LIMIT_MS = 3000;
  var SCREENS = ['login', 'register', 'check-email', 'forgot', 'reset'];

  function $(id) { return document.getElementById(id); }
  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function redirectTo() { return location.origin + '/'; }

  function readLink(hash, search) {
    var h = new URLSearchParams(hash.charAt(0) === '#' ? hash.slice(1) : hash);
    var q = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
    return {
      type: h.get('type') || q.get('type') || '',
      errorCode: h.get('error_code') || q.get('error_code') || h.get('error') || q.get('error') || ''
    };
  }
  function clearLink() {
    var q = new URLSearchParams(INITIAL_SEARCH.slice(1));
    ['error', 'error_code', 'error_description', 'type', 'code'].forEach(function (k) { q.delete(k); });
    var rest = q.toString();
    try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '')); } catch (e) { /* ignore */ }
  }

  /* the auth screens follow the theme picked inside the app (stored in this browser) */
  function applyStoredTheme() {
    try {
      var v = JSON.parse(localStorage.getItem('w150.theme') || '"auto"');
      if (v === 'light' || v === 'dark') document.documentElement.setAttribute('data-theme', v);
    } catch (e) { /* storage blocked: follow the system */ }
  }

  /* ===== messages, field errors, screens ===== */
  function setMsg(text, tone) {
    var el = $('auth-msg');
    el.textContent = text || '';
    if (text && tone) el.setAttribute('data-tone', tone); else el.removeAttribute('data-tone');
  }
  function setErr(inputId, text) {
    var input = $(inputId), err = $(inputId + '-err');
    if (err) { err.textContent = text || ''; err.hidden = !text; }
    if (input) { if (text) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
  }
  function errText(inputId) { var err = $(inputId + '-err'); return err && !err.hidden ? err.textContent : ''; }
  function clearErrs(ids) { ids.forEach(function (id) { setErr(id, ''); }); }

  var currentScreen = '';
  function show(name, opts) {
    opts = opts || {};
    $('auth-loading').hidden = true;
    SCREENS.forEach(function (s) { $('auth-' + s).hidden = s !== name; });
    currentScreen = name;
    if (opts.msg !== undefined) setMsg(opts.msg, opts.tone);
    if (opts.focus === false) return;
    var target = $(opts.focus || (name === 'check-email' ? 'auth-check-title' : 'auth-' + name + '-title'));
    if (target) target.focus();
  }
  function setBusy(btnId, busy) {
    var b = $(btnId);
    if (!b) return;
    b.disabled = !!busy;
    if (busy) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
  }
  function showAuthView() { $('app').hidden = true; $('auth').hidden = false; }
  function showAppView() { $('auth').hidden = true; $('app').hidden = false; }

  /* ===== start-up checks ===== */
  var CFG = window.W150_CONFIG || {};
  if (!window.supabase || typeof window.supabase.createClient !== 'function' || !CFG.supabaseUrl || !CFG.supabaseAnonKey) {
    document.addEventListener('DOMContentLoaded', function () { show('login', { msg: COPY.notConfigured, tone: 'error', focus: false }); });
    if (document.readyState !== 'loading') show('login', { msg: COPY.notConfigured, tone: 'error', focus: false });
    return;
  }
  var API = String(CFG.supabaseUrl).replace(/\/+$/, '');
  var ANON = CFG.supabaseAnonKey;
  var sb = window.supabase.createClient(API, ANON, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  /* ===== Edge Functions (Task 3 contract) ===== */
  async function callFunction(name, body) {
    try {
      var res = await fetch(API + '/functions/v1/' + name, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: ANON, authorization: 'Bearer ' + ANON },
        body: JSON.stringify(body)
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      return { status: res.status, data: data || {} };
    } catch (e) {
      return { status: 0, data: {} };
    }
  }
  function serverCopy(r, fallback) {
    if (r.status === 0) return COPY.offline;
    if (r.status === 429) return (r.data && r.data.message) || COPY.rate;
    return (r.data && typeof r.data.message === 'string' && r.data.message) || fallback;
  }

  /* ===== backend adapter for W150Store ===== */
  function httpError(error, status) {
    var e = new Error((error && error.message) || 'Request failed.');
    e.status = typeof status === 'number' ? status : 0;
    return e;
  }
  /* the request never reached the server (supabase-js reports status 0) */
  function isNetworkAuthError(error) {
    return !!error && !error.status && (error.name === 'AuthRetryableFetchError' || /fetch|network/i.test(String(error.message || '')));
  }
  /* tabs share one stored session: when another tab signs in as someone else, this tab must
     not send its cache or queue with that user's token */
  async function assertSameUser() {
    if (!userId) return;
    var r = await sb.auth.getSession();
    var s = r && r.data && r.data.session;
    if (s && s.user && s.user.id !== userId) {
      userSwitched();
      throw httpError({ message: 'Signed in as another user.' }, 409);
    }
  }
  var backend = {
    fetchAll: async function () {
      await assertSameUser();
      var r = await sb.from('user_data').select('key, value, version');
      if (r.error) throw httpError(r.error, r.status);
      return r.data || [];
    },
    put: async function (key, value, expectedVersion) {
      await assertSameUser();
      var r = await sb.rpc('put_user_data', { p_key: key, p_value: value, p_expected_version: expectedVersion });
      if (r.error) throw httpError(r.error, r.status);
      var row = Array.isArray(r.data) ? r.data[0] : r.data;
      if (!row) throw httpError({ message: 'Empty reply from put_user_data.' }, r.status);
      return { ok: row.ok, version: row.version, value: row.value };
    },
    remove: async function (key) {
      await assertSameUser();
      var r = await sb.from('user_data').delete().eq('key', key);
      if (r.error) throw httpError(r.error, r.status);
    },
    refreshAuth: async function () {
      var r;
      try { r = await sb.auth.refreshSession(); } catch (e) { r = { error: e }; }
      if (!r.error && r.data && r.data.session) return true;
      /* a refresh that failed on the network or a server hiccup (supabase-js marks both
         retryable) is not an ended session: let the store back off and try again */
      if (isNetworkAuthError(r.error) || (r.error && r.error.name === 'AuthRetryableFetchError')) return true;
      sessionEnded();
      return false;
    }
  };

  /* ===== app lifecycle ===== */
  var store = null;
  var userId = null;
  var profile = null;
  var appStarted = false;
  var ended = false;
  var entering = false;
  var expectSignOut = false;
  var bootSession = null;
  var recoveryMode = link.type === 'recovery';

  function announce(text) {
    var el = $('live');
    if (!el) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = text; }, 60);
  }

  async function loadProfile(session) {
    var r = await sb.from('profiles').select('username, display_name').eq('user_id', session.user.id).maybeSingle();
    if (r.error) throw httpError(r.error, r.status);
    var meta = (session.user && session.user.user_metadata) || {};
    return {
      username: (r.data && r.data.username) || meta.username || '',
      displayName: (r.data && r.data.display_name) || meta.display_name || ''
    };
  }

  async function refreshFromServer() {
    if (!store || !appStarted || ended) return;
    try {
      var keys = await store.refresh();
      if (keys && keys.length) window.W150App.reload();
    } catch (e) { /* offline: the next visibility change tries again */ }
  }

  async function enterApp(session, notice) {
    if (!session || !session.user || entering) return;
    entering = true;
    try {
      if (store && userId) {
        if (session.user.id !== userId) {
          /* a different account in the same tab: drop the old queue, start clean for the new user */
          store.reset();
          store = null;
          location.reload();
          return;
        }
        ended = false;
        setMsg('');
        showAppView();
        await store.flush();
        await refreshFromServer();
        if (notice) announce(notice);
        return;
      }
      var p = await loadProfile(session);
      var s = W150Store.create(backend, {
        onStatus: function (state) { window.W150App.setSyncStatus(state); },
        onRemoteChange: function () { if (appStarted) window.W150App.reload(); },
        onNotice: announce
      });
      await s.hydrate();
      store = s;
      userId = session.user.id;
      profile = p;
      ended = false;
      setMsg('');
      showAppView();
      if (!appStarted) {
        appStarted = true;
        window.W150App.start({ store: store, profile: profile, onLogout: logout, onClearAll: function () { return store.flush(); } });
      }
      if (notice) announce(notice);
    } catch (e) {
      if (!appStarted) store = null;
      showAuthView();
      show('login', { msg: COPY.loadFailed, tone: 'error' });
    } finally {
      entering = false;
    }
  }

  /* another account is now signed in (this tab or another one): drop this user's cache and queue */
  var switching = false;
  function userSwitched() {
    if (switching) return;
    switching = true;
    if (store) store.reset();
    location.reload();
  }

  function sessionEnded() {
    if (!store || !appStarted || ended) return;
    ended = true;
    showAuthView();
    clearErrs(['login-username', 'login-password']);
    $('resend-verification').hidden = true;
    $('login-username').value = (profile && profile.username) || '';
    $('login-password').value = '';
    show('login', { msg: COPY.ended, tone: 'error', focus: 'login-password' });
  }

  async function logout() {
    setBusy('logout', true);
    try { if (store) await Promise.race([store.flush(), wait(FLUSH_LIMIT_MS)]); } catch (e) { /* the reset below drops what is left */ }
    expectSignOut = true;
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* the local session is removed either way */ }
    if (store) store.reset();
    location.reload();
  }

  sb.auth.onAuthStateChange(function (event, session) {
    /* no awaited auth calls inside this callback (supabase-js holds a lock): defer the work */
    var otherId = session && session.user ? session.user.id : null;
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && otherId && userId && !entering) {
      if (otherId !== userId) setTimeout(userSwitched, 0);
      /* this user logged in again in another tab: carry on here and send what was held */
      else if (ended) setTimeout(function () { enterApp(session); }, 0);
      return;
    }
    if (event === 'PASSWORD_RECOVERY') {
      recoveryMode = true;
      setTimeout(function () { if (!store && booted) openReset(); }, 0);
    } else if (event === 'SIGNED_OUT') {
      if (expectSignOut) return;
      setTimeout(sessionEnded, 0);
    }
  });

  window.addEventListener('beforeunload', function (ev) {
    if (store && store.pending()) {
      ev.preventDefault();
      ev.returnValue = 'Your last change is still saving.';
      return ev.returnValue;
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshFromServer();
  });

  /* ===== screens: login ===== */
  function goLogin() {
    if (bootSession && !store) { enterApp(bootSession); return; }
    show('login');
  }
  $('to-register').addEventListener('click', function () { setMsg(''); show('register'); });
  $('to-forgot').addEventListener('click', function () {
    setMsg('');
    var typed = $('login-username').value.trim();
    if (typed && !$('forgot-identifier').value) $('forgot-identifier').value = typed;
    show('forgot');
  });
  $('to-login').addEventListener('click', function () { setMsg(''); goLogin(); });
  $('check-to-login').addEventListener('click', function () { setMsg(''); goLogin(); });
  $('forgot-to-login').addEventListener('click', function () { setMsg(''); goLogin(); });

  $('login-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var username = norm($('login-username').value);
    var password = $('login-password').value;
    clearErrs(['login-username', 'login-password']);
    $('resend-verification').hidden = true;
    if (!username) { setErr('login-username', COPY.needUsername); $('login-username').focus(); return; }
    if (!password) { setErr('login-password', COPY.needPassword); $('login-password').focus(); return; }
    setBusy('login-submit', true);
    setMsg('');
    var r = await callFunction('auth-login', { username: username, password: password });
    if (r.status === 200 && r.data.session && r.data.session.access_token) {
      var set = await sb.auth.setSession({ access_token: r.data.session.access_token, refresh_token: r.data.session.refresh_token });
      setBusy('login-submit', false);
      if (set.error || !set.data || !set.data.session) { setMsg(COPY.failed, 'error'); return; }
      $('login-password').value = '';
      await enterApp(set.data.session);
      return;
    }
    setBusy('login-submit', false);
    if (r.status === 403) {
      setMsg(serverCopy(r, COPY.unverified), 'error');
      $('resend-verification').hidden = false;
      return;
    }
    if (r.status === 401) {
      $('login-password').value = '';
      setMsg(serverCopy(r, COPY.wrong), 'error');
      $('login-password').focus();
      return;
    }
    setMsg(serverCopy(r, r.status === 400 ? COPY.wrong : COPY.failed), 'error');
  });

  $('resend-verification').addEventListener('click', async function () {
    var identifier = norm($('login-username').value);
    if (!identifier) { setErr('login-username', COPY.needUsername); $('login-username').focus(); return; }
    setBusy('resend-verification', true);
    var r = await callFunction('auth-recover', { identifier: identifier, action: 'resend', redirectTo: redirectTo() });
    setBusy('resend-verification', false);
    setMsg(serverCopy(r, r.status === 200 ? COPY.recovery : COPY.failed), r.status === 200 ? 'ok' : 'error');
  });

  /* ===== screens: register ===== */
  var REG_FIELDS = ['reg-username', 'reg-display', 'reg-email', 'reg-age', 'reg-password', 'reg-password2'];
  var availTimer = 0;
  var availSeq = 0;
  var takenName = null;

  async function checkAvailable() {
    var raw = $('reg-username').value;
    var u = norm(raw);
    if (!u) return;
    if (!USERNAME_RE.test(u)) { setErr('reg-username', COPY.usernameFormat); return; }
    var seq = ++availSeq;
    try {
      var r = await sb.rpc('username_available', { p_username: u });
      if (seq !== availSeq || norm($('reg-username').value) !== u) return;
      if (r.error) return;
      if (r.data === false) { takenName = u; setErr('reg-username', COPY.taken); }
      else if (errText('reg-username') === COPY.taken || errText('reg-username') === COPY.usernameFormat) setErr('reg-username', '');
    } catch (e) { /* the sign-up trigger checks again */ }
  }
  $('reg-username').addEventListener('blur', function () {
    clearTimeout(availTimer);
    availTimer = setTimeout(checkAvailable, 300);
  });
  $('reg-username').addEventListener('input', function () {
    takenName = null;
    availSeq++;
    if (errText('reg-username')) setErr('reg-username', '');
  });
  REG_FIELDS.slice(1).forEach(function (id) {
    $(id).addEventListener('input', function () { if (errText(id)) setErr(id, ''); });
  });

  function validateRegister() {
    var v = {
      username: norm($('reg-username').value),
      displayName: $('reg-display').value.trim(),
      email: $('reg-email').value.trim(),
      ageRaw: $('reg-age').value.trim(),
      password: $('reg-password').value,
      password2: $('reg-password2').value
    };
    var errs = {};
    if (!USERNAME_RE.test(v.username)) errs['reg-username'] = COPY.usernameFormat;
    else if (takenName === v.username) errs['reg-username'] = COPY.taken;
    if (v.displayName.length < 1 || v.displayName.length > 40) errs['reg-display'] = COPY.displayFormat;
    if (!EMAIL_RE.test(v.email)) errs['reg-email'] = COPY.emailFormat;
    v.age = /^\d{1,3}$/.test(v.ageRaw) ? Number(v.ageRaw) : NaN;
    if (!(v.age >= 0 && v.age <= 120)) errs['reg-age'] = COPY.ageFormat;
    if (v.password.length < 8) errs['reg-password'] = COPY.passwordShort;
    if (v.password2 !== v.password) errs['reg-password2'] = COPY.passwordMatch;
    REG_FIELDS.forEach(function (id) { setErr(id, errs[id] || ''); });
    var first = REG_FIELDS.filter(function (id) { return errs[id]; })[0];
    return { values: v, first: first || null };
  }

  $('register-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    clearTimeout(availTimer);
    setMsg('');
    var check = validateRegister();
    if (check.first) { $(check.first).focus(); return; }
    var v = check.values;
    setBusy('reg-submit', true);
    var r;
    try {
      r = await sb.auth.signUp({
        email: v.email,
        password: v.password,
        options: { data: { username: v.username, display_name: v.displayName, age: String(v.age) }, emailRedirectTo: redirectTo() }
      });
    } catch (e) { r = { error: e }; }
    setBusy('reg-submit', false);
    var err = r && r.error;
    if (err) {
      var code = String(err.code || '');
      var status = typeof err.status === 'number' ? err.status : 0;
      if (status === 429 || /rate_limit/.test(code)) { setMsg(COPY.rate, 'error'); return; }
      if (code === 'weak_password') { setErr('reg-password', COPY.passwordWeak); $('reg-password').focus(); return; }
      if (code === 'email_address_invalid' || code === 'validation_failed' && /email/i.test(String(err.message))) { setErr('reg-email', COPY.emailFormat); $('reg-email').focus(); return; }
      if (isNetworkAuthError(err)) { setMsg(COPY.offline, 'error'); return; }
      /* supabase-js 2.118 reports this 500 as AuthRetryableFetchError, so match on status and code */
      if (status === 500 || code === 'unexpected_failure' || /database/i.test(String(err.message))) {
        /* the sign-up trigger refused it: the username was taken after the availability check */
        takenName = v.username;
        setErr('reg-username', COPY.taken);
        $('reg-username').focus();
        return;
      }
      setMsg(COPY.failed, 'error');
      return;
    }
    $('reg-password').value = '';
    $('reg-password2').value = '';
    $('login-username').value = v.username;
    show('check-email');
  });

  /* ===== screens: forgot password, resend verification ===== */
  function readIdentifier() {
    /* usernames and emails are both compared in lower case */
    return norm($('forgot-identifier').value);
  }
  async function recover(action, btnId) {
    var identifier = readIdentifier();
    setErr('forgot-identifier', '');
    if (!identifier) { setErr('forgot-identifier', COPY.needIdentifier); $('forgot-identifier').focus(); return; }
    setBusy(btnId, true);
    var r = await callFunction('auth-recover', { identifier: identifier, action: action, redirectTo: redirectTo() });
    setBusy(btnId, false);
    setMsg(serverCopy(r, r.status === 200 ? COPY.recovery : COPY.failed), r.status === 200 ? 'ok' : 'error');
  }
  $('forgot-form').addEventListener('submit', function (ev) { ev.preventDefault(); recover('reset', 'forgot-submit'); });
  $('forgot-resend').addEventListener('click', function () { recover('resend', 'forgot-resend'); });
  $('forgot-identifier').addEventListener('input', function () { if (errText('forgot-identifier')) setErr('forgot-identifier', ''); });

  /* ===== screens: set a new password (recovery link) ===== */
  function openReset() {
    showAuthView();
    clearErrs(['reset-password', 'reset-password2']);
    show('reset', { msg: '' });
  }
  $('reset-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var pw = $('reset-password').value, pw2 = $('reset-password2').value;
    clearErrs(['reset-password', 'reset-password2']);
    setMsg('');
    if (pw.length < 8) { setErr('reset-password', COPY.passwordShort); $('reset-password').focus(); return; }
    if (pw2 !== pw) { setErr('reset-password2', COPY.passwordMatch); $('reset-password2').focus(); return; }
    setBusy('reset-submit', true);
    var r;
    try { r = await sb.auth.updateUser({ password: pw }); } catch (e) { r = { error: e }; }
    if (r.error) {
      setBusy('reset-submit', false);
      var code = String(r.error.code || '');
      if (code === 'same_password') { setErr('reset-password', COPY.passwordSame); $('reset-password').focus(); return; }
      if (code === 'weak_password') { setErr('reset-password', COPY.passwordWeak); $('reset-password').focus(); return; }
      if (isNetworkAuthError(r.error)) { setMsg(COPY.offline, 'error'); return; }
      if (r.error.name === 'AuthSessionMissingError' || r.error.status === 401 || r.error.status === 403) {
        show('forgot', { msg: COPY.expired, tone: 'error' });
        return;
      }
      setMsg(COPY.failed, 'error');
      return;
    }
    try { await sb.auth.signOut({ scope: 'others' }); } catch (e) { /* other devices sign out when their token expires */ }
    recoveryMode = false;
    $('reset-password').value = '';
    $('reset-password2').value = '';
    var s = await sb.auth.getSession();
    setBusy('reset-submit', false);
    if (s.data && s.data.session) await enterApp(s.data.session, COPY.passwordSaved);
    else show('login', { msg: COPY.passwordSaved, tone: 'ok' });
  });

  /* ===== boot ===== */
  var booted = false;
  async function boot() {
    applyStoredTheme();
    var session = null;
    try {
      var r = await sb.auth.getSession();
      session = (r && r.data && r.data.session) || null;
    } catch (e) { session = null; }
    clearLink();
    booted = true;

    if (link.errorCode) {
      bootSession = session;
      show('forgot', { msg: COPY.expired, tone: 'error', focus: 'forgot-identifier' });
      return;
    }
    if (recoveryMode) {
      if (session) openReset();
      else show('forgot', { msg: COPY.expired, tone: 'error', focus: 'forgot-identifier' });
      return;
    }
    if (link.type === 'signup') {
      expectSignOut = true;
      try { if (session) await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* local session is gone either way */ }
      expectSignOut = false;
      show('login', { msg: COPY.verified, tone: 'ok', focus: 'login-username' });
      return;
    }
    if (session) { await enterApp(session); return; }
    show('login', { focus: false });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
