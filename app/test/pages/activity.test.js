import { h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, RouterView } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppRouter } from '../../src/router.js';
import { useAuthStore } from '../../src/stores/auth.js';
import { useDataStore } from '../../src/stores/data.js';
import { parseYmd } from '../../src/core/dates.js';
import { seedSessions } from '../../src/core/sample.js';
import ActivityPage from '../../src/pages/ActivityPage.vue';

/* mounts the page itself, or a bare RouterView when viaRouter is set (so route changes reuse it as App.vue does) */
async function mountActivity(path, opts) {
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
  data.prefs.age = 30;
  data.sessions = opts.sessions || seedSessions(data.today);
  if (opts.tracks) data.tracks = opts.tracks;
  await router.push(path);
  await router.isReady();
  const component = opts.viaRouter ? { render: function () { return h(RouterView); } } : ActivityPage;
  const wrapper = mount(component, { global: { plugins: [pinia, router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, data, router };
}

const q = (sel) => document.querySelector(sel);
const text = (sel) => q(sel).textContent.trim();
const all = (sel) => Array.from(document.querySelectorAll(sel));
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(function () { document.body.innerHTML = ''; document.title = ''; });

describe('activity page for the sample run', function () {
  test('title, document title, back link to the log and four graphics', async function () {
    const { wrapper } = await mountActivity('/activity/sample_32?from=log');
    expect(text('#gpx-d-title')).toBe('Morning loop');
    expect(document.title).toBe('Morning loop, Weekly 150');
    expect(q('#activity-back').getAttribute('href')).toBe('/log');
    expect(text('#activity-back')).toBe('Back to the full log');
    expect(q('#gpx-d-body').querySelectorAll('svg')).toHaveLength(4);
    expect(q('#gpx-detail').hidden).toBe(false);
    expect(q('#activity-missing').hidden).toBe(true);
    wrapper.unmount();
  });

  test('from=week goes back to this week', async function () {
    const { wrapper } = await mountActivity('/activity/sample_32?from=week');
    expect(q('#activity-back').getAttribute('href')).toBe('/#splits');
    expect(text('#activity-back')).toBe('Back to this week');
    wrapper.unmount();
  });

  test('header: sample tag, meta line, effort from heart rate', async function () {
    const { wrapper } = await mountActivity('/activity/sample_32?from=log');
    expect(q('#gpx-d-sample').hidden).toBe(false);
    expect(text('#gpx-d-meta')).toMatch(/^Run · [A-Z][a-z]{2} \d+ [A-Z][a-z]{2} 2026, 06:10 · 18 min logged$/);
    expect(q('#gpx-d-effort').className).toBe('tag tag-vig');
    expect(text('#gpx-d-effort')).toBe('vigorous');
    expect(text('#gpx-d-basis')).toMatch(/^From your heart rate: average \d+ bpm is \d+% of your estimated max 190, so this is vigorous \(77% and up\)\.$/);
    expect(q('#gpx-d-hrnote').hidden).toBe(false);
    expect(q('#gpx-d-missing').hidden).toBe(true);
    expect(q('#gpx-d-device').hidden).toBe(true);
    expect(text('#gpx-d-privacy')).toBe('Saved to your account. Only you can see it.');
    wrapper.unmount();
  });

  test('stats, route, charts and splits', async function () {
    const { wrapper } = await mountActivity('/activity/sample_32?from=log');
    const labels = all('#gpx-d-stats .stat dt').map((e) => e.textContent);
    expect(labels.slice(0, 5)).toEqual(['Distance', 'Moving time', 'Elapsed time', 'Avg pace', 'Best km']);
    expect(q('#gpx-d-stats .stat dd .u').textContent).toBe('km');
    const cad = all('#gpx-d-stats .stat').find((e) => e.querySelector('dt').textContent === 'Avg cadence');
    expect(cad.querySelector('.n').textContent).toMatch(/^Counts one foot\. About \d+ steps per minute\.$/);
    expect(q('#gpx-d-route').getAttribute('aria-label')).toMatch(/^Route shape, .+, drawn from the GPS points without a map\. The green dot is the start and the red ring is the finish\.$/);
    expect(all('#gpx-d-route .rt-line').length).toBeGreaterThan(1);
    expect(all('#gpx-d-route .rt-km')).toHaveLength(2);
    expect(q('#gpx-d-route-legend').textContent).toBe('Lower heart rateHigherStartFinishNumbered dots every 1 km.');
    expect(q('#gpx-d-osm').getAttribute('href')).toMatch(/^https:\/\/www\.openstreetmap\.org\/\?mlat=-6\.\d{5}&mlon=106\.\d{5}#map=16\/-6\.\d{5}\/106\.\d{5}$/);
    expect(q('#gpx-d-osm').getAttribute('target')).toBe('_blank');
    expect(all('#gpx-d-charts svg').map((e) => e.id)).toEqual(['gpx-d-chart-pace', 'gpx-d-chart-ele', 'gpx-d-chart-hr']);
    expect(text('#gpx-d-read-pace')).toMatch(/^avg \d:\d\d \/km$/);
    expect(text('#gpx-d-read-ele')).toBe('');
    expect(q('#gpx-d-fig-pace figcaption').textContent).toBe('Faster is higher.');
    expect(q('#gpx-d-fig-hr figcaption')).toBeNull();
    expect(q('#gpx-d-chart-pace').getAttribute('tabindex')).toBe('0');
    expect(q('#gpx-d-chart-pace').getAttribute('aria-label')).toMatch(/^Pace over distance, from \d:\d\d \/km to \d:\d\d \/km\. Use the arrow keys to read values along the way\.$/);
    expect(q('#gpx-d-chart-ele .ch-area')).not.toBeNull();
    expect(q('#gpx-d-chart-pace .ch-area')).toBeNull();
    expect(text('#gpx-d-chart-help')).toBe('Point at a chart, or focus it and use the arrow keys, to read values at any distance.');
    expect(q('#gpx-d-live').getAttribute('role')).toBe('status');
    expect(text('#gpx-d-splits caption')).toBe('Splits per km');
    expect(all('#gpx-d-splits thead th').map((e) => e.textContent)).toEqual(['Split', 'Time', 'Pace /km', 'Avg HR', 'Elev m']);
    expect(all('#gpx-d-splits tbody tr')).toHaveLength(4);
    expect(q('#gpx-d-splits tbody tr.is-partial td').textContent).toMatch(/^Last \d+ m \(partial split\)$/);
    expect(text('#gpx-d-splits-note')).toBe('The last row is a partial split, shorter than a full km.');
    wrapper.unmount();
  });

  test('one crosshair: arrow keys move every chart and the route, and announce', async function () {
    const { wrapper } = await mountActivity('/activity/sample_32?from=log');
    const vis = () => all('.ch-cur, .rt-cur').map((e) => e.getAttribute('visibility'));
    expect(vis()).toEqual(['hidden', 'hidden', 'hidden', 'hidden']);
    key(q('#gpx-d-chart-ele'), 'ArrowRight');
    await flushPromises();
    expect(vis()).toEqual(['visible', 'visible', 'visible', 'visible']);
    const x = all('.ch-cur').map((e) => Number(e.getAttribute('x1')));
    expect(x[0]).toBeGreaterThan(46);
    expect(x[1]).toBe(x[0]);
    expect(text('#gpx-d-read-pace')).toMatch(/^\d:\d\d \/km at \d+ m$/);
    expect(text('#gpx-d-read-hr')).toMatch(/^\d+ bpm at \d+ m$/);
    expect(text('#gpx-d-live')).toMatch(/^Pace .+ at \d+ m\. Elevation \d+ m at \d+ m\. Heart rate \d+ bpm at \d+ m$/);
    key(q('#gpx-d-chart-pace'), 'End');
    await flushPromises();
    expect(text('#gpx-d-read-hr')).toMatch(/at 3\.\d\d km$/);
    key(q('#gpx-d-chart-pace'), 'Home');
    await flushPromises();
    expect(text('#gpx-d-read-hr')).toMatch(/at 0 m$/);
    key(q('#gpx-d-chart-pace'), 'a');
    await flushPromises();
    expect(text('#gpx-d-read-hr')).toMatch(/at 0 m$/);
    wrapper.unmount();
  });

  test('pointing at a chart moves the crosshair without announcing', async function () {
    const { wrapper } = await mountActivity('/activity/sample_32?from=log');
    const svg = q('#gpx-d-chart-hr');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 140, right: 360, bottom: 140, x: 0, y: 0 });
    svg.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 50, bubbles: true }));
    await flushPromises();
    expect(q('.rt-cur').getAttribute('visibility')).toBe('visible');
    expect(text('#gpx-d-read-ele')).toMatch(/^\d+ m at /);
    expect(text('#gpx-d-live')).toBe('');
    wrapper.unmount();
  });
});

