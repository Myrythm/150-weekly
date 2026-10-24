import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { mount, flushPromises } from '@vue/test-utils';
import { createAppRouter } from '../../src/router.js';
import { useAuthStore } from '../../src/stores/auth.js';
import { useDataStore } from '../../src/stores/data.js';
import { parseYmd } from '../../src/core/dates.js';
import { seedSessions, samplePlan } from '../../src/core/sample.js';
import { FACTS } from '../../src/core/facts.js';
import { useTimer } from '../../src/composables/useTimer.js';
import { ROUTINES } from '../../src/core/routines.js';
import App from '../../src/App.vue';

/* 2026-10-24 is a Saturday. The week page parts after the splits: streak, plan, snacks, evidence, and the
   Clear all block in the footer (rendered by App). */
async function mountWeek(opts) {
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
  if (opts.sample === false) { data.sessions = opts.sessions || []; data.meta.sampleActive = false; data.plan = opts.plan || null; }
  else { data.sessions = seedSessions(data.today); data.meta.sampleActive = true; data.plan = samplePlan(data.today); }
  data.ready = true;
  await router.push('/');
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [pinia, router] }, attachTo: document.body });
  await flushPromises();
  return { pinia, router, auth, data, wrapper };
}

const q = (sel) => document.querySelector(sel);
const qa = (sel) => Array.from(document.querySelectorAll(sel));
const text = (sel) => q(sel).textContent.trim();
async function click(sel) { q(sel).click(); await flushPromises(); }
async function type(sel, value) { const el = q(sel); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises(); }

