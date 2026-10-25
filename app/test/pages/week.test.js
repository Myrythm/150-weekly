import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppRouter } from '../../src/router.js';
import { useAuthStore } from '../../src/stores/auth.js';
import { useDataStore } from '../../src/stores/data.js';
import { useUiStore } from '../../src/stores/ui.js';
import { parseYmd } from '../../src/core/dates.js';
import { seedSessions } from '../../src/core/sample.js';
import WeekPage from '../../src/pages/WeekPage.vue';
import App from '../../src/App.vue';

/* 2026-10-24 is a Saturday: the sample's current week has 5 sessions and 96 aerobic minutes at age 30 */
function setup(opts) {
  opts = opts || {};
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(pinia, { history: createMemoryHistory() });
  const auth = useAuthStore(pinia);
  auth.user = { id: 'u1' };
  auth.profile = { username: 'ana', displayName: 'Ana' };
  auth.ready = true;
  const data = useDataStore(pinia);
  data.today = parseYmd('2026-10-24');
  data.prefs.age = opts.age === undefined ? 30 : opts.age;
  if (opts.sessions) data.sessions = opts.sessions;
  else if (opts.sample !== false) { data.sessions = seedSessions(data.today); data.meta.sampleActive = true; }
  if (opts.tracks) data.tracks = opts.tracks;
  data.ready = true;
  return { pinia, router, auth, data, ui: useUiStore(pinia) };
}

async function mountWeek(opts, component) {
  const s = setup(opts);
  await s.router.push((opts && opts.path) || '/');
  await s.router.isReady();
  const wrapper = mount(component || WeekPage, { global: { plugins: [s.pinia, s.router] }, attachTo: document.body });
  await flushPromises();
  return Object.assign(s, { wrapper: wrapper });
}

const q = (sel) => document.querySelector(sel);
const text = (sel) => q(sel).textContent.trim();

