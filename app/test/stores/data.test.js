import { createPinia, setActivePinia } from 'pinia';
import { useDataStore } from '../../src/stores/data.js';
import { parseYmd } from '../../src/core/dates.js';

/* a stand-in for the sync store: get, set and remove over a Map, values copied like the real one */
function fakeSync(initial) {
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const map = new Map(Object.entries(initial || {}).map(([k, v]) => [k, copy(v)]));
  return {
    map,
    get(key, fallback) { return map.has(key) ? copy(map.get(key)) : fallback; },
    set(key, value) { map.set(key, copy(value)); return true; },
    remove(key) { map.delete(key); return true; }
  };
}

const META = { v: 1, seeded: true, sampleActive: false };
const walk = (id, date, minutes) => ({ id, date, type: 'walk', minutes, intensity: 'moderate', balance: false, source: 'log', sample: false, createdAt: 1 });
const TRACK = { name: 'Morning run', type: 'run', startTime: 1, metrics: { distanceM: 5000 }, track: { lat: [1, 2], lon: [3, 4], brk: [] }, classification: null, deviceNote: null, importedAt: 5 };

function setup(initial) {
  setActivePinia(createPinia());
  const fake = fakeSync(initial);
  const store = useDataStore();
  store.today = parseYmd('2026-10-24');
  store.attach(fake);
  return { fake, store };
}

test('new account seeds the sample and persists it', () => {
  const { fake, store } = setup();
  store.load();
  expect(store.ready).toBe(true);
  expect(store.sessions).toHaveLength(34);
  expect(store.meta.sampleActive).toBe(true);
  expect(store.plan.sample).toBe(true);
  expect(fake.map.has('w150.sessions')).toBe(true);
  expect(fake.map.get('w150.sessions')).toHaveLength(34);
  expect(fake.map.get('w150.meta')).toEqual({ v: 1, seeded: true, sampleActive: true });
});

test('first real entry clears the sample', () => {
  const { fake, store } = setup();
  store.load();
  const s = store.addSession({ type: 'walk', minutes: 20, intensity: 'moderate', source: 'log' });
  expect(store.sessions).toHaveLength(1);
  expect(store.sessions[0].id).toBe(s.id);
  expect(s.date).toBe('2026-10-24');
  expect(s.sample).toBe(false);
  expect(store.meta.sampleActive).toBe(false);
  expect(store.plan).toBe(null);
  expect(fake.map.get('w150.sessions')).toHaveLength(1);
  expect(fake.map.get('w150.meta').sampleActive).toBe(false);
  expect(store.summary.total).toBe(20);
});

test('sessions older than 120 days survive persist', () => {
  const { fake, store } = setup({ 'w150.meta': META, 'w150.sessions': [walk('old', '2024-10-24', 30)] });
  store.load();
  store.addSession({ type: 'run', minutes: 10, intensity: 'vigorous', source: 'log' });
  store.persist();
  const ids = fake.map.get('w150.sessions').map((s) => s.id);
  expect(ids).toContain('old');
  expect(ids).toHaveLength(2);
});

test('remove and restore bring back the session and its track', () => {
  const gpx = Object.assign(walk('g1', '2026-10-23', 30), { type: 'run', source: 'gpx', trackId: 't_abc' });
  const { fake, store } = setup({ 'w150.meta': META, 'w150.sessions': [walk('w1', '2026-10-22', 20), gpx], 'w150.tracks': { t_abc: TRACK } });
  store.load();
  expect(Object.keys(store.tracks)).toEqual(['t_abc']);
  const result = store.removeSession('g1');
  expect(result.session.id).toBe('g1');
  expect(result.track).toEqual({ id: 't_abc', rec: TRACK });
  expect(store.sessions.map((s) => s.id)).toEqual(['w1']);
  expect(store.tracks.t_abc).toBeUndefined();
  expect(fake.map.get('w150.tracks')).toEqual({});
  expect(fake.map.get('w150.sessions').map((s) => s.id)).toEqual(['w1']);
  store.restoreSession(result);
  expect(store.sessions.map((s) => s.id)).toEqual(['w1', 'g1']);
  expect(store.tracks.t_abc).toEqual(TRACK);
  expect(fake.map.get('w150.tracks')).toEqual({ t_abc: TRACK });
  expect(fake.map.get('w150.sessions').map((s) => s.id)).toEqual(['w1', 'g1']);
  expect(store.removeSession('missing')).toBe(null);
});