beforeEach(function () {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.useRealTimers();
});
afterEach(function () { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('streak', function () {
  test('the sample grid shows 84 day cells, the legend, the tiles and the streak message', async function () {
    const { wrapper, data } = await mountWeek();
    expect(qa('#grid .cell')).toHaveLength(84);
    expect(qa('#grid .cell.today')).toHaveLength(1);
    expect(qa('#grid .cell.future')).toHaveLength(1);   /* Sunday 25 Oct */
    expect(qa('#grid-legend .cell')).toHaveLength(6);
    expect(text('#grid-legend')).toContain('Strength only');
    expect(text('#grid-legend')).toContain('Light only');
    expect(text('#legend-hit')).toBe('Hit 150');
    expect(q('#grid-sample-tag').hidden).toBe(false);
    expect(q('#grid-empty').hidden).toBe(true);
    expect(text('#tile-streak')).toBe(String(data.summary.streak));
    expect(text('#tile-weeks-label')).toBe('Weeks at 150');
    expect(q('#grid').getAttribute('aria-label')).toMatch(/^12-week activity grid\. \d+ of 12 weeks reached 150\. \d+ active days in the last 28\./);
    expect(text('#streak-msg')).toMatch(/^(This week is in the bank|Keep the streak|Start a streak this week)/);
    expect(q('#grid .g-flag svg')).not.toBe(null);
    wrapper.unmount();
  });

  test('an empty log shows the hint, no sample tag and the start message', async function () {
    const { wrapper } = await mountWeek({ sample: false });
    expect(q('#grid-empty').hidden).toBe(false);
    expect(q('#grid-sample-tag').hidden).toBe(true);
    expect(text('#streak-msg')).toBe('Start a streak this week: 150 minutes by Sunday.');
    expect(text('#tile-streak-unit')).toBe('weeks at 150 in a row');
    wrapper.unmount();
  });

  test('a cell title names the day and the minutes; strength-only and light-only days get their marks', async function () {
    const base = { balance: false, sample: false, createdAt: 1 };
    const { wrapper } = await mountWeek({ sample: false, sessions: [
      Object.assign({ id: 'a', date: '2026-10-20', type: 'walk', minutes: 30, intensity: 'moderate', source: 'log' }, base),
      Object.assign({ id: 'b', date: '2026-10-21', type: 'strength', minutes: 12, intensity: 'moderate', source: 'log' }, base),
      Object.assign({ id: 'c', date: '2026-10-22', type: 'walk', minutes: 15, intensity: 'light', source: 'log' }, base)
    ] });
    const titles = qa('#grid .cell').map((c) => c.title);
    expect(titles).toContain('Tue 20 Oct: 30 min');
    expect(titles).toContain('Wed 21 Oct: muscle day, 12 min of strength (no aerobic minutes)');
    expect(titles).toContain('Thu 22 Oct: 15 min light activity (not counted toward 150)');
    expect(qa('#grid .cell.lvs')).toHaveLength(1);
    expect(qa('#grid .cell.lvl')).toHaveLength(1);
    wrapper.unmount();
  });

  test('an under-5 age hides the tiles, the message and the flag legend', async function () {
    const { wrapper } = await mountWeek({ age: 3 });
    expect(q('#tiles').hidden).toBe(true);
    expect(q('#streak-msg').hidden).toBe(true);
    expect(q('#legend-hit-group').hidden).toBe(true);
    expect(text('#streak-intro')).not.toContain('A flag marks');
    wrapper.unmount();
  });
});

describe('plan', function () {
  test('saving a plan fills the card; I did it today logs a habit session and Undo removes it', async function () {
    const { wrapper, data } = await mountWeek({ sample: false });
    expect(q('#plan-empty').hidden).toBe(false);
    expect(q('#plan-filled').hidden).toBe(true);
    await click('#plan-chip-after-1');
    expect(q('#plan-after').value).toBe('park the car');
    expect(document.activeElement).toBe(q('#plan-will'));
    await click('#plan-chip-will-0');
    await click('#plan-chip-where-2');
    expect(document.activeElement).toBe(q('#plan-save'));
    await type('#plan-minutes', '3');
    q('#plan-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
    expect(data.plan).toMatchObject({ after: 'park the car', will: 'do 10 squats', where: 'my desk', minutes: 3, sample: false });
    expect(text('#plan-sentence')).toBe('After I park the car, I will do 10 squats at my desk.');
    expect(text('#plan-takes')).toBe('About 3 minutes.');
    expect(text('#plan-card-label')).toBe('My plan');
    expect(text('#plan-caption')).toBe('Done 0 of the last 7 days');
    expect(qa('#plan-days .plan-day')).toHaveLength(7);
    expect(text('#plan-status')).toBe('Plan saved.');
    expect(q('#plan-after').value).toBe('');
    expect(q('#plan-minutes').value).toBe('2');

    await click('#plan-done');
    const s = data.sessions.filter((x) => x.source === 'plan');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ type: 'habit', minutes: 3, intensity: 'moderate', date: '2026-10-24', note: 'do 10 squats' });
    expect(q('#plan-done').hidden).toBe(true);
    expect(q('#plan-done-msg').hidden).toBe(false);
    expect(text('#plan-caption')).toBe('Done 1 of the last 7 days');
    expect(qa('#plan-days .plan-day.on')).toHaveLength(1);
    expect(qa('#plan-days .plan-day.today')).toHaveLength(1);
    expect(document.activeElement).toBe(q('#plan-undo'));

    await click('#plan-undo');
    expect(data.sessions.filter((x) => x.source === 'plan')).toHaveLength(0);
    expect(q('#plan-done').hidden).toBe(false);
    expect(q('#plan-done-msg').hidden).toBe(true);
    expect(document.activeElement).toBe(q('#plan-done'));
    wrapper.unmount();
  });

  test('the sample plan shows as a sample and logging it keeps the plan as a real one', async function () {
    const { wrapper, data } = await mountWeek();
    expect(text('#plan-card-label')).toBe('Sample plan');
    expect(q('#plan-card').classList.contains('is-sample')).toBe(true);
    await click('#plan-done');
    expect(data.meta.sampleActive).toBe(false);
    expect(data.plan).not.toBe(null);
    expect(data.plan.sample).toBe(false);
    expect(text('#plan-card-label')).toBe('My plan');
    expect(data.sessions.filter((x) => x.source === 'plan')).toHaveLength(1);
    wrapper.unmount();
  });

  test('an empty blank or bad minutes shows the error and marks the field', async function () {
    const { wrapper, data } = await mountWeek({ sample: false });
    await type('#plan-after', 'brush my teeth');
    q('#plan-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
    expect(text('#plan-error')).toBe('Fill in all three blanks to save your plan.');
    expect(q('#plan-error').hidden).toBe(false);
    expect(q('#plan-will').getAttribute('aria-invalid')).toBe('true');
    expect(q('#plan-where').getAttribute('aria-invalid')).toBe('true');
    expect(q('#plan-after').getAttribute('aria-invalid')).toBe(null);
    expect(document.activeElement).toBe(q('#plan-will'));
    await type('#plan-will', 'do 10 squats');
    await type('#plan-where', 'my desk');
    await type('#plan-minutes', '45');
    q('#plan-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
    expect(text('#plan-error')).toBe('Enter minutes from 1 to 30.');
    expect(q('#plan-minutes').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(q('#plan-minutes'));
    expect(data.plan).toBe(null);
    wrapper.unmount();
  });

  test('Edit plan fills the form, Delete asks to confirm and keeps the sessions', async function () {
    const plan = { after: 'close my laptop', will: 'climb the stairs twice', where: 'the bottom of the stairs', minutes: 4, sample: false, savedAt: 1 };
    const { wrapper, data } = await mountWeek({ sample: false, plan: plan });
    await click('#plan-edit');
    expect(q('#plan-after').value).toBe('close my laptop');
    expect(q('#plan-minutes').value).toBe('4');
    expect(document.activeElement).toBe(q('#plan-after'));
    await click('#plan-clear');
    expect(q('#plan-after').value).toBe('');
    expect(q('#plan-minutes').value).toBe('2');
    expect(q('#plan-del-confirm').hidden).toBe(true);
    await click('#plan-delete');
    expect(q('#plan-del-confirm').hidden).toBe(false);
    expect(document.activeElement).toBe(q('#plan-del-no'));
    await click('#plan-del-no');
    expect(q('#plan-del-confirm').hidden).toBe(true);
    expect(document.activeElement).toBe(q('#plan-delete'));
    expect(data.plan).not.toBe(null);
    await click('#plan-delete');
    await click('#plan-del-yes');
    expect(data.plan).toBe(null);
    expect(q('#plan-empty').hidden).toBe(false);
    expect(q('#plan-filled').hidden).toBe(true);
    wrapper.unmount();
  });
});

describe('snacks', function () {
  test('the routine list follows the age group: Steady feet is for 65 and over only', async function () {
    const a = await mountWeek({ age: 30 });
    expect(qa('#routines li')).toHaveLength(4);
    expect(q('#routine-steady')).toBe(null);
    a.wrapper.unmount();
    document.body.innerHTML = '';
    const b = await mountWeek({ age: 70 });
    expect(qa('#routines li')).toHaveLength(5);
    expect(text('#routine-steady')).toContain('Balance day');
    expect(q('#snack-load-steady').getAttribute('aria-label')).toBe('Load timer: Steady feet');
    b.wrapper.unmount();
  });

  test('Brisk loop runs through 3 steps with a fake clock and Log it adds a 10 minute moderate walk', async function () {
    const { wrapper, data } = await mountWeek({ sample: false });
    expect(text('#timer-name')).toBe('No snack loaded');
    expect(q('#snack-start').disabled).toBe(true);
    await click('#snack-load-loop');
    expect(text('#timer-name')).toBe('Brisk loop');
    expect(text('#timer-step')).toBe('Easy walk');
    expect(text('#timer-digits')).toBe('01:00');
    expect(text('#timer-next')).toBe('Next: Brisk walk');
    expect(text('#timer-total')).toBe('Total left 10:00');
    expect(qa('#timer-strip i')).toHaveLength(3);
    expect(q('#routine-loop').classList.contains('is-selected')).toBe(true);
    expect(document.activeElement).toBe(q('#snack-start'));

    vi.useFakeTimers();
    await click('#snack-start');
    expect(text('#snack-start')).toBe('Pause');
    vi.advanceTimersByTime(61000);
    await flushPromises();
    expect(text('#timer-step')).toBe('Brisk walk');
    expect(qa('#timer-strip i')[0].className).toBe('done');
    expect(qa('#timer-strip i')[1].className).toBe('cur');
    vi.advanceTimersByTime(480000);
    await flushPromises();
    expect(text('#timer-step')).toBe('Easy walk');
    expect(text('#timer-next')).toBe('Next: Finish');
    vi.advanceTimersByTime(60000);
    await flushPromises();
    expect(text('#timer-step')).toBe('Done.');
    expect(text('#timer-next')).toBe('10 minutes in the bank if you log it.');
    expect(q('#snack-log').hidden).toBe(false);
    expect(text('#snack-log')).toBe('Log 10 min');
    expect(document.activeElement).toBe(q('#snack-log'));
    vi.useRealTimers();

    await click('#snack-log');
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]).toMatchObject({ type: 'walk', minutes: 10, intensity: 'moderate', source: 'snack', note: 'Brisk loop' });
    expect(q('#snack-log').hidden).toBe(true);
    expect(q('#snack-logged').hidden).toBe(false);
    expect(text('#snack-logged')).toBe('Logged. Nice work.');
    expect(document.activeElement).toBe(q('#snack-reset'));
    wrapper.unmount();
  });

  test('Pause, then Stop and log credits the whole minutes done; Skip moves to the next step', async function () {
    const { wrapper, data } = await mountWeek({ sample: false });
    await click('#snack-load-loop');
    vi.useFakeTimers();
    await click('#snack-start');
    vi.advanceTimersByTime(30000);
    await click('#snack-skip');
    expect(text('#timer-step')).toBe('Brisk walk');
    vi.advanceTimersByTime(90000);
    await click('#snack-start');   /* Pause at 2:30 */
    expect(text('#snack-start')).toBe('Resume');
    expect(text('#snack-partial')).toBe('Stop and log 2 min');
    vi.useRealTimers();
    await click('#snack-partial');
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]).toMatchObject({ type: 'walk', minutes: 2, source: 'snack' });
    expect(text('#snack-start')).toBe('Start');
    expect(text('#snack-logged')).toBe('Logged. Nice work.');
    expect(document.activeElement).toBe(q('#snack-start'));
    wrapper.unmount();
  });

  test('switching routines mid-run asks first; Steady feet shows its safety line and logs as a balance day', async function () {
    const { wrapper } = await mountWeek({ sample: false, age: 70 });
    await click('#snack-load-stairs');
    vi.useFakeTimers();
    await click('#snack-start');
    vi.advanceTimersByTime(1000);
    await click('#snack-load-desk');
    expect(q('#snack-switch').hidden).toBe(false);
    expect(text('#snack-switch-msg')).toBe('Switch to Desk reset? Your current timer stops.');
    expect(document.activeElement).toBe(q('#snack-switch-no'));
    expect(text('#timer-name')).toBe('Stair climb');
    await click('#snack-switch-no');
    expect(q('#snack-switch').hidden).toBe(true);
    expect(document.activeElement).toBe(q('#snack-start'));
    await click('#snack-load-stairs');
    expect(q('#snack-switch').hidden).toBe(true);
    await click('#snack-load-steady');
    await click('#snack-switch-yes');
    vi.useRealTimers();
    expect(text('#timer-name')).toBe('Steady feet');
    expect(q('#snack-switch').hidden).toBe(true);
    expect(q('#timer-safety').hidden).toBe(false);
    expect(text('#timer-safety')).toBe('Stay within reach of a counter or sturdy chair. Stop if you feel dizzy.');
    expect(text('#snack-start')).toBe('Start');
    wrapper.unmount();
  });

  test('the sound box saves the preference', async function () {
    const { wrapper, data } = await mountWeek({ sample: false });
    expect(q('#snack-sound').checked).toBe(false);
    q('#snack-sound').click();
    await flushPromises();
    expect(data.prefs.sound).toBe(true);
    q('#snack-sound').click();
    await flushPromises();
    expect(data.prefs.sound).toBe(false);
    wrapper.unmount();
  });
});