beforeEach(function () {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.useRealTimers();
});
afterEach(function () { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('age step', function () {
  test('an unset age shows the age step, hides the log panel and previews adult targets', async function () {
    const { wrapper } = await mountWeek({ age: null });
    expect(q('#age-step').hidden).toBe(false);
    expect(q('#log').hidden).toBe(true);
    expect(text('#age-chip')).toBe('Preview: adult targets until you set your age');
    expect(q('#age-chip').classList.contains('is-preview')).toBe(true);
    expect(q('#age-change').hidden).toBe(true);
    expect(q('#age-cancel').hidden).toBe(true);
    expect(q('#band-grid').classList.contains('is-asking')).toBe(true);
    wrapper.unmount();
  });

  test('setting age 30 gives the adult copy, closes the step and opens the log panel', async function () {
    const { wrapper, data, ui } = await mountWeek({ age: null });
    await wrapper.find('#age-input').setValue('30');
    await wrapper.find('#age-form').trigger('submit');
    await flushPromises();
    expect(data.prefs.age).toBe(30);
    expect(text('#week-heading')).toBe('Bank 150 minutes this week.');
    expect(text('#age-chip')).toBe('Adult 18 to 64 guideline');
    expect(q('#age-chip').classList.contains('is-preview')).toBe(false);
    expect(q('#age-step').hidden).toBe(true);
    expect(q('#log').hidden).toBe(false);
    expect(q('#age-change').hidden).toBe(false);
    expect(document.activeElement).toBe(q('#age-change'));
    expect(ui.askingAge).toBe(false);
    wrapper.unmount();
  });

  test('an invalid age shows the error and keeps the step open', async function () {
    const { wrapper, data } = await mountWeek({ age: null });
    await wrapper.find('#age-input').setValue('130');
    await wrapper.find('#age-form').trigger('submit');
    await flushPromises();
    expect(q('#age-err').hidden).toBe(false);
    expect(text('#age-err')).toBe('Enter an age from 5 to 120.');
    expect(q('#age-input').getAttribute('aria-invalid')).toBe('true');
    expect(data.prefs.age).toBe(null);
    expect(document.activeElement).toBe(q('#age-input'));
    await wrapper.find('#age-input').setValue('31');
    expect(q('#age-err').hidden).toBe(true);
    wrapper.unmount();
  });

  test('under 5 keeps the step open with the WHO link and hides the targets', async function () {
    const { wrapper } = await mountWeek({ age: null });
    await wrapper.find('#age-input').setValue('3');
    await wrapper.find('#age-form').trigger('submit');
    await flushPromises();
    expect(q('#age-step').hidden).toBe(false);
    expect(q('#age-under5').hidden).toBe(false);
    expect(q('#targets').hidden).toBe(true);
    expect(text('#week-heading')).toBe('Made for ages 5 and up.');
    expect(text('#age-chip')).toBe('Under 5: no targets here');
    expect(q('#age-cancel').hidden).toBe(true);
    wrapper.unmount();
  });

  test('Change age opens the step with the age filled in, Keep my current age closes it', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    expect(q('#age-step').hidden).toBe(true);
    await wrapper.find('#age-change').trigger('click');
    await flushPromises();
    expect(q('#age-step').hidden).toBe(false);
    expect(q('#log').hidden).toBe(true);
    expect(q('#age-input').value).toBe('30');
    expect(q('#age-cancel').hidden).toBe(false);
    expect(document.activeElement).toBe(q('#age-input'));
    await wrapper.find('#age-cancel').trigger('click');
    await flushPromises();
    expect(q('#age-step').hidden).toBe(true);
    expect(q('#log').hidden).toBe(false);
    expect(document.activeElement).toBe(q('#age-change'));
    wrapper.unmount();
  });
});

describe('header Log links', function () {
  test('with the age step showing, Log a session focuses the age input and does not navigate', async function () {
    const { wrapper, router } = await mountWeek({ age: null }, App);
    const link = document.querySelector('#header-log');
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await flushPromises();
    expect(document.activeElement).toBe(q('#age-input'));
    expect(router.currentRoute.value.hash).toBe('');
    document.querySelector('#nav-log').blur();
    q('#age-input').blur();
    document.querySelector('#nav-log').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await flushPromises();
    expect(document.activeElement).toBe(q('#age-input'));
    expect(router.currentRoute.value.hash).toBe('');
    wrapper.unmount();
  });

  test('without the age step, Log a session goes to #log and focuses the activity select', async function () {
    const { wrapper, router } = await mountWeek({ age: 30 }, App);
    document.querySelector('#header-log').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await flushPromises();
    expect(router.currentRoute.value.hash).toBe('#log');
    expect(document.activeElement).toBe(q('#log-activity'));
    wrapper.unmount();
  });
});

describe('log form', function () {
  test('20 minutes of moderate walking is logged, counted, and clears the sample', async function () {
    const { wrapper, data } = await mountWeek({ age: 30 });
    expect(document.querySelectorAll('#splits-body tr')).toHaveLength(5);
    expect(q('#sample-banner').hidden).toBe(false);
    await wrapper.find('#log-minutes').setValue('20');
    await wrapper.find('#log-form').trigger('submit');
    await flushPromises();
    expect(text('#log-status')).toBe('Logged. 20 minutes toward this week.');
    expect(q('#log-minutes').value).toBe('');
    expect(document.activeElement).toBe(q('#log-minutes'));
    const rows = document.querySelectorAll('#splits-body tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.c-act').textContent.trim()).toBe('Walk');
    expect(rows[0].querySelector('.c-min').textContent).toBe('20');
    expect(q('#sample-banner').hidden).toBe(true);
    expect(text('#splits-total')).toBe('20');
    expect(data.meta.sampleActive).toBe(false);
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]).toMatchObject({ type: 'walk', minutes: 20, intensity: 'moderate', source: 'log', balance: false, sample: false });
    wrapper.unmount();
  });

  test('0 minutes shows the error, 1 to 240 only', async function () {
    const { wrapper, data } = await mountWeek({ age: 30 });
    await wrapper.find('#log-minutes').setValue('0');
    await wrapper.find('#log-form').trigger('submit');
    await flushPromises();
    expect(q('#log-minutes-err').hidden).toBe(false);
    expect(text('#log-minutes-err')).toBe('Enter minutes from 1 to 240.');
    expect(q('#log-minutes').getAttribute('aria-invalid')).toBe('true');
    expect(text('#log-status')).toBe('');
    expect(data.meta.sampleActive).toBe(true);
    expect(document.activeElement).toBe(q('#log-minutes'));
    await wrapper.find('#log-minutes').setValue('241');
    expect(q('#log-minutes-err').hidden).toBe(true);
    await wrapper.find('#log-form').trigger('submit');
    expect(q('#log-minutes-err').hidden).toBe(false);
    wrapper.unmount();
  });

  test('a quick-minutes chip fills the input and focuses it', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    await wrapper.find('#log-chip-30').trigger('click');
    expect(q('#log-minutes').value).toBe('30');
    expect(document.activeElement).toBe(q('#log-minutes'));
    wrapper.unmount();
  });

  test('strength hides the effort group and says it is a muscle day; vigorous counts double', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    await wrapper.find('#log-activity').setValue('strength');
    expect(q('#log-effort').hidden).toBe(true);
    expect(text('#log-int-note')).toBe('Strength counts as a muscle day, not toward your 150 minutes.');
    await wrapper.find('#log-minutes').setValue('15');
    await wrapper.find('#log-form').trigger('submit');
    await flushPromises();
    expect(text('#log-status')).toBe('Logged. Counted as a muscle day, not toward your minutes.');
    await wrapper.find('#log-activity').setValue('run');
    expect(q('#log-effort').hidden).toBe(false);
    await wrapper.find('#log-int-vig').setValue(true);
    expect(text('#log-int-help')).toBe('You can only say a few words before you need a breath.');
    await wrapper.find('#log-minutes').setValue('10');
    await wrapper.find('#log-form').trigger('submit');
    await flushPromises();
    expect(text('#log-status')).toBe('Logged. 10 vigorous minutes counts as 20 toward this week.');
    expect(text('#splits-total')).toBe('20');
    wrapper.unmount();
  });

  test('a session on an earlier week says Logged to last week', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    const opts = Array.from(q('#log-date').options).map((o) => o.value);
    expect(opts).toHaveLength(7);
    expect(opts[0]).toBe('2026-10-24');
    expect(q('#log-date').options[0].textContent).toBe('Today');
    expect(q('#log-date').options[1].textContent).toBe('Yesterday');
    expect(q('#log-date').options[2].textContent).toBe('Thu 22 Oct');
    await wrapper.find('#log-date').setValue('2026-10-18');
    await wrapper.find('#log-minutes').setValue('25');
    await wrapper.find('#log-form').trigger('submit');
    await flushPromises();
    expect(text('#log-status')).toBe('Logged to last week.');
    wrapper.unmount();
  });

  test('65 and over get the balance options and the balance work box', async function () {
    const { wrapper } = await mountWeek({ age: 70 });
    const values = () => Array.from(q('#log-activity').options).map((o) => o.value);
    expect(values()).toEqual(['walk', 'run', 'cycle', 'strength', 'balance', 'swim', 'yoga', 'dance', 'sport', 'stairs', 'other']);
    expect(q('#log-balance-row').hidden).toBe(false);
    await wrapper.find('#log-activity').setValue('dance');
    expect(q('#log-balance-row').hidden).toBe(true);
    expect(text('#log-int-note')).toContain('It also counts as a balance day.');
    wrapper.unmount();
  });
});

