import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppRouter } from '../../src/router.js';
import { useAuthStore } from '../../src/stores/auth.js';
import { useDataStore } from '../../src/stores/data.js';
import { useUiStore } from '../../src/stores/ui.js';
import { parseYmd, ymd } from '../../src/core/dates.js';
import WeekPage from '../../src/pages/WeekPage.vue';

/* 2026-10-24 is a Saturday; the Garmin run starts on Tue 6 Oct 2026 with an average heart rate of 144 */
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
  data.sessions = [];
  data.meta.sampleActive = false;
  data.ready = true;
  return { pinia, router, auth, data, ui: useUiStore(pinia) };
}

async function mountWeek(opts) {
  const s = setup(opts);
  await s.router.push('/');
  await s.router.isReady();
  const wrapper = mount(WeekPage, { global: { plugins: [s.pinia, s.router] }, attachTo: document.body });
  mounted.push(wrapper);
  await flushPromises();
  return Object.assign(s, { wrapper: wrapper });
}

const q = (sel) => document.querySelector(sel);
const text = (sel) => q(sel).textContent.trim();

function fixture(name, edit) {
  let t = readFileSync('tools/gpx/fixtures/' + name, 'utf8');
  if (edit) t = edit(t);
  return new File([t], name, { type: 'application/gpx+xml' });
}

function dropFiles(sel, files) {
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'], files: files, dropEffect: 'none' } });
  q(sel).dispatchEvent(ev);
  return ev;
}

function pickFiles(files) {
  const inp = q('#gpx-file');
  Object.defineProperty(inp, 'files', { value: files, configurable: true });
  inp.dispatchEvent(new Event('change'));
}

async function reviewShown() {
  await vi.waitFor(function () { expect(q('#gpx-review').hidden).toBe(false); });
  await flushPromises();
}

async function settle() {
  await flushPromises();
  await new Promise(function (r) { setTimeout(r, 20); });
  await flushPromises();
}

/* a failed assertion skips the test's own unmount; this one keeps the window guard from leaking into the next test */
let mounted = [];
beforeEach(function () {
  document.body.innerHTML = '';
  localStorage.clear();
});
afterEach(function () {
  mounted.forEach(function (w) { try { w.unmount(); } catch (e) { /* already unmounted */ } });
  mounted = [];
  vi.restoreAllMocks();
});