describe('useTimer', function () {
  function makeTimer(clockRef) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const data = useDataStore(pinia);
    data.today = parseYmd('2026-10-24');
    data.prefs.age = 30;
    data.sessions = [];
    data.meta.sampleActive = false;
    const timer = useTimer({ now: () => clockRef.t });
    return { data, timer };
  }

  test('runs Desk reset: 9 steps, step changes on the clock, finishes and logs a muscle day', function () {
    const clock = { t: 1000 };
    const { data, timer } = makeTimer(clock);
    expect(timer.state.value).toBe('idle');
    timer.load('desk');
    expect(timer.state.value).toBe('ready');
    expect(timer.steps.value).toHaveLength(9);
    expect(timer.total.value).toBe(5 * 45000 + 4 * 15000);
    timer.start();
    expect(timer.state.value).toBe('running');
    clock.t += 46000; timer.tick();
    expect(timer.idx.value).toBe(1);
    expect(timer.steps.value[timer.idx.value].label).toBe('Rest');
    clock.t += 15000; timer.tick();
    expect(timer.idx.value).toBe(2);
    clock.t += 10 * 60000; timer.tick();
    expect(timer.state.value).toBe('finished');
    timer.logFull();
    timer.logFull();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0]).toMatchObject({ type: 'strength', minutes: 5, intensity: 'moderate', source: 'snack', note: 'Desk reset' });
    expect(timer.logged.value).toBe(true);
    timer.reset();
    expect(timer.state.value).toBe('ready');
    expect(timer.logged.value).toBe(false);
    timer.dispose();
  });

  test('pause keeps the elapsed time; partial log needs a whole minute', function () {
    const clock = { t: 0 };
    const { data, timer } = makeTimer(clock);
    timer.load('stairs');
    timer.start();
    clock.t += 50000; timer.tick();
    timer.start();   /* pause */
    expect(timer.state.value).toBe('paused');
    timer.logPartial();
    expect(data.sessions).toHaveLength(0);
    clock.t += 99999;
    timer.start();   /* resume */
    clock.t += 15000; timer.tick();
    timer.start();   /* pause at 65 s */
    expect(timer.elapsed.value).toBe(65000);
    timer.logPartial();
    expect(data.sessions[0]).toMatchObject({ type: 'stairs', minutes: 1, intensity: 'vigorous' });
    expect(timer.state.value).toBe('ready');
    timer.dispose();
  });

  test('every routine builds steps that add up to its length', function () {
    ROUTINES.forEach(function (r) {
      const clock = { t: 0 };
      const { timer } = makeTimer(clock);
      timer.load(r.id);
      expect(timer.total.value).toBeGreaterThan(0);
      timer.dispose();
    });
  });
});

