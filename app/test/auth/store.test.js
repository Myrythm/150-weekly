import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../../src/stores/auth.js';
import { useDataStore } from '../../src/stores/data.js';

const API = 'http://api.test';

/* a supabase client double: the access token names the user id */
function fakeClient(startUser) {
  let session = startUser ? { user: { id: startUser }, access_token: 'tok-' + startUser, refresh_token: 'r' } : null;
  const calls = { signOut: [] };
  return {
    calls,
    auth: {
      getSession: async function () { return { data: { session: session } }; },
      setSession: async function (t) {
        session = { user: { id: t.access_token.replace('tok-', '') }, access_token: t.access_token, refresh_token: t.refresh_token };
        return { data: { session: session }, error: null };
      },
      signOut: async function (opts) {
        calls.signOut.push(opts);
        if (!opts || opts.scope !== 'others') session = null;
        return { error: null };
      },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      refreshSession: async function () { return { data: { session: session }, error: null }; },
      updateUser: async function () { return { data: {}, error: null }; },
      signUp: async function () { return { data: {}, error: null }; }
    },
    from: function () {
      const q = {
        select: function () { return q; },
        eq: function () { return q; },
        maybeSingle: async function () { return { data: { username: 'ana', display_name: 'Ana' }, error: null }; }
      };
      return q;
    },
    rpc: async function () { return { data: true, error: null }; }
  };
}

/* a sync store double with one queued write */
function fakeSync() {
  const map = new Map();
  return {
    hydrate: vi.fn(async function () {}),
    get: function (k, fb) { return map.has(k) ? JSON.parse(JSON.stringify(map.get(k))) : fb; },
    set: vi.fn(function (k, v) { map.set(k, JSON.parse(JSON.stringify(v))); return true; }),
    remove: vi.fn(function (k) { map.delete(k); return true; }),
    flush: vi.fn(async function () {}),
    pending: vi.fn(function () { return true; }),
    refresh: vi.fn(async function () { return []; }),
    reset: vi.fn()
  };
}

function loginReply(userId) {
  return vi.fn(async function () {
    return { status: 200, json: async function () { return { session: { access_token: 'tok-' + userId, refresh_token: 'r' } }; } };
  });
}

