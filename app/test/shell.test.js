import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppRouter } from '../src/router.js';
import { useAuthStore } from '../src/stores/auth.js';
import { useDataStore } from '../src/stores/data.js';
import { useUiStore } from '../src/stores/ui.js';
import App from '../src/App.vue';
import AppHeader from '../src/components/AppHeader.vue';
import AppFooter from '../src/components/AppFooter.vue';
import LiveRegion from '../src/components/LiveRegion.vue';

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(pinia, { history: createMemoryHistory() });
  const auth = useAuthStore(pinia);
  auth.user = { id: 'u1' };
  auth.profile = { username: 'ana', displayName: 'Ana' };
  auth.ready = true;
  return { pinia, router, auth, ui: useUiStore(pinia), data: useDataStore(pinia) };
}

async function mountWith(component, path) {
  const s = setup();
  await s.router.push(path || '/');
  await s.router.isReady();
  const wrapper = mount(component, { global: { plugins: [s.pinia, s.router] }, attachTo: document.body });
  return Object.assign(s, { wrapper: wrapper });
}

beforeEach(function () {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '';
  vi.useRealTimers();
});
afterEach(function () { vi.restoreAllMocks(); });

describe('ui store theme', function () {
  test('cycleTheme goes auto, light, dark, auto and stores the choice', function () {
    setup();
    const ui = useUiStore();
    expect(ui.theme).toBe('auto');
    ui.cycleTheme();
    expect(ui.theme).toBe('light');
    expect(JSON.parse(localStorage.getItem('w150.theme'))).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    ui.cycleTheme();
    expect(ui.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('w150.theme'))).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    ui.cycleTheme();
    expect(ui.theme).toBe('auto');
    expect(JSON.parse(localStorage.getItem('w150.theme'))).toBe('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  test('the stored theme is read on creation', function () {
    localStorage.setItem('w150.theme', JSON.stringify('dark'));
    setup();
    expect(useUiStore().theme).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  test('an unknown stored value falls back to auto', function () {
    localStorage.setItem('w150.theme', '"purple"');
    setup();
    expect(useUiStore().theme).toBe('auto');
    localStorage.setItem('w150.theme', '{not json');
    setup();
    expect(useUiStore().theme).toBe('auto');
  });

  test('a throwing localStorage still cycles the theme', function () {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function () { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function () { throw new Error('blocked'); });
    setup();
    const ui = useUiStore();
    expect(ui.theme).toBe('auto');
    expect(function () { ui.cycleTheme(); }).not.toThrow();
    expect(ui.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  test('announce clears the live text, then sets it after a short delay', function () {
    vi.useFakeTimers();
    setup();
    const ui = useUiStore();
    ui.announce('first');
    expect(ui.live).toBe('');
    vi.advanceTimersByTime(60);
    expect(ui.live).toBe('first');
    ui.announce('second');
    expect(ui.live).toBe('');
    vi.advanceTimersByTime(60);
    expect(ui.live).toBe('second');
  });
});

describe('header', function () {
  const ids = ['wordmark', 'nav-log', 'nav-streak', 'nav-plan', 'nav-snacks', 'nav-history', 'nav-evidence', 'sync-status', 'who-name', 'header-log', 'theme-toggle', 'logout'];

  test('renders every control id with the reference links', async function () {
    const { wrapper } = await mountWith(AppHeader, '/');
    ids.forEach(function (id) { expect(wrapper.find('#' + id).exists(), id).toBe(true); });
    expect(wrapper.find('#wordmark').attributes('href')).toBe('/#week');
    expect(wrapper.find('#wordmark').text()).toBe('Weekly150');
    expect(wrapper.find('#nav-log').attributes('href')).toBe('/#log');
    expect(wrapper.find('#nav-streak').attributes('href')).toBe('/#streak');
    expect(wrapper.find('#nav-plan').attributes('href')).toBe('/#plan');
    expect(wrapper.find('#nav-snacks').attributes('href')).toBe('/#snacks');
    expect(wrapper.find('#nav-history').attributes('href')).toBe('/log');
    expect(wrapper.find('#nav-history').text()).toBe('Full log');
    expect(wrapper.find('#nav-evidence').attributes('href')).toBe('/#evidence');
    expect(wrapper.find('#header-log').attributes('href')).toBe('/#log');
    expect(wrapper.find('#header-log').text()).toBe('Log a session');
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Sections');
    expect(wrapper.find('#who-name').text()).toBe('Ana');
    expect(wrapper.find('#theme-toggle').text()).toBe('Theme: Auto');
    expect(wrapper.find('#logout').text()).toBe('Log out');
    wrapper.unmount();
  });

  test('aria-current is on Full log at /log only', async function () {
    const week = await mountWith(AppHeader, '/');
    ids.forEach(function (id) { expect(week.wrapper.find('#' + id).attributes('aria-current'), id).toBeUndefined(); });
    week.wrapper.unmount();
    const log = await mountWith(AppHeader, '/log');
    expect(log.wrapper.find('#nav-history').attributes('aria-current')).toBe('page');
    ids.filter(function (id) { return id !== 'nav-history'; }).forEach(function (id) { expect(log.wrapper.find('#' + id).attributes('aria-current'), id).toBeUndefined(); });
    log.wrapper.unmount();
  });

  test('sync-status shows the three states', async function () {
    const { wrapper, auth } = await mountWith(AppHeader, '/');
    const el = wrapper.find('#sync-status');
    expect(el.text()).toBe('');
    auth.syncState = 'saving';
    await flushPromises();
    expect(el.text()).toBe('Saving');
    expect(el.attributes('data-state')).toBe('saving');
    auth.syncState = 'saved';
    await flushPromises();
    expect(el.text()).toBe('Saved');
    auth.syncState = 'error';
    await flushPromises();
    expect(el.text()).toBe('Not saved, retrying');
    expect(el.attributes('data-state')).toBe('error');
    wrapper.unmount();
  });

  test('the theme button cycles and labels the theme', async function () {
    const { wrapper } = await mountWith(AppHeader, '/');
    await wrapper.find('#theme-toggle').trigger('click');
    expect(wrapper.find('#theme-toggle').text()).toBe('Theme: Light');
    await wrapper.find('#theme-toggle').trigger('click');
    expect(wrapper.find('#theme-toggle').text()).toBe('Theme: Dark');
    await wrapper.find('#theme-toggle').trigger('click');
    expect(wrapper.find('#theme-toggle').text()).toBe('Theme: Auto');
    wrapper.unmount();
  });

  test('Log out calls the auth store and shows a busy state', async function () {
    const { wrapper, auth } = await mountWith(AppHeader, '/');
    const spy = vi.spyOn(auth, 'logout').mockImplementation(function () { return Promise.resolve(); });
    await wrapper.find('#logout').trigger('click');
    expect(spy).toHaveBeenCalledTimes(1);
    auth.loggingOut = true;
    await flushPromises();
    expect(wrapper.find('#logout').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#logout').attributes('aria-busy')).toBe('true');
    wrapper.unmount();
  });

  test('the name is plain text', async function () {
    const { wrapper, auth } = await mountWith(AppHeader, '/');
    auth.profile = { username: 'x', displayName: '<b>Bob</b>' };
    await flushPromises();
    expect(wrapper.find('#who-name').text()).toBe('<b>Bob</b>');
    expect(wrapper.find('#who-name b').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('live region', function () {
  test('shows ui announcements and auth notices', async function () {
    vi.useFakeTimers();
    const { wrapper, ui, auth } = await mountWith(LiveRegion, '/');
    const el = wrapper.find('#live');
    expect(el.attributes('role')).toBe('status');
    expect(el.attributes('aria-live')).toBe('polite');
    expect(el.classes()).toContain('sr-only');
    ui.announce('Sample cleared. Your log starts now.');
    await vi.advanceTimersByTimeAsync(70);
    expect(el.text()).toBe('Sample cleared. Your log starts now.');
    auth.announce('New password saved.');
    await vi.advanceTimersByTimeAsync(70);
    expect(el.text()).toBe('New password saved.');
    wrapper.unmount();
  });

  test('the same notice text announced twice is announced again', async function () {
    vi.useFakeTimers();
    const { wrapper, ui, auth } = await mountWith(LiveRegion, '/');
    auth.announce('Saved.');
    await vi.advanceTimersByTimeAsync(70);
    expect(ui.live).toBe('Saved.');
    auth.announce('Saved.');
    await vi.advanceTimersByTimeAsync(1);
    expect(ui.live).toBe('');
    await vi.advanceTimersByTimeAsync(70);
    expect(ui.live).toBe('Saved.');
    wrapper.unmount();
  });
});

describe('footer', function () {
  test('the week page has the guideline footer', async function () {
    const { wrapper } = await mountWith(AppFooter, '/');
    expect(wrapper.find('footer.site-footer').exists()).toBe(true);
    expect(wrapper.find('#footer-guide').text()).toContain('WHO 2020 guideline');
    expect(wrapper.find('a[href="https://www.who.int/publications/i/item/9789240015128"]').attributes('rel')).toBe('noopener');
    expect(wrapper.find('#footer-storage').text()).toBe('Your log is saved to your account. Only you can see it.');
    expect(wrapper.text()).toContain('General information, not medical advice.');
    wrapper.unmount();
  });

  test('the guideline text follows the age', async function () {
    const { wrapper, data } = await mountWith(AppFooter, '/');
    data.prefs.age = 30;
    await flushPromises();
    expect(wrapper.find('#footer-guide').text()).toContain('WHO guideline for adults');
    data.prefs.age = 70;
    await flushPromises();
    expect(wrapper.find('#footer-guide').text()).toContain('ages 65 and over');
    data.prefs.age = 3;
    await flushPromises();
    expect(wrapper.find('#footer-guide').text()).toContain('WHO 2020 guideline');
    wrapper.unmount();
  });

  test('the log page has the short footer', async function () {
    const { wrapper } = await mountWith(AppFooter, '/log');
    expect(wrapper.find('#footer-guide').exists()).toBe(false);
    expect(wrapper.find('#footer-storage').text()).toBe('Your log is saved to your account. Only you can see it.');
    expect(wrapper.text()).toContain('General information, not medical advice.');
    wrapper.unmount();
  });
});

describe('app', function () {
  test('app routes get the header, live region and footer', async function () {
    const s = setup();
    await s.router.push('/log');
    const wrapper = mount(App, { global: { plugins: [s.pinia, s.router] }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('#wordmark').exists()).toBe(true);
    expect(wrapper.find('#live').exists()).toBe(true);
    expect(wrapper.find('footer.site-footer').exists()).toBe(true);
    expect(wrapper.find('#placeholder-page').exists()).toBe(true);
    expect(wrapper.find('#placeholder-logout').exists()).toBe(false);
    expect(wrapper.find('main#main').exists()).toBe(true);
    expect(wrapper.find('.skip-link').attributes('href')).toBe('#main');
    wrapper.unmount();
  });

  test('auth routes show no header or footer', async function () {
    const s = setup();
    s.auth.user = null;
    await s.router.push('/login');
    const wrapper = mount(App, { global: { plugins: [s.pinia, s.router] }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.find('#wordmark').exists()).toBe(false);
    expect(wrapper.find('footer.site-footer').exists()).toBe(false);
    expect(wrapper.find('#login-form').exists()).toBe(true);
    wrapper.unmount();
  });

  test('day rollover: tick every minute and when the page becomes visible', async function () {
    vi.useFakeTimers();
    const s = setup();
    await s.router.push('/');
    const spy = vi.spyOn(s.data, 'tick');
    const wrapper = mount(App, { global: { plugins: [s.pinia, s.router] }, attachTo: document.body });
    await flushPromises();
    vi.advanceTimersByTime(60000);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120000);
    expect(spy).toHaveBeenCalledTimes(3);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(spy).toHaveBeenCalledTimes(4);
    wrapper.unmount();
    vi.advanceTimersByTime(120000);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(spy).toHaveBeenCalledTimes(4);
  });
});