describe('hero', function () {
  test('the sample week at age 30 reads 96 of 150', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    expect(text('#splits-total')).toBe('96');
    expect(q('#bib').getAttribute('aria-label')).toBe('This week: 96 of 150 active minutes');
    expect(text('#bib-status')).toBe('54 to go');
    expect(text('#bib-target')).toBe('Target 150');
    expect(text('#bib-week')).toBe('Week of 19 OCT');
    expect(text('#bib-name')).toBe('Ana');
    expect(q('#bib-sample-tag').hidden).toBe(false);
    expect(q('#lane-wrap').getAttribute('aria-valuenow')).toBe('96');
    expect(q('#lane-wrap').getAttribute('aria-valuetext')).toBe('96 of 150 minutes, 54 to go');
    expect(text('#lane-marker')).toBe('96');
    expect(text('#legend-vig')).toContain('Vigorous 18 min x2 = 36');
    expect(text('#next-step')).toContain('54 minutes to go with 2 days left.');
    expect(document.querySelectorAll('#lane-scale .tick')).toHaveLength(15);
    expect(document.querySelectorAll('#lane-labels span').length).toBeGreaterThan(3);
    expect(text('#strength-count')).toBe('1 of 2');
    expect(document.querySelectorAll('#strength-boxes i.on')).toHaveLength(1);
    expect(q('#balance').hidden).toBe(true);
    wrapper.unmount();
  });

  test('the bib number lands on the exact value when motion is reduced and when it is not', async function () {
    const { wrapper, data } = await mountWeek({ age: 30 });
    expect(text('#bib-number')).toBe('096');
    vi.spyOn(window, 'matchMedia').mockImplementation(function () { return { matches: true }; });
    data.sessions.push({ id: 'x', date: '2026-10-24', type: 'walk', minutes: 4, intensity: 'moderate', balance: false, source: 'log', sample: false, createdAt: 1 });
    await flushPromises();
    expect(text('#bib-number')).toBe('100');
    window.matchMedia.mockImplementation(function () { return { matches: false }; });
    vi.useFakeTimers();
    data.sessions.push({ id: 'y', date: '2026-10-24', type: 'walk', minutes: 50, intensity: 'moderate', balance: false, source: 'log', sample: false, createdAt: 2 });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    expect(text('#bib-number')).toBe('150');
    expect(text('#bib-status')).toBe('Target met');
    wrapper.unmount();
  });

  test('65 and over show the balance days', async function () {
    const { wrapper } = await mountWeek({ age: 70 });
    expect(q('#balance').hidden).toBe(false);
    expect(text('#balance-count')).toBe('1 of 3');
    expect(document.querySelectorAll('#balance-boxes i')).toHaveLength(3);
    wrapper.unmount();
  });

  test('Clear sample shows the notice, hides the banner and focuses the heading', async function () {
    const { wrapper, data } = await mountWeek({ age: 30 });
    await wrapper.find('#sample-clear').trigger('click');
    await flushPromises();
    expect(text('#log-status')).toBe('Sample cleared. Your log starts now.');
    expect(q('#sample-banner').hidden).toBe(true);
    expect(data.sessions).toHaveLength(0);
    expect(document.activeElement).toBe(q('#week-heading'));
    expect(text('#splits-total')).toBe('0');
    expect(q('#splits-empty').hidden).toBe(false);
    expect(q('#splits-table').hidden).toBe(true);
    wrapper.unmount();
  });
});