describe('activity page, other states', function () {
  test('an unknown id shows not found', async function () {
    const { wrapper } = await mountActivity('/activity/nope?from=log');
    expect(q('#activity-missing').hidden).toBe(false);
    expect(q('#gpx-detail').hidden).toBe(true);
    expect(text('#activity-missing-title')).toBe('Activity not found');
    expect(q('#activity-missing-link').getAttribute('href')).toBe('/log');
    expect(document.title).toBe('Activity not found, Weekly 150');
    wrapper.unmount();
  });

  test('removing the session while the page is open shows not found', async function () {
    const { wrapper, data } = await mountActivity('/activity/sample_32?from=log');
    expect(q('#gpx-detail').hidden).toBe(false);
    data.removeSession('sample_32');
    await flushPromises();
    expect(q('#activity-missing').hidden).toBe(false);
    expect(q('#gpx-detail').hidden).toBe(true);
    expect(q('#gpx-d-body').querySelectorAll('svg')).toHaveLength(0);
    expect(document.title).toBe('Activity not found, Weekly 150');
    wrapper.unmount();
  });

  test('a GPX session whose route is gone, and a typed session', async function () {
    const sessions = [
      { id: 'g1', date: '2026-10-20', type: 'walk', minutes: 30, intensity: 'moderate', balance: false, source: 'gpx', sample: false, createdAt: 1, trackId: 't_gone' },
      { id: 'l1', date: '2026-10-21', type: 'cycle', minutes: 40, intensity: 'light', balance: false, source: 'log', sample: false, createdAt: 2 }
    ];
    let r = await mountActivity('/activity/g1', { sessions: sessions });
    expect(text('#gpx-d-title')).toBe('Walk');
    expect(document.title).toBe('Walk, Weekly 150');
    expect(text('#gpx-d-meta')).toBe('Walk · Tue 20 Oct · 30 min logged');
    expect(q('#gpx-d-sample').hidden).toBe(true);
    expect(q('#gpx-d-missing').hidden).toBe(false);
    expect(text('#gpx-d-missing')).toBe('The route for this session is no longer stored. Your account keeps the details of the 30 most recent imports. The session stays in your log.');
    expect(q('#gpx-d-body').querySelectorAll('*')).toHaveLength(0);
    expect(q('#activity-back').getAttribute('href')).toBe('/log');
    r.wrapper.unmount();
    r = await mountActivity('/activity/l1', { sessions: sessions });
    expect(text('#gpx-d-missing')).toBe('The route for this session was not stored with the import. The session is in your log.');
    expect(q('#gpx-d-effort').className).toBe('tag tag-neutral');
    expect(text('#gpx-d-basis')).toBe('');
    expect(q('#gpx-d-hrnote').hidden).toBe(true);
    r.wrapper.unmount();
  });
});