describe('GPX import controls', function () {
  test('the bar, the log panel drop zone and the hidden file input render with the reference copy', async function () {
    const { wrapper } = await mountWeek();
    expect(text('#gpx-pick-splits')).toBe('Import a GPX file');
    expect(text('#gpx-bar-help')).toBe('Or drop .gpx files here. You can pick several. Only you can see your imports.');
    expect(text('#gpx-pick-log')).toBe('Import GPX');
    expect(text('#gpx-drop-label')).toBe('From a watch or app');
    expect(text('#gpx-drop-help')).toBe('Pick or drop a .gpx file from a run, ride, walk or open-water swim. You check it before it is saved. Only you can see your imports.');
    expect(q('#gpx-drop').closest('#log')).not.toBeNull();
    expect(q('#gpx-file').getAttribute('accept')).toBe('.gpx,application/gpx+xml');
    expect(q('#gpx-file').multiple).toBe(true);
    expect(q('#gpx-review').hidden).toBe(true);
    expect(q('#gpx-errors').hidden).toBe(true);
    expect(q('#gpx-last').hidden).toBe(true);
    wrapper.unmount();
  });

  test('both pick buttons open the one file input', async function () {
    const { wrapper } = await mountWeek();
    const click = vi.spyOn(q('#gpx-file'), 'click').mockImplementation(function () {});
    q('#gpx-pick-log').click();
    q('#gpx-pick-splits').click();
    expect(click).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});

describe('GPX review card', function () {
  test('a Garmin run opens the review with effort from heart rate when the age is set', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    pickFiles([fixture('garmin-run-hr-ele.gpx')]);
    await reviewShown();
    expect(text('#gpx-r-title')).toBe('Check this import');
    expect(text('#gpx-r-count')).toBe('Import review');
    expect(text('#gpx-r-file')).toBe('File: garmin-run-hr-ele.gpx');
    const dts = Array.from(document.querySelectorAll('#gpx-r-read dt')).map(function (e) { return e.textContent; });
    expect(dts).toEqual(['Name', 'Start', 'Distance', 'Moving time', 'Avg pace', 'Avg heart rate']);
    expect(document.querySelectorAll('#gpx-r-read dd')[0].textContent).toBe('Morning Run');
    expect(document.querySelectorAll('#gpx-r-read dd')[5].textContent).toBe('144 bpm');
    expect(q('#gpx-type').value).toBe('run');
    expect(q('#gpx-type-note').hidden).toBe(true);
    expect(q('#gpx-date').value).toBe(ymd(new Date(1791268202000)));
    expect(q('#gpx-minutes').value).toBe('10');
    expect(text('#gpx-minutes-note')).toBe('Moving time 10:00, rounded to whole minutes.');
    expect(text('#gpx-basis')).toBe('From your heart rate: average 144 bpm is 76% of your estimated max 190, so this is moderate (64% to 76%).');
    expect(q('#gpx-int-mod').checked).toBe(true);
    expect(q('#gpx-set-age').hidden).toBe(true);
    expect(q('#gpx-dup').hidden).toBe(true);
    expect(text('#gpx-save')).toBe('Save to log');
    expect(text('#gpx-cancel')).toBe('Cancel');
    expect(document.activeElement).toBe(q('#gpx-r-title'));
    wrapper.unmount();
  });

  test('without an age the review explains it and offers Set my age; setting the age re-judges the effort', async function () {
    const { wrapper, data } = await mountWeek({ age: null });
    dropFiles('#gpx-bar', [fixture('garmin-run-hr-ele.gpx')]);
    await reviewShown();
    expect(text('#gpx-basis').startsWith('Heart rate needs your age, which is not set yet, so effort comes from speed')).toBe(true);
    expect(q('#gpx-set-age').hidden).toBe(false);
    await wrapper.find('#gpx-set-age').trigger('click');
    await flushPromises();
    expect(document.activeElement).toBe(q('#age-input'));
    data.setAge(30);
    await flushPromises();
    expect(text('#gpx-basis')).toBe('From your heart rate: average 144 bpm is 76% of your estimated max 190, so this is moderate (64% to 76%).');
    expect(q('#gpx-set-age').hidden).toBe(true);
    wrapper.unmount();
  });

  test('Save adds a gpx session with its stored track and links to the activity page', async function () {
    const { wrapper, data } = await mountWeek({ age: 30 });
    pickFiles([fixture('garmin-run-hr-ele.gpx')]);
    await reviewShown();
    await wrapper.find('#gpx-review').trigger('submit');
    await flushPromises();
    expect(data.sessions.length).toBe(1);
    const s = data.sessions[0];
    expect(s.source).toBe('gpx');
    expect(s.type).toBe('run');
    expect(s.minutes).toBe(10);
    expect(s.intensity).toBe('moderate');
    expect(s.trackId).toMatch(/^t_/);
    const rec = data.tracks[s.trackId];
    expect(rec).toBeTruthy();
    expect(rec.name).toBe('Morning Run');
    expect(rec.classification.basis).toBe('hr');
    expect(rec.metrics.distanceM).toBeCloseTo(1802.8, 0);
    expect(q('#gpx-review').hidden).toBe(true);
    expect(text('#gpx-status')).toBe('Saved to Tue 6 Oct: Run, 10 min, moderate. It counts toward that week.');
    expect(q('#gpx-last').hidden).toBe(false);
    expect(q('#gpx-last-link').getAttribute('href')).toBe('/activity/' + s.id + '?from=week');
    expect(text('#gpx-last-link')).toBe('See the details of this import');
    expect(document.activeElement).toBe(q('#gpx-last-link'));
    wrapper.unmount();
  });

  test('a file that is not GPX lists an error and imports nothing', async function () {
    const { wrapper, data } = await mountWeek();
    pickFiles([fixture('not-gpx.xml')]);
    await vi.waitFor(function () { expect(q('#gpx-errors').hidden).toBe(false); });
    await settle();
    const items = document.querySelectorAll('#gpx-errors li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('not-gpx.xml: This is not a GPX file.');
    expect(q('#gpx-review').hidden).toBe(true);
    expect(data.sessions.length).toBe(0);
    expect(Object.keys(data.tracks).length).toBe(0);
    expect(document.activeElement).toBe(q('#gpx-pick-splits'));
    wrapper.unmount();
  });

  test('importing the same file twice shows the duplicate note', async function () {
    const { wrapper, data } = await mountWeek();
    pickFiles([fixture('garmin-run-hr-ele.gpx')]);
    await reviewShown();
    await wrapper.find('#gpx-review').trigger('submit');
    await flushPromises();
    expect(q('#gpx-review').hidden).toBe(true);
    pickFiles([fixture('garmin-run-hr-ele.gpx')]);
    await reviewShown();
    expect(q('#gpx-last').hidden).toBe(true);
    expect(q('#gpx-dup').hidden).toBe(false);
    expect(text('#gpx-dup')).toBe('You already imported this activity (Run on Tue 6 Oct, 1.80 km). Skip it, or save it again as a second session.');
    expect(text('#gpx-save')).toBe('Save again');
    expect(text('#gpx-cancel')).toBe('Skip this file');
    await wrapper.find('#gpx-cancel').trigger('click');
    await flushPromises();
    expect(text('#gpx-status')).toBe('Skipped garmin-run-hr-ele.gpx.');
    expect(data.sessions.length).toBe(1);
    wrapper.unmount();
  });

  test('a date older than 5 years shows the date error and blocks Save', async function () {
    const { wrapper, data } = await mountWeek();
    pickFiles([fixture('garmin-run-hr-ele.gpx', function (t) { return t.split('2026-10-').join('2020-10-'); })]);
    await reviewShown();
    expect(q('#gpx-date-err').hidden).toBe(false);
    expect(text('#gpx-date-err')).toContain('Imports go back 5 years, so pick a newer date or skip this file.');
    expect(q('#gpx-date').getAttribute('aria-invalid')).toBe('true');
    await wrapper.find('#gpx-review').trigger('submit');
    await flushPromises();
    expect(data.sessions.length).toBe(0);
    expect(document.activeElement).toBe(q('#gpx-date'));
    wrapper.unmount();
  });

  test('bad minutes show the minutes error on Save', async function () {
    const { wrapper, data } = await mountWeek();
    pickFiles([fixture('garmin-run-hr-ele.gpx')]);
    await reviewShown();
    await wrapper.find('#gpx-minutes').setValue('0');
    await wrapper.find('#gpx-review').trigger('submit');
    await flushPromises();
    expect(q('#gpx-minutes-err').hidden).toBe(false);
    expect(text('#gpx-minutes-err')).toBe('Enter minutes from 1 to 240.');
    expect(data.sessions.length).toBe(0);
    expect(document.activeElement).toBe(q('#gpx-minutes'));
    wrapper.unmount();
  });

  test('two files show the count, then a batch summary', async function () {
    const { wrapper, data } = await mountWeek();
    dropFiles('#gpx-drop', [fixture('garmin-run-hr-ele.gpx'), fixture('strava-ride-power.gpx')]);
    await reviewShown();
    expect(text('#gpx-r-count')).toBe('Import review, file 1 of 2');
    expect(text('#gpx-cancel')).toBe('Skip this file');
    await wrapper.find('#gpx-cancel').trigger('click');
    await vi.waitFor(function () { expect(q('#gpx-review').hidden).toBe(false); expect(text('#gpx-r-file')).toBe('File: strava-ride-power.gpx'); });
    expect(text('#gpx-r-count')).toBe('Import review, file 2 of 2');
    await flushPromises();
    expect(q('#gpx-type').value).toBe('cycle');
    await wrapper.find('#gpx-review').trigger('submit');
    await flushPromises();
    expect(data.sessions.length).toBe(1);
    expect(text('#gpx-status')).toBe('Imported 1 of 2 files.');
    expect(document.activeElement).toBe(q('#gpx-last-link'));
    wrapper.unmount();
  });

  test('changing the activity re-reads the file for that type', async function () {
    const { wrapper } = await mountWeek();
    pickFiles([fixture('garmin-run-hr-ele.gpx')]);
    await reviewShown();
    await wrapper.find('#gpx-type').setValue('cycle');
    await flushPromises();
    const dts = Array.from(document.querySelectorAll('#gpx-r-read dt')).map(function (e) { return e.textContent; });
    expect(dts).toContain('Avg speed');
    wrapper.unmount();
  });
});

describe('drop guard', function () {
  test('a file dropped outside the drop zones does not replace the page, and the guard goes on unmount', async function () {
    const { wrapper } = await mountWeek();
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(over, 'dataTransfer', { value: { types: ['Files'] } });
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [] } });
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    wrapper.unmount();
    const after = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(after, 'dataTransfer', { value: { types: ['Files'] } });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  test('a drop zone marks itself while files are over it', async function () {
    const { wrapper } = await mountWeek();
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(over, 'dataTransfer', { value: { types: ['Files'], dropEffect: 'none' } });
    q('#gpx-bar').dispatchEvent(over);
    await flushPromises();
    expect(q('#gpx-bar').classList.contains('is-over')).toBe(true);
    expect(over.dataTransfer.dropEffect).toBe('copy');
    wrapper.unmount();
  });
});