let reload;
beforeEach(function () {
  setActivePinia(createPinia());
  reload = vi.spyOn(window.location, 'reload').mockImplementation(function () {});
});
afterEach(function () {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function bootAs(userId, sync) {
  const auth = useAuthStore();
  const client = fakeClient(userId);
  auth.configure({ client: client, url: API, anonKey: 'anon', createSyncStore: function () { return sync; } });
  await auth.boot({ type: '', errorCode: '' });
  return { auth, client };
}

test('entering the app attaches, hydrates, then loads the data store', async () => {
  const sync = fakeSync();
  const { auth } = await bootAs('u1', sync);
  const data = useDataStore();
  expect(auth.ready).toBe(true);
  expect(auth.user.id).toBe('u1');
  expect(auth.profile).toEqual({ username: 'ana', displayName: 'Ana' });
  expect(sync.hydrate).toHaveBeenCalledTimes(1);
  expect(data.ready).toBe(true);
  expect(sync.set).toHaveBeenCalled();   /* load() seeded the sample through the attached store */
});

test('auth store keeps queued writes after session end and flushes for the same user', async () => {
  const sync = fakeSync();
  const { auth } = await bootAs('u1', sync);
  auth.onSessionEnded();
  auth.onSessionEnded();   /* once per pending key: the second call changes nothing */
  expect(auth.sessionEnded).toBe(true);
  expect(auth.msg).toEqual({ text: 'Your session ended. Log in again to keep saving.', tone: 'error' });
  expect(auth.drafts.loginUsername).toBe('ana');
  expect(sync.reset).not.toHaveBeenCalled();
  expect(sync.pending()).toBe(true);

  vi.stubGlobal('fetch', loginReply('u1'));
  const r = await auth.login('ana', 'secret123');
  expect(r.ok).toBe(true);
  expect(sync.flush).toHaveBeenCalledTimes(1);
  expect(sync.reset).not.toHaveBeenCalled();
  expect(auth.sessionEnded).toBe(false);
  expect(auth.msg.text).toBe('');
  expect(reload).not.toHaveBeenCalled();
});

test('a different user resets the store and reloads', async () => {
  const sync = fakeSync();
  const { auth } = await bootAs('u1', sync);
  auth.onSessionEnded();
  vi.stubGlobal('fetch', loginReply('u2'));
  await auth.login('bob', 'secret123');
  expect(sync.reset).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(sync.flush).not.toHaveBeenCalled();
});

test('the backend same-user guard resets and reloads once', async () => {
  const sync = fakeSync();
  let backendOpts = null;
  const auth = useAuthStore();
  const client = fakeClient('u1');
  auth.configure({
    client: client, url: API, anonKey: 'anon',
    createBackend: function (sb, opts) { backendOpts = opts; return {}; },
    createSyncStore: function () { return sync; }
  });
  await auth.boot({ type: '', errorCode: '' });
  expect(backendOpts.getUserId()).toBe('u1');
  backendOpts.onUserSwitched();
  backendOpts.onUserSwitched();
  expect(sync.reset).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
  backendOpts.onAuthLost();
  backendOpts.onAuthLost();
  expect(auth.sessionEnded).toBe(true);
});

test('logout waits at most the flush limit, signs out locally, resets and reloads', async () => {
  const sync = fakeSync();
  sync.flush = vi.fn(function () { return new Promise(function () {}); });   /* never settles */
  const auth = useAuthStore();
  const client = fakeClient('u1');
  auth.configure({ client: client, url: API, anonKey: 'anon', flushLimitMs: 20, createSyncStore: function () { return sync; } });
  await auth.boot({ type: '', errorCode: '' });
  await auth.logout();
  expect(sync.flush).toHaveBeenCalledTimes(1);
  expect(client.calls.signOut).toEqual([{ scope: 'local' }]);
  expect(sync.reset).toHaveBeenCalledTimes(1);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('login maps the server replies to the exact copy', async () => {
  const auth = useAuthStore();
  auth.configure({ client: fakeClient(null), url: API, anonKey: 'anon', createSyncStore: fakeSync });
  await auth.boot({ type: '', errorCode: '' });
  function reply(status, body) { return vi.fn(async function () { return { status: status, json: async function () { return body; } }; }); }

  vi.stubGlobal('fetch', reply(401, {}));
  expect(await auth.login('ana', 'nope')).toMatchObject({ ok: false, wrong: true });
  expect(auth.msg).toEqual({ text: 'Wrong username or password.', tone: 'error' });

  vi.stubGlobal('fetch', reply(429, {}));
  await auth.login('ana', 'nope');
  expect(auth.msg.text).toBe('Too many attempts. Try again in a few minutes.');

  vi.stubGlobal('fetch', reply(403, {}));
  expect(await auth.login('ana', 'nope')).toMatchObject({ ok: false, unverified: true });
  expect(auth.msg.text).toBe('Email not verified yet.');

  vi.stubGlobal('fetch', vi.fn(async function () { throw new TypeError('Failed to fetch'); }));
  await auth.login('ana', 'nope');
  expect(auth.msg.text).toBe('Could not reach the server. Check your connection and try again.');

  vi.stubGlobal('fetch', reply(200, {}));
  expect(await auth.recover('Ana', 'reset')).toBe(true);
  expect(auth.msg).toEqual({ text: 'If that account exists, we sent an email.', tone: 'ok' });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body).toEqual({ identifier: 'ana', action: 'reset', redirectTo: window.location.origin + '/' });
});

test('register validates every field with the reference copy', async () => {
  const auth = useAuthStore();
  auth.configure({ client: fakeClient(null), url: API, anonKey: 'anon', createSyncStore: fakeSync });
  const r = await auth.register({ username: 'A', displayName: ' ', email: 'x', age: '121', password: 'short', password2: 'other' });
  expect(r.ok).toBe(false);
  expect(r.first).toBe('reg-username');
  expect(r.errors).toEqual({
    'reg-username': 'Use 3 to 20 lowercase letters, numbers or underscores.',
    'reg-display': 'Enter a display name of 1 to 40 characters.',
    'reg-email': 'Enter a valid email address.',
    'reg-age': 'Enter your age as a whole number from 0 to 120.',
    'reg-password': 'Use at least 8 characters.',
    'reg-password2': 'The passwords do not match.'
  });
});

test('a sign-up 500 blames the username only when the server says it is taken', async () => {
  const auth = useAuthStore();
  const client = fakeClient(null);
  client.auth.signUp = async function () { return { data: {}, error: { status: 500, code: 'unexpected_failure', message: 'Database error saving new user' } }; };
  client.rpc = async function () { return { data: false, error: null }; };
  auth.configure({ client: client, url: API, anonKey: 'anon', createSyncStore: fakeSync });
  const fields = { username: 'ana', displayName: 'Ana', email: 'ana@example.com', age: '30', password: 'secret123', password2: 'secret123' };
  expect(await auth.register(fields)).toMatchObject({ ok: false, first: 'reg-username', errors: { 'reg-username': 'Username taken.' } });

  client.rpc = async function () { return { data: true, error: null }; };
  const again = await auth.register(Object.assign({}, fields, { username: 'ana2' }));
  expect(again).toMatchObject({ ok: false, errors: {} });
  expect(auth.msg.text).toBe('Something went wrong. Try again.');

  client.auth.signUp = async function () { return { data: {}, error: null }; };
  expect(await auth.register(Object.assign({}, fields, { username: 'ana3' }))).toMatchObject({ ok: true });
  expect(auth.drafts.loginUsername).toBe('ana3');
});

test('a signup link signs out locally and does not enter the app', async () => {
  const sync = fakeSync();
  const auth = useAuthStore();
  const client = fakeClient('u1');
  auth.configure({ client: client, url: API, anonKey: 'anon', createSyncStore: function () { return sync; } });
  await auth.boot({ type: 'signup', errorCode: '' });
  expect(client.calls.signOut).toEqual([{ scope: 'local' }]);
  expect(auth.user).toBe(null);
  expect(sync.hydrate).not.toHaveBeenCalled();
});

test('a recovery link with a session opens reset mode without entering the app', async () => {
  const sync = fakeSync();
  const auth = useAuthStore();
  auth.configure({ client: fakeClient('u1'), url: API, anonKey: 'anon', createSyncStore: function () { return sync; } });
  await auth.boot({ type: 'recovery', errorCode: '' });
  expect(auth.recoveryMode).toBe(true);
  expect(auth.user).toBe(null);
  const r = await auth.resetPassword('newsecret1');
  expect(r.ok).toBe(true);
  expect(auth.recoveryMode).toBe(false);
  expect(auth.user.id).toBe('u1');
});

test('no client configured shows the not configured copy', async () => {
  const auth = useAuthStore();
  auth.configure({ client: null, url: '', anonKey: '' });
  await auth.boot({ type: '', errorCode: '' });
  expect(auth.ready).toBe(true);
  expect(auth.msg).toEqual({ text: 'This page could not start. Try again later.', tone: 'error' });
});