describe('activity page title', function () {
  test('keeps its own title after the router afterEach, also when only the query changes', async function () {
    const { wrapper, router } = await mountActivity('/log', { viaRouter: true });
    expect(document.title).toBe('Full log, Weekly 150');
    await router.push('/activity/sample_32?from=log');
    await flushPromises();
    expect(document.title).toBe('Morning loop, Weekly 150');
    await router.push('/activity/sample_32?from=week');
    await flushPromises();
    expect(document.title).toBe('Morning loop, Weekly 150');
    expect(text('#activity-back')).toBe('Back to this week');
    await router.push('/activity/nope');
    await flushPromises();
    expect(document.title).toBe('Activity not found, Weekly 150');
    await router.push('/log');
    await flushPromises();
    expect(document.title).toBe('Full log, Weekly 150');
    wrapper.unmount();
  });

  test('follows a new name for the session', async function () {
    const sessions = [{ id: 'g1', date: '2026-10-20', type: 'walk', minutes: 30, intensity: 'moderate', balance: false, source: 'gpx', sample: false, createdAt: 1, trackId: 't_gone' }];
    const { wrapper, data } = await mountActivity('/activity/g1', { sessions: sessions });
    expect(document.title).toBe('Walk, Weekly 150');
    data.sessions[0].type = 'run';
    await flushPromises();
    expect(document.title).toBe('Run, Weekly 150');
    wrapper.unmount();
  });
});
