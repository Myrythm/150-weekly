/*
 * Smoke tests for the web version against the local Supabase stack (Docker).
 * Run: npm run test:smoke   (needs `npx supabase start` and the Edge Functions served)
 *
 * Covers the username login and recovery Edge Functions (auth-login, auth-recover),
 * the rate limits they keep in public.auth_attempts, and RLS between two accounts.
 * Keys come from `npx supabase status -o env` and are never printed.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const MAILPIT = 'http://127.0.0.1:54324';
const ORIGIN = 'http://127.0.0.1:8160';
const LOGIN_FAIL = 'Wrong username or password.';
const RECOVER_OK = 'If that account exists, we sent an email.';
const RATE_LIMITED = 'Too many attempts. Try again in a few minutes.';

function parseEnv(text) {
  const out = {};
  String(text).split(/\r?\n/).forEach(function (line) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) return;
    let v = m[2];
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
    out[m[1]] = v;
  });
  return out;
}

const env = parseEnv(execSync('npx supabase status -o env', {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
}));
const API_URL = env.API_URL;
const ANON_KEY = env.ANON_KEY;
const SERVICE_ROLE_KEY = env.SERVICE_ROLE_KEY;
if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error('smoke: API_URL, ANON_KEY or SERVICE_ROLE_KEY missing from `npx supabase status -o env`');
}

// Every auth-login and auth-recover response body seen by the tests, for the email leak check.
const seenBodies = [];
const createdEmails = [];

function suffix() { return crypto.randomBytes(4).toString('hex'); }

function serviceHeaders(extra) {
  return Object.assign({ apikey: SERVICE_ROLE_KEY, authorization: 'Bearer ' + SERVICE_ROLE_KEY }, extra || {});
}

async function createUser({ username, email, password, confirmed }) {
  const res = await fetch(API_URL + '/auth/v1/admin/users', {
    method: 'POST',
    headers: serviceHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      email, password, email_confirm: confirmed,
      user_metadata: { username, display_name: 'Smoke ' + username, age: '30' }
    })
  });
  const body = await res.json();
  assert.equal(res.status, 200, 'createUser failed: ' + JSON.stringify(body && body.msg));
  createdEmails.push(email.toLowerCase());
  return { id: body.id, username, email, password };
}

async function newUser(prefix, confirmed) {
  const username = (prefix + '_' + suffix()).slice(0, 20);
  return createUser({
    username, email: username + '@example.com', password: 'pw-' + suffix() + '-ok', confirmed
  });
}

async function callFn(name, payload, headers) {
  const res = await fetch(API_URL + '/functions/v1/' + name, {
    method: 'POST',
    headers: Object.assign({
      'content-type': 'application/json', apikey: ANON_KEY,
      authorization: 'Bearer ' + ANON_KEY, origin: ORIGIN
    }, headers || {}),
    body: typeof payload === 'string' ? payload : JSON.stringify(payload)
  });
  const text = await res.text();
  seenBodies.push(text);
  let body = null;
  try { body = JSON.parse(text); } catch (e) { body = null; }
  return { status: res.status, body, text, headers: res.headers };
}

function login(username, password) { return callFn('auth-login', { username, password }); }
function recover(identifier, action, redirectTo) {
  return callFn('auth-recover', { identifier, action, redirectTo: redirectTo || ORIGIN + '/' });
}

function userHeaders(token, extra) {
  return Object.assign({ apikey: ANON_KEY, authorization: 'Bearer ' + token }, extra || {});
}

async function mailCount(email) {
  const res = await fetch(MAILPIT + '/api/v1/search?query=' + encodeURIComponent('to:' + email));
  const body = await res.json();
  return body.messages_count || (body.messages ? body.messages.length : 0);
}

async function waitForMail(email, timeoutMs) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const n = await mailCount(email);
    if (n >= 1 || Date.now() > end) return n;
    await new Promise(function (r) { setTimeout(r, 250); });
  }
}

test.beforeEach(async function () {
  // Clear the attempts log before every test, so no test (or rerun within 15 minutes)
  // inherits rows that push it toward the IP buckets.
  const res = await fetch(API_URL + '/rest/v1/auth_attempts?id=gt.0', {
    method: 'DELETE', headers: serviceHeaders()
  });
  assert.ok(res.status === 204 || res.status === 200, 'clearing auth_attempts failed: ' + res.status);
});

test('login returns a session', async function () {
  const u = await newUser('login', true);
  const r = await login(u.username, u.password);
  assert.equal(r.status, 200, r.text);
  assert.equal(typeof r.body.session.access_token, 'string');
  assert.equal(typeof r.body.session.refresh_token, 'string');
  assert.equal(r.body.session.user.id, u.id);
  const res = await fetch(API_URL + '/rest/v1/user_data?select=key', {
    headers: userHeaders(r.body.session.access_token)
  });
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.deepEqual(rows.map(function (x) { return x.key; }), ['w150.prefs']);
});

test('login normalises username', async function () {
  const s = suffix();
  const u = await createUser({
    username: 'budi_x' + s, email: 'budi_x' + s + '@example.com', password: 'budi-pass-' + s, confirmed: true
  });
  const r = await login('  Budi_X' + s.toUpperCase() + ' ', u.password);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.session.user.id, u.id);
});

test('wrong password and unknown user give the same answer', async function () {
  const u = await newUser('wrongpw', true);
  const a = await login(u.username, 'not-the-password');
  const b = await login('nobody_' + suffix(), 'not-the-password');
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.deepEqual(a.body, { error: 'invalid_credentials', message: LOGIN_FAIL });
  assert.deepEqual(b.body, a.body);
});

test('unverified user with correct password gets email_not_confirmed', async function () {
  const u = await newUser('unver', false);
  const r = await login(u.username, u.password);
  assert.equal(r.status, 403, r.text);
  assert.deepEqual(r.body, { error: 'email_not_confirmed', message: 'Email not verified yet.' });
});

test('unverified user with wrong password gets invalid_credentials', async function () {
  const u = await newUser('unver2', false);
  const r = await login(u.username, 'not-the-password');
  assert.equal(r.status, 401, r.text);
  assert.deepEqual(r.body, { error: 'invalid_credentials', message: LOGIN_FAIL });
});

test('login rejects malformed requests', async function () {
  const a = await callFn('auth-login', '{not json');
  assert.equal(a.status, 400);
  assert.deepEqual(a.body, { error: 'bad_request' });
  const b = await callFn('auth-login', { username: 'someone' });
  assert.equal(b.status, 400);
});

test('rate limit', async function () {
  const u = await newUser('rate', true);
  for (let i = 1; i <= 10; i++) {
    const r = await login(u.username, 'wrong-' + i);
    assert.equal(r.status, 401, 'attempt ' + i + ': ' + r.text);
  }
  const r = await login(u.username, 'wrong-11');
  assert.equal(r.status, 429, r.text);
  assert.deepEqual(r.body, { error: 'rate_limited', message: RATE_LIMITED });
});

test('rate limit holds under concurrent guesses', async function () {
  const u = await newUser('burst', true);
  const results = await Promise.all(Array.from({ length: 15 }, function (_, i) {
    return login(u.username, 'wrong-burst-' + i);
  }));
  const statuses = results.map(function (r) { return r.status; });
  const fails = statuses.filter(function (s) { return s === 401; }).length;
  const limited = statuses.filter(function (s) { return s === 429; }).length;
  assert.equal(fails + limited, 15, 'unexpected statuses: ' + statuses.join(','));
  assert.ok(fails <= 10, fails + ' wrong passwords were checked, max is 10');
  assert.ok(limited >= 5, 'statuses: ' + statuses.join(','));
});

test('correct passwords do not use up the limit', async function () {
  const ok = await newUser('okrep', true);
  const unver = await newUser('unrep', false);
  for (let i = 1; i <= 11; i++) {
    const a = await login(ok.username, ok.password);
    assert.equal(a.status, 200, 'login ' + i + ': ' + a.text);
    const b = await login(unver.username, unver.password);
    assert.equal(b.status, 403, 'unverified login ' + i + ': ' + b.text);
  }
  const wrong = await login(ok.username, 'wrong-after');
  assert.equal(wrong.status, 401, wrong.text);
});

test('recover is neutral', async function () {
  const confirmed = await newUser('rec', true);
  const other = await newUser('rec2', false);

  const reset = await recover(confirmed.username, 'reset');
  assert.equal(reset.status, 200, reset.text);
  assert.deepEqual(reset.body, { message: RECOVER_OK });
  assert.ok(await waitForMail(confirmed.email, 10000) >= 1, 'no reset email in Mailpit for ' + confirmed.username);

  const calls = [
    [confirmed.username, 'resend'],
    [other.email.toUpperCase(), 'resend'],
    [other.email, 'reset'],
    ['nobody_' + suffix(), 'resend'],
    ['nobody_' + suffix(), 'reset']
  ];
  for (const c of calls) {
    const r = await recover(c[0], c[1]);
    assert.equal(r.status, 200, c[1] + ' ' + r.text);
    assert.deepEqual(r.body, { message: RECOVER_OK });
  }
});

test('recover rejects foreign redirect and bad action', async function () {
  const a = await recover('someone', 'reset', 'https://evil.example/');
  assert.equal(a.status, 400, a.text);
  const b = await recover('someone', 'delete');
  assert.equal(b.status, 400, b.text);
});

// The local Kong gateway answers OPTIONS itself and rewrites Access-Control-Allow-Origin to "*",
// so the function's own origin echo is only observable in the cloud. Locally this checks that
// the browser is allowed through and that the function's CORS headers are on its responses.
test('CORS headers for the allowed origin', async function () {
  const pre = await fetch(API_URL + '/functions/v1/auth-login', {
    method: 'OPTIONS',
    headers: {
      origin: ORIGIN, 'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization, apikey, content-type, x-client-info'
    }
  });
  assert.ok(pre.status === 200 || pre.status === 204, 'preflight status ' + pre.status);
  assert.ok([ORIGIN, '*'].indexOf(pre.headers.get('access-control-allow-origin')) !== -1);
  for (const name of ['auth-login', 'auth-recover']) {
    const r = await callFn(name, '{not json');
    assert.equal(r.status, 400);
    assert.ok([ORIGIN, '*'].indexOf(r.headers.get('access-control-allow-origin')) !== -1);
    assert.equal(r.headers.get('access-control-allow-headers'), 'authorization, apikey, content-type, x-client-info');
    assert.match(r.headers.get('vary') || '', /Origin/);
  }
});

test('RLS across users', async function () {
  const a = await newUser('rlsa', true);
  const b = await newUser('rlsb', true);
  const la = await login(a.username, a.password);
  const lb = await login(b.username, b.password);
  assert.equal(la.status, 200, la.text);
  assert.equal(lb.status, 200, lb.text);
  const tokenB = lb.body.session.access_token;

  const read = await fetch(API_URL + '/rest/v1/user_data?user_id=eq.' + a.id, { headers: userHeaders(tokenB) });
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), []);

  const patch = await fetch(API_URL + '/rest/v1/user_data?user_id=eq.' + a.id + '&key=eq.w150.prefs', {
    method: 'PATCH',
    headers: userHeaders(tokenB, { 'content-type': 'application/json', prefer: 'return=representation' }),
    body: JSON.stringify({ value: { age: 99 } })
  });
  assert.ok(patch.status === 200 || patch.status === 204, 'patch status ' + patch.status);
  if (patch.status === 200) assert.deepEqual(await patch.json(), []);

  const check = await fetch(API_URL + '/rest/v1/user_data?select=value&key=eq.w150.prefs&user_id=eq.' + a.id, {
    headers: serviceHeaders()
  });
  assert.deepEqual(await check.json(), [{ value: { age: 30 } }]);
});

test('no email leak', async function () {
  const u = await newUser('leak', true);
  const v = await newUser('leak2', false);
  await login(u.username, u.password);
  await login(u.username, 'wrong-password');
  await login(v.username, v.password);
  await recover(u.username, 'resend');
  await recover(v.username, 'reset');
  assert.ok(seenBodies.length > 10);
  for (const body of seenBodies) {
    const lower = body.toLowerCase();
    for (const email of createdEmails) {
      assert.ok(lower.indexOf(email) === -1, 'response body contains an email');
    }
    assert.ok(lower.indexOf('@example.com') === -1, 'response body contains an email');
  }
});
