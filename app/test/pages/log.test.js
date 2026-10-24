import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppRouter } from '../../src/router.js';
import { useAuthStore } from '../../src/stores/auth.js';
import { useDataStore } from '../../src/stores/data.js';
import { parseYmd, addDays, ymd } from '../../src/core/dates.js';
import { seedSessions } from '../../src/core/sample.js';
import LogPage from '../../src/pages/LogPage.vue';

const TYPES = ['walk', 'run', 'cycle', 'swim', 'strength', 'walk', 'yoga'];

/* fixture A: 292 sessions over 105 weeks, spread across 2026, 2025 and 2024 */
function fixtureA(today) {
  const out = [];
  for (let back = 730; back >= 1; back--) {
    if ((back * 7) % 5 > 1) continue;
    out.push({ id: 'a' + back, date: ymd(addDays(today, -back)), type: TYPES[back % 7], minutes: 15 + (back % 6) * 10, intensity: 'moderate', balance: false, source: 'log', sample: false, createdAt: 1000 - back });
  }
  return out;
}

async function mountLog(sessions) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createAppRouter(pinia, { history: createMemoryHistory() });
  const auth = useAuthStore(pinia);
  auth.user = { id: 'u1' };
  auth.profile = { username: 'ana', displayName: 'Ana' };
  auth.ready = true;
  const data = useDataStore(pinia);
  data.today = parseYmd('2026-10-24');
  data.prefs.age = 30;
  data.sessions = sessions === 'seed' ? seedSessions(data.today) : sessions;
  await router.push('/log');
  await router.isReady();
  const wrapper = mount(LogPage, { global: { plugins: [pinia, router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, data, router };
}

const q = (sel) => document.querySelector(sel);
const text = (sel) => q(sel).textContent.trim();

beforeEach(function () { document.body.innerHTML = ''; vi.useRealTimers(); });
afterEach(function () { vi.useRealTimers(); });

describe('full log paging and period (fixture A)', function () {
  test('fixture A has 292 sessions', function () {
    expect(fixtureA(parseYmd('2026-10-24'))).toHaveLength(292);
  });

  test('shows 8 weeks, Show older weeks adds 8 and focuses the first new title', async function () {
    const { wrapper } = await mountLog(fixtureA(parseYmd('2026-10-24')));
    expect(document.querySelectorAll('.history-week')).toHaveLength(8);
    expect(text('#history-more')).toBe('Show older weeks (97 more)');
    expect(q('#history-more').hidden).toBe(false);
    expect(text('#history-count')).toBe('292');
    const titles = () => Array.from(document.querySelectorAll('.history-week-title'));
    q('#history-more').click();
    await flushPromises();
    expect(document.querySelectorAll('.history-week')).toHaveLength(16);
    expect(document.activeElement).toBe(titles()[8]);
    expect(text('#history-more')).toBe('Show older weeks (89 more)');
    wrapper.unmount();
  });

  test('period options and changing the period resets paging', async function () {
    const { wrapper } = await mountLog(fixtureA(parseYmd('2026-10-24')));
    const opts = () => Array.from(q('#history-period').options).map((o) => o.value);
    expect(opts()).toEqual(['all', '2026', '2025', '2024']);
    q('#history-more').click();
    await flushPromises();
    expect(document.querySelectorAll('.history-week')).toHaveLength(16);
    const sel = q('#history-period');
    sel.value = '2025';
    sel.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.querySelectorAll('.history-week').length).toBeLessThanOrEqual(8);
    expect(text('#history-count-unit')).toBe('logged in 2025');
    expect(q('#history-period').value).toBe('2025');
    wrapper.unmount();
  });

  test('week head: title and sum against the target', async function () {
    const { wrapper } = await mountLog(fixtureA(parseYmd('2026-10-24')));
    expect(text('.history-week-title')).toBe('This week, 19 to 25 Oct 2026');
    const sum = q('.history-week-sum span').textContent;
    expect(sum).toMatch(/^\d+ of 150 aerobic min/);
    wrapper.unmount();
  });
});

describe('full log with the sample (fixture B)', function () {
  test('tiles and intro for the sample', async function () {
    const { wrapper } = await mountLog('seed');
    expect(text('#history-count')).toBe('34');
    expect(text('#history-count-unit')).toBe('sessions logged');
    expect(text('#history-hit-label')).toBe('Weeks at 150');
    expect(text('#history-intro')).toContain('against your 150.');
    wrapper.unmount();
  });

  test('Remove shows the Undo bar, focuses Undo, and Undo restores and focuses the row Remove', async function () {
    const { wrapper } = await mountLog('seed');
    expect(q('#history-undo-bar').hidden).toBe(true);
    const first = q('#history-list tbody tr');
    const id = first.getAttribute('data-id');
    q('#hist-remove-' + id).click();
    await flushPromises();
    expect(q('#history-undo-bar').hidden).toBe(false);
    expect(text('#history-undo-text')).toBe('Removed Walk, 40 min, Mon 19 Oct.');
    expect(text('#history-count')).toBe('33');
    expect(document.activeElement).toBe(q('#history-undo'));
    q('#history-undo').click();
    await flushPromises();
    expect(text('#history-count')).toBe('34');
    expect(q('#history-undo-bar').hidden).toBe(true);
    expect(document.activeElement).toBe(q('#hist-remove-' + id));
    wrapper.unmount();
  });

  test('the Undo bar hides after 6 seconds', async function () {
    vi.useFakeTimers();
    const { wrapper } = await mountLog('seed');
    const id = q('#history-list tbody tr').getAttribute('data-id');
    q('#hist-remove-' + id).click();
    await flushPromises();
    expect(q('#history-undo-bar').hidden).toBe(false);
    vi.advanceTimersByTime(5900);
    await flushPromises();
    expect(q('#history-undo-bar').hidden).toBe(false);
    vi.advanceTimersByTime(200);
    await flushPromises();
    expect(q('#history-undo-bar').hidden).toBe(true);
    wrapper.unmount();
  });

  test('a gpx row links to its detail page, others have no Details', async function () {
    const { wrapper } = await mountLog('seed');
    const link = q('#hist-details-sample_32');
    expect(link.getAttribute('href')).toBe('/activity/sample_32?from=log');
    expect(link.textContent).toBe('Details');
    expect(link.getAttribute('aria-label')).toMatch(/^Details for Run, [A-Z][a-z]+day \d+ [A-Z][a-z]{2} 2026$/);
    expect(link.closest('tr').querySelector('.c-act').textContent).toBe('Run GPX Sample');
    expect(document.querySelectorAll('[id^="hist-details-"]')).toHaveLength(1);
    expect(q('#hist-remove-sample_32').getAttribute('aria-label')).toMatch(/^Remove Run, 18 minutes, /);
    wrapper.unmount();
  });

  test('back link goes to the week splits', async function () {
    const { wrapper } = await mountLog('seed');
    expect(q('#history-back').getAttribute('href')).toBe('/#splits');
    wrapper.unmount();
  });
});

describe('full log empty states', function () {
  test('no sessions shows the empty text and no list', async function () {
    const { wrapper } = await mountLog([]);
    expect(q('#history-empty').hidden).toBe(false);
    expect(text('#history-empty')).toBe('Nothing logged yet. Every session you log shows up here, grouped by week.');
    expect(q('#history-more').hidden).toBe(true);
    expect(text('#history-count')).toBe('0');
    wrapper.unmount();
  });

  test('under 5 hides the weeks at target tile and the Hit tag', async function () {
    const { wrapper, data } = await mountLog('seed');
    data.prefs.age = 3;
    await flushPromises();
    expect(q('#history-hit-tile').hidden).toBe(true);
    expect(document.querySelector('.history-week-sum .tag')).toBeNull();
    expect(text('#history-intro')).toContain('Each week shows its aerobic minutes.');
    wrapper.unmount();
  });
});