describe('splits', function () {
  test('Remove then Undo puts the row back and focuses its Remove button', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    const row = q('#splits-body tr');
    const id = row.getAttribute('data-id');
    q('#remove-' + id).click();
    await flushPromises();
    expect(document.querySelectorAll('#splits-body tr')).toHaveLength(4);
    expect(q('#undo-bar').hidden).toBe(false);
    expect(text('#undo-text')).toMatch(/^Removed Walk, 40 min\.$/);
    expect(document.activeElement).toBe(q('#undo-btn'));
    q('#undo-btn').click();
    await flushPromises();
    expect(document.querySelectorAll('#splits-body tr')).toHaveLength(5);
    expect(q('#undo-bar').hidden).toBe(true);
    expect(document.activeElement).toBe(q('#remove-' + id));
    wrapper.unmount();
  });

  test('the table, note, history link and import slot', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    expect(text('#splits-heading')).toBe("This week's splits");
    expect(q('#splits-history').getAttribute('href')).toBe('/log');
    expect(text('#splits-history')).toBe('See the full log');
    expect(text('#splits-history-help')).toBe('Every week you have logged, newest first.');
    expect(q('#splits-note').hidden).toBe(false);
    expect(text('#splits-note')).toBe('Strength work counts toward muscle days, not minutes. Light activity is good for you but is not counted either. The week total is aerobic minutes only.');
    expect(q('#gpx-earlier').hidden).toBe(true);
    wrapper.unmount();
  });

  test('the import slot is rendered inside the splits section', async function () {
    const s = setup({ age: 30 });
    await s.router.push('/');
    const SplitsSection = (await import('../../src/components/SplitsSection.vue')).default;
    const wrapper = mount(SplitsSection, { global: { plugins: [s.pinia, s.router] }, slots: { import: '<div id="gpx-bar">bar</div>' }, attachTo: document.body });
    expect(q('#splits #gpx-bar')).not.toBe(null);
    wrapper.unmount();
  });

  test('earlier imports list a stored route outside this week with a Details link', async function () {
    const sessions = [
      { id: 's_old', date: '2026-10-14', type: 'run', minutes: 30, intensity: 'moderate', balance: false, source: 'gpx', trackId: 't1', sample: false, createdAt: 5 },
      { id: 's_nt', date: '2026-10-13', type: 'run', minutes: 20, intensity: 'moderate', balance: false, source: 'gpx', trackId: 'gone', sample: false, createdAt: 4 }
    ];
    const { wrapper } = await mountWeek({ age: 30, sessions: sessions, tracks: { t1: { name: 'Park', metrics: { distanceM: 5200 }, importedAt: 1 } } });
    expect(q('#gpx-earlier').hidden).toBe(false);
    const items = document.querySelectorAll('#gpx-earlier-list li');
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('.earlier-day').textContent).toBe('Wed 14 Oct');
    expect(items[0].querySelector('.earlier-what').textContent).toBe('Run, ' + GPX.fmtDistance(5200) + ', 30 min, Park');
    const a = q('#earlier-s_old');
    expect(a.getAttribute('href')).toBe('/activity/s_old?from=week');
    expect(a.getAttribute('aria-label')).toBe('Details for Run, Wed 14 Oct');
    wrapper.unmount();
  });
});