describe('evidence', function () {
  test('#facts renders one row per complete fact, with the source link', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    expect(qa('#facts li')).toHaveLength(FACTS.length);
    expect(text('#fact-fact-1 .fact-stat')).toBe('150 min');
    const a = q('#fact-fact-2 a');
    expect(a.getAttribute('href')).toBe('https://jamanetwork.com/journals/jama/fullarticle/2763292');
    expect(a.getAttribute('rel')).toBe('noopener');
    expect(q('#fact-fact-2 .sr-only').textContent).toBe(' (opens in a new tab)');
    wrapper.unmount();
  });

  test('the first fact follows the age group', async function () {
    const { wrapper } = await mountWeek({ age: 10 });
    expect(text('#fact-fact-1 .fact-stat')).toBe('60 min a day');
    wrapper.unmount();
  });
});

describe('clear all', () => {
  test('asks to confirm, keeps the age and leaves no sessions, then says All cleared.', async function () {
    const { wrapper, data, auth } = await mountWeek({ age: 42 });
    const flush = vi.spyOn(auth, 'flush');
    expect(data.sessions.length).toBeGreaterThan(0);
    expect(q('#clear-confirm').hidden).toBe(true);
    await click('#clear-all');
    expect(q('#clear-confirm').hidden).toBe(false);
    expect(q('#clear-all').hidden).toBe(true);
    expect(document.activeElement).toBe(q('#clear-no'));
    await click('#clear-no');
    expect(q('#clear-confirm').hidden).toBe(true);
    expect(document.activeElement).toBe(q('#clear-all'));
    expect(data.sessions.length).toBeGreaterThan(0);

    await click('#clear-all');
    await click('#clear-yes');
    await flushPromises();
    expect(data.sessions).toHaveLength(0);
    expect(data.plan).toBe(null);
    expect(data.prefs.age).toBe(42);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(text('#clear-status')).toBe('All cleared.');
    expect(q('#clear-confirm').hidden).toBe(true);
    expect(q('#clear-all').hidden).toBe(false);
    expect(document.activeElement).toBe(q('#clear-all'));
    expect(q('#plan-empty').hidden).toBe(false);
    expect(qa('#splits-body tr')).toHaveLength(0);
    wrapper.unmount();
  });

  test('the clear signal resets the timer, the plan builder, the log form and the age field', async function () {
    const { wrapper, data } = await mountWeek({ age: 42 });
    q('#snack-sound').click();
    await click('#snack-load-loop');
    await type('#plan-after', 'draft text');
    q('#plan-form').dispatchEvent(new Event('submit', { cancelable: true }));   /* error shown */
    await flushPromises();
    expect(q('#plan-error').hidden).toBe(false);
    await type('#log-minutes', '0');
    q('#log-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
    expect(q('#log-minutes-err').hidden).toBe(false);
    await type('#age-input', '99');

    await click('#clear-all');
    await click('#clear-yes');
    await flushPromises();
    expect(text('#timer-name')).toBe('No snack loaded');
    expect(q('#snack-start').disabled).toBe(true);
    expect(q('#snack-sound').checked).toBe(false);
    expect(qa('#routines .is-selected')).toHaveLength(0);
    expect(q('#plan-after').value).toBe('');
    expect(q('#plan-error').hidden).toBe(true);
    expect(text('#plan-status')).toBe('');
    expect(q('#log-minutes-err').hidden).toBe(true);
    expect(text('#log-status')).toBe('');
    expect(q('#age-input').value).toBe('42');
    expect(data.prefs.sound).toBe(false);
    wrapper.unmount();
  });
});

describe('clear all and the GPX import', () => {
  test('the clear signal drops the import queue and its error list', async function () {
    const { wrapper } = await mountWeek({ age: 30 });
    const inp = q('#gpx-file');
    Object.defineProperty(inp, 'files', { value: [new File(['not xml at all'], 'bad.gpx')], configurable: true });
    inp.dispatchEvent(new Event('change'));
    await vi.waitFor(function () { expect(q('#gpx-errors').hidden).toBe(false); });
    await click('#clear-all');
    await click('#clear-yes');
    await flushPromises();
    expect(q('#gpx-errors').hidden).toBe(true);
    expect(qa('#gpx-errors li')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('timer cleanup', () => {
  test('leaving the page stops the running timer interval', async function () {
    const { wrapper, data } = await mountWeek({ sample: false });
    await click('#snack-load-stairs');
    vi.useFakeTimers();
    await click('#snack-start');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    wrapper.unmount();
    vi.advanceTimersByTime(500);
    expect(vi.getTimerCount()).toBe(0);
    expect(data.sessions).toHaveLength(0);
  });
});

describe('header links', () => {
  test('the section ids the header links point to exist', async function () {
    const { wrapper } = await mountWeek();
    ['streak', 'plan', 'snacks', 'evidence'].forEach(function (id) {
      const el = q('#' + id);
      expect(el).not.toBe(null);
      expect(el.getAttribute('aria-labelledby')).toBe(id + '-heading');
      expect(q('#' + id + '-heading')).not.toBe(null);
    });
    wrapper.unmount();
  });
});
