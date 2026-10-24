import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import App from '../src/App.vue';
import { createAppRouter } from '../src/router.js';

test('App mounts', () => {
  const pinia = createPinia();
  const router = createAppRouter(pinia, { history: createMemoryHistory() });
  expect(mount(App, { global: { plugins: [pinia, router] } }).exists()).toBe(true);
});

test('logged out, the entry card shows the login screen', async () => {
  const pinia = createPinia();
  const router = createAppRouter(pinia, { history: createMemoryHistory() });
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body });
  const { useAuthStore } = await import('../src/stores/auth.js');
  const auth = useAuthStore(pinia);
  expect(wrapper.find('#auth-loading').attributes('hidden')).toBe(undefined);
  auth.configure({ client: null, url: '', anonKey: '' });
  await auth.boot({ type: '', errorCode: '' });
  await router.push('/log');
  await flushPromises();
  expect(router.currentRoute.value.fullPath).toBe('/login?next=/log');
  expect(wrapper.find('#auth-loading').attributes('hidden')).toBe('');
  expect(wrapper.find('#auth-login-title').text()).toBe('Log in');
  expect(wrapper.find('#auth-msg').text()).toBe('This page could not start. Try again later.');
  expect(wrapper.find('#auth-msg').attributes('data-tone')).toBe('error');
  ['login-username', 'login-password', 'login-submit', 'resend-verification', 'to-forgot', 'to-register'].forEach(function (id) {
    expect(wrapper.find('#' + id).exists()).toBe(true);
  });
  wrapper.unmount();
});

test('GPX global is loaded', () => { expect(typeof globalThis.GPX.analyze).toBe('function'); });