describe('router scroll behaviour', function () {
  test('scrollBehavior waits for data ready', async function () {
    const s = setup({ age: 30 });
    s.data.ready = false;
    const to = s.router.resolve('/#log');
    document.body.innerHTML = '<div id="log"></div>';
    let done = false;
    const p = s.router.options.scrollBehavior(to, s.router.currentRoute.value, null).then(function (r) { done = true; return r; });
    await flushPromises();
    expect(done).toBe(false);
    s.data.ready = true;
    await flushPromises();
    expect(done).toBe(true);
    expect(await p).toEqual({ el: '#log', top: 0 });
  });

  test('the scroll to a section keeps the target scroll-margin-top below the sticky header', async function () {
    const s = setup({ age: 30 });
    document.body.innerHTML = '<div id="splits" style="scroll-margin-top: 72px"></div><div id="plain"></div>';
    const sb = s.router.options.scrollBehavior;
    expect(await sb(s.router.resolve('/#splits'), s.router.currentRoute.value, null)).toEqual({ el: '#splits', top: 72 });
    expect(await sb(s.router.resolve('/#plain'), s.router.currentRoute.value, null)).toEqual({ el: '#plain', top: 0 });
  });

  test('a hash that names no element, and no hash, scroll to the top; a saved position is kept', async function () {
    const s = setup({ age: 30 });
    document.body.innerHTML = '<div id="log"></div>';
    const sb = s.router.options.scrollBehavior;
    expect(await sb(s.router.resolve('/#nowhere'), s.router.currentRoute.value, null)).toEqual({ top: 0 });
    expect(await sb(s.router.resolve('/log'), s.router.currentRoute.value, null)).toEqual({ top: 0 });
    expect(await sb(s.router.resolve('/log'), s.router.currentRoute.value, { top: 120, left: 0 })).toEqual({ top: 120, left: 0 });
  });

  test('a route outside the app does not wait for data', async function () {
    const s = setup({ age: 30 });
    s.data.ready = false;
    expect(await s.router.options.scrollBehavior(s.router.resolve('/login'), s.router.currentRoute.value, null)).toEqual({ top: 0 });
  });
});
