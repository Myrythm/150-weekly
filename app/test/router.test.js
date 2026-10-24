import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { createAppRouter } from '../src/router.js';
import { useAuthStore } from '../src/stores/auth.js';

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(pinia, { history: createMemoryHistory() });
  return { router, auth: useAuthStore(pinia) };
}

test('guard redirects to login with next', async () => {
  const { router } = setup();
  await router.push('/activity/sample_32?from=log');
  expect(router.currentRoute.value.path).toBe('/login');
  expect(router.currentRoute.value.query.next).toBe('/activity/sample_32?from=log');
});

test('logged-in visitor on /login goes to next', async () => {
  const { router, auth } = setup();
  auth.user = { id: 'u1' };
  await router.push('/login?next=/log');
  expect(router.currentRoute.value.path).toBe('/log');
});

test('logged-in visitor on /login without next goes to the week', async () => {
  const { router, auth } = setup();
  auth.user = { id: 'u1' };
  await router.push('/login?next=//evil.example');
  expect(router.currentRoute.value.name).toBe('week');
});

test('route names, auth meta and unknown paths', async () => {
  const { router, auth } = setup();
  const names = router.getRoutes().map(function (r) { return r.name; }).filter(Boolean).sort();
  expect(names).toEqual(['activity', 'check-email', 'forgot', 'log', 'login', 'register', 'reset', 'week']);
  ['week', 'log', 'activity'].forEach(function (n) { expect(router.getRoutes().find(function (r) { return r.name === n; }).meta.auth).toBe(true); });
  auth.user = { id: 'u1' };
  await router.push('/nowhere/at/all');
  expect(router.currentRoute.value.name).toBe('week');
});

test('the week page without login goes to /login with no next', async () => {
  const { router } = setup();
  await router.push('/');
  expect(router.currentRoute.value.path).toBe('/login');
  expect(router.currentRoute.value.query.next).toBe(undefined);
});

test('reset without a recovery session shows forgot with the expired copy', async () => {
  const { router, auth } = setup();
  await router.push('/reset');
  expect(router.currentRoute.value.name).toBe('forgot');
  expect(auth.msg.text).toBe('This link has expired or was already used. Request a new one.');
});

test('an ended session sends the visitor to login with next', async () => {
  const { router, auth } = setup();
  auth.user = { id: 'u1' };
  await router.push('/log');
  expect(router.currentRoute.value.name).toBe('log');
  auth.sessionEnded = true;
  await new Promise(function (r) { setTimeout(r, 0); });
  await router.isReady();
  await new Promise(function (r) { setTimeout(r, 0); });
  expect(router.currentRoute.value.name).toBe('login');
  expect(router.currentRoute.value.query.next).toBe('/log');
});

test('an email link route replaces the first navigation, so the link never becomes a next', async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const history = createMemoryHistory();
  history.replace('/#error=access_denied&error_code=otp_expired');
  const router = createAppRouter(pinia, { history: history });
  const auth = useAuthStore(pinia);
  let release;
  const gate = new Promise(function (r) { release = r; });
  auth.whenReady = function () { return gate; };
  const { createApp } = await import('vue');
  const app = createApp({ render: function () { return null; } });
  app.use(pinia);
  app.use(router);   /* starts the first navigation to the link URL */
  router.replace({ path: '/forgot' });
  release();
  await router.isReady();
  await new Promise(function (r) { setTimeout(r, 0); });
  expect(router.currentRoute.value.fullPath).toBe('/forgot');
});

test('the first route drops an auth link hash that has no route of its own', async () => {
  const { router, auth } = setup();
  auth.user = { id: 'u1' };
  await router.push('/log#access_token=x&type=magiclink');
  expect(router.currentRoute.value.fullPath).toBe('/log');
});

test('page titles come from route meta, default Weekly 150', async () => {
  const { router, auth } = setup();
  auth.user = { id: 'u1' };
  await router.push('/log');
  expect(document.title).toBe('Full log, Weekly 150');
  await router.push('/');
  expect(document.title).toBe('Weekly 150');
});

test('a logged-in visitor sent to /reset by next lands on the week page and no expired copy is left behind', async () => {
  const { router, auth } = setup();
  auth.user = { id: 'u1' };
  await router.push('/login?next=/reset');
  expect(router.currentRoute.value.name).toBe('week');
  expect(auth.msg.text).toBe('');
});

test('opening /reset while logged in does not set the expired copy', async () => {
  const { router, auth } = setup();
  auth.user = { id: 'u1' };
  await router.push('/reset');
  expect(router.currentRoute.value.name).toBe('week');
  expect(auth.msg.text).toBe('');
});

test('Back and Forward between auth screens clear the previous message', async () => {
  const { router, auth } = setup();
  await router.push('/login');
  await router.push('/register');
  auth.setMsg('Wrong username or password.', 'error');
  router.back();
  await new Promise(function (r) { setTimeout(r, 10); });
  expect(router.currentRoute.value.name).toBe('login');
  expect(auth.msg.text).toBe('');
  auth.setMsg('Wrong username or password.', 'error');
  router.forward();
  await new Promise(function (r) { setTimeout(r, 10); });
  expect(router.currentRoute.value.name).toBe('register');
  expect(auth.msg.text).toBe('');
});

test('a message set for a forward navigation stays', async () => {
  const { router, auth } = setup();
  await router.push('/login');
  auth.setMsg('New password saved.', 'ok');
  await router.push('/forgot');
  expect(auth.msg.text).toBe('New password saved.');
});

test('Back onto a route whose guard sets a new message keeps that message', async () => {
  const { router, auth } = setup();
  auth.recoveryMode = true;
  await router.push('/reset');
  await router.push('/login');
  auth.recoveryMode = false;
  auth.setMsg('stale', 'error');
  router.back();
  await new Promise(function (r) { setTimeout(r, 10); });
  expect(router.currentRoute.value.name).toBe('forgot');
  expect(auth.msg.text).toBe('This link has expired or was already used. Request a new one.');
});