test('clearAll keeps the age and deletes every server key including w150.breaks', () => {
  const { fake, store } = setup({
    'w150.meta': META,
    'w150.sessions': [walk('w1', '2026-10-22', 20)],
    'w150.prefs': { sound: true, age: 70, nudge: false },
    'w150.plan': { after: 'a', will: 'b', where: 'c', minutes: 2, sample: false, savedAt: 1 },
    'w150.breaks': [{ at: 1 }],
    'w150.tracks': {}
  });
  store.load();
  store.clearAll();
  expect(fake.map.has('w150.breaks')).toBe(false);
  expect(fake.map.has('w150.sessions')).toBe(false);
  expect(fake.map.has('w150.plan')).toBe(false);
  expect(fake.map.has('w150.tracks')).toBe(false);
  expect(fake.map.get('w150.meta')).toEqual({ v: 1, seeded: true, sampleActive: false });
  expect(fake.map.get('w150.prefs')).toEqual({ sound: false, age: 70, nudge: false });
  expect(store.prefs.age).toBe(70);
  expect(store.sessions).toEqual([]);
  expect(store.plan).toBe(null);
  expect(store.tracks).toEqual({});
});

test('remote change reloads state', () => {
  const { fake, store } = setup({ 'w150.meta': META, 'w150.sessions': [walk('a', '2026-10-20', 30)], 'w150.prefs': { age: 30 } });
  store.load();
  expect(store.sessions.map((s) => s.id)).toEqual(['a']);
  fake.map.set('w150.sessions', [walk('a', '2026-10-20', 30), walk('b', '2026-10-21', 45)]);
  fake.map.set('w150.prefs', { age: 70 });
  store.load();
  expect(store.sessions.map((s) => s.id)).toEqual(['a', 'b']);
  expect(store.prefs.age).toBe(70);
  expect(store.group).toBe('older');
  expect(store.summary.total).toBe(75);
});

test('tick moves today to the current local midnight', () => {
  const { store } = setup();
  store.tick();
  const n = new Date();
  expect(store.today.getTime()).toBe(new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime());
});

test('age, sound and plan actions persist', () => {
  const { fake, store } = setup({ 'w150.meta': META });
  store.load();
  store.setAge(40);
  store.setSound(true);
  expect(fake.map.get('w150.prefs')).toEqual({ sound: true, age: 40, nudge: false });
  expect(store.guide.key).toBe('adult');
  store.savePlan({ after: 'lunch', will: 'walk', where: 'the park', minutes: 5 });
  expect(fake.map.get('w150.plan')).toMatchObject({ after: 'lunch', will: 'walk', where: 'the park', minutes: 5, sample: false });
  store.deletePlan();
  expect(store.plan).toBe(null);
  expect(fake.map.get('w150.plan')).toBe(null);
});

test('saveTrack keeps the newest 30 imports and prunes unreferenced ones', () => {
  const { fake, store } = setup({ 'w150.meta': META });
  store.load();
  for (let i = 0; i < 31; i++) {
    store.addSession({ type: 'run', minutes: 20, intensity: 'moderate', source: 'gpx', trackId: 't_' + i });
    expect(store.saveTrack('t_' + i, Object.assign({}, TRACK, { importedAt: 100 + i }))).toBe(true);
  }
  const ids = Object.keys(fake.map.get('w150.tracks'));
  expect(ids).toHaveLength(30);
  expect(ids).not.toContain('t_0');
  expect(store.saveTrack('t_orphan', TRACK)).toBe(true);
  expect(store.tracks.t_orphan).toBeUndefined();
});
