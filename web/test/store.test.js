'use strict';
const test = require('node:test');
const assert = require('node:assert');
const W150Store = require('../js/store.js');

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/* lets pending promise callbacks run */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

/* fake timers: nothing runs until advance() moves the clock */
function fakeTimers() {
  let now = 0, seq = 0;
  const timers = new Map();
  const delays = [];
  return {
    delays,
    now: () => now,
    setTimeout(fn, ms) { const id = ++seq; delays.push(ms); timers.set(id, { fn, at: now + (ms || 0) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    count: () => timers.size,
    async advance(ms) {
      const target = now + ms;
      await settle();
      for (;;) {
        let nextId = null, next = null;
        for (const [id, t] of timers) {
          if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && id < nextId))) { next = t; nextId = id; }
        }
        if (!next) break;
        timers.delete(nextId);
        now = next.at;
        next.fn();
        await settle();
      }
      now = target;
      await settle();
    }
  };
}

/* in-memory server: one row per key with a version, compare-and-set like put_user_data.
   By default versions count per row from 1 (easy to read in assertions); with
   { globalVersions: true } every write takes the next number of one shared sequence, like
   user_data_version_seq, so a row deleted and inserted again gets a version never used before. */
function fakeBackend(initial, opts) {
  const global = !!(opts && opts.globalVersions);
  let seq = 0;
  const nextVersion = (cur) => (global ? ++seq : (cur || 0) + 1);
  const rows = new Map();
  Object.keys(initial || {}).forEach((k) => rows.set(k, { value: clone(initial[k]), version: nextVersion(null) }));
  const failures = [];
  const be = {
    rows,
    calls: [],
    refreshResult: true,
    refreshCalls: 0,
    failNext(err) { failures.push(err); },
    puts() { return be.calls.filter((c) => c[0] === 'put'); },
    otherClientWrites(key, value) {
      const row = rows.get(key);
      rows.set(key, { value: clone(value), version: nextVersion(row ? row.version : null) });
    },
    otherClientRemoves(key) { rows.delete(key); },
    async fetchAll() {
      be.calls.push(['fetchAll']);
      return [...rows].map(([key, r]) => ({ key, value: clone(r.value), version: r.version }));
    },
    async put(key, value, expectedVersion) {
      be.calls.push(['put', key, clone(value), expectedVersion]);
      if (failures.length) throw failures.shift();
      const row = rows.get(key);
      const cur = row ? row.version : null;
      if (cur !== expectedVersion) return { ok: false, version: cur, value: row ? clone(row.value) : null };
      const version = nextVersion(cur);
      rows.set(key, { value: clone(value), version });
      return { ok: true, version, value: clone(value) };
    },
    async remove(key) {
      be.calls.push(['remove', key]);
      if (failures.length) throw failures.shift();
      rows.delete(key);
    },
    async refreshAuth() { be.refreshCalls++; return be.refreshResult; }
  };
  return be;
}

function setup(initial, extra, backendOpts) {
  const timers = fakeTimers();
  const be = fakeBackend(initial, backendOpts);
  const log = { status: [], remote: [], notice: [] };
  const store = W150Store.create(be, Object.assign({
    onStatus: (s) => log.status.push(s),
    onRemoteChange: (keys) => log.remote.push(keys),
    onNotice: (t) => log.notice.push(t),
    now: timers.now,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  }, extra || {}));
  return { timers, be, log, store };
}

const A = { id: 'a', min: 30 }, B = { id: 'b', min: 20 }, C = { id: 'c', min: 45 }, D = { id: 'd', min: 10 };

test('hydrate then get', async () => {
  const { store } = setup({ 'w150.sessions': [A], 'w150.prefs': { age: 34 } });
  await store.hydrate();
  assert.deepStrictEqual(store.get('w150.sessions', null), [A]);
  assert.deepStrictEqual(store.get('w150.prefs', null), { age: 34 });
  assert.strictEqual(store.get('w150.plan', 'none'), 'none');
});

test('get returns copies that callers may mutate', async () => {
  const { store, timers, be } = setup({ 'w150.sessions': [A] });
  await store.hydrate();
  const got = store.get('w150.sessions', null);
  got.push(B);
  got[0].min = 99;
  assert.deepStrictEqual(store.get('w150.sessions', null), [A]);
  const mine = [A];
  store.set('w150.sessions', mine);
  mine.push(C);
  assert.deepStrictEqual(store.get('w150.sessions', null), [A]);
  await timers.advance(500);
  assert.deepStrictEqual(be.rows.get('w150.sessions').value, [A]);
});

test('set returns true and is debounced per key', async () => {
  const { store, timers, be } = setup({});
  await store.hydrate();
  assert.strictEqual(store.set('w150.sessions', [A]), true);
  await timers.advance(100);
  store.set('w150.sessions', [A, B]);
  await timers.advance(100);
  store.set('w150.sessions', [A, B, C]);
  store.set('w150.prefs', { age: 30 });
  await timers.advance(499);
  assert.strictEqual(be.puts().filter((c) => c[1] === 'w150.sessions').length, 0);
  await timers.advance(1);
  const puts = be.puts().filter((c) => c[1] === 'w150.sessions');
  assert.strictEqual(puts.length, 1);
  assert.deepStrictEqual(puts[0], ['put', 'w150.sessions', [A, B, C], null]);
  assert.deepStrictEqual(be.rows.get('w150.sessions'), { value: [A, B, C], version: 1 });
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 30 }, version: 1 });
});

test('status goes saving then saved', async () => {
  const { store, timers, log } = setup({});
  await store.hydrate();
  store.set('w150.prefs', { age: 30 });
  assert.deepStrictEqual(log.status, ['saving']);
  await timers.advance(500);
  assert.deepStrictEqual(log.status, ['saving', 'saved']);
  assert.strictEqual(store.pending(), false);
});

test('keeps value and retries on network error', async () => {
  const { store, timers, be, log } = setup({ 'w150.sessions': [A] });
  await store.hydrate();
  be.failNext(new TypeError('Failed to fetch'));
  be.failNext({ status: 503 });
  store.set('w150.sessions', [A, B]);
  await timers.advance(500);
  assert.strictEqual(be.puts().length, 1);
  assert.deepStrictEqual(log.status, ['saving', 'error']);
  assert.deepStrictEqual(store.get('w150.sessions', null), [A, B]);
  assert.strictEqual(store.pending(), true);
  await timers.advance(999);
  assert.strictEqual(be.puts().length, 1);
  await timers.advance(1);
  assert.strictEqual(be.puts().length, 2);
  assert.deepStrictEqual(store.get('w150.sessions', null), [A, B]);
  assert.deepStrictEqual(log.status, ['saving', 'error']);
  await timers.advance(1999);
  assert.strictEqual(be.puts().length, 2);
  await timers.advance(1);
  assert.strictEqual(be.puts().length, 3);
  assert.deepStrictEqual(log.status, ['saving', 'error', 'saved']);
  assert.deepStrictEqual(be.rows.get('w150.sessions'), { value: [A, B], version: 2 });
  assert.deepStrictEqual(store.get('w150.sessions', null), [A, B]);
  assert.strictEqual(store.pending(), false);
});

test('retry delays back off and stay at the last entry (30 s cap)', async () => {
  const { store, timers, be } = setup({});
  await store.hydrate();
  for (let i = 0; i < 8; i++) be.failNext({ status: 500 });
  store.set('w150.prefs', { age: 30 });
  await timers.advance(500 + 1000 + 2000 + 4000 + 8000 + 16000 + 30000 + 30000);
  assert.deepStrictEqual(timers.delays, [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.strictEqual(be.puts().length, 8);
  await timers.advance(30000);
  assert.strictEqual(be.puts().length, 9);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 30 }, version: 1 });
  assert.strictEqual(store.pending(), false);
});

test('retries after auth error', async () => {
  const { store, timers, be, log } = setup({});
  await store.hydrate();
  be.failNext({ status: 401 });
  store.set('w150.prefs', { age: 30 });
  await timers.advance(500);
  assert.strictEqual(be.refreshCalls, 1);
  assert.strictEqual(be.puts().length, 2);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 30 }, version: 1 });
  assert.deepStrictEqual(log.status, ['saving', 'saved']);
  assert.strictEqual(store.pending(), false);
});

test('failed auth refresh keeps the write in memory until flush', async () => {
  const { store, timers, be, log } = setup({});
  await store.hydrate();
  be.refreshResult = false;
  be.failNext({ status: 401 });
  store.set('w150.prefs', { age: 30 });
  await timers.advance(500);
  assert.strictEqual(be.refreshCalls, 1);
  assert.deepStrictEqual(log.status, ['saving', 'error']);
  await timers.advance(120000);
  assert.strictEqual(be.puts().length, 1, 'no retries while logged out');
  assert.strictEqual(store.pending(), true);
  assert.deepStrictEqual(store.get('w150.prefs', null), { age: 30 });
  be.refreshResult = true;
  await store.flush();
  assert.strictEqual(be.puts().length, 2);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 30 }, version: 1 });
  assert.strictEqual(store.pending(), false);
  assert.strictEqual(log.status[log.status.length - 1], 'saved');
});

test('merge on conflict keeps an item deleted on another device deleted', async () => {
  const { store, timers, be, log } = setup({ 'w150.sessions': [A, B] });
  await store.hydrate();
  be.otherClientWrites('w150.sessions', [A]);
  store.set('w150.sessions', [A, B, C]);
  await timers.advance(500);
  assert.deepStrictEqual(be.rows.get('w150.sessions'), { value: [A, C], version: 3 });
  assert.deepStrictEqual(store.get('w150.sessions', null), [A, C]);
  assert.deepStrictEqual(log.remote, [['w150.sessions']]);
});

test('merges on version conflict', async () => {
  const { store, timers, be, log } = setup({ 'w150.sessions': [A] });
  await store.hydrate();
  be.otherClientWrites('w150.sessions', [A, B]);
  store.set('w150.sessions', [A, C]);
  await timers.advance(500);
  const puts = be.puts();
  assert.strictEqual(puts.length, 2);
  assert.deepStrictEqual(puts[0], ['put', 'w150.sessions', [A, C], 1]);
  assert.deepStrictEqual(puts[1], ['put', 'w150.sessions', [A, B, C], 2]);
  assert.deepStrictEqual(be.rows.get('w150.sessions'), { value: [A, B, C], version: 3 });
  assert.deepStrictEqual(store.get('w150.sessions', null), [A, B, C]);
  assert.deepStrictEqual(log.remote, [['w150.sessions']]);
  assert.deepStrictEqual(log.notice, []);
  assert.strictEqual(store.pending(), false);
});

test('merge on conflict keeps a local delete deleted', async () => {
  const { store, timers, be } = setup({ 'w150.sessions': [A, B] });
  await store.hydrate();
  be.otherClientWrites('w150.sessions', [A, B, D]);
  store.set('w150.sessions', [A]);
  await timers.advance(500);
  assert.deepStrictEqual(be.rows.get('w150.sessions').value, [A, D]);
  assert.deepStrictEqual(store.get('w150.sessions', null), [A, D]);
});

test('merges tracks by trackId on conflict', async () => {
  const t1 = { name: 'run' }, t2 = { name: 'ride' }, t3 = { name: 'swim' };
  const { store, timers, be, log } = setup({ 'w150.tracks': { t_1: t1 } });
  await store.hydrate();
  be.otherClientWrites('w150.tracks', { t_1: t1, t_2: t2 });
  store.set('w150.tracks', { t_1: t1, t_3: t3 });
  await timers.advance(500);
  assert.deepStrictEqual(be.rows.get('w150.tracks'), { value: { t_1: t1, t_2: t2, t_3: t3 }, version: 3 });
  assert.deepStrictEqual(log.remote, [['w150.tracks']]);
});

test('merge on conflict when the first write raced an insert', async () => {
  const { store, timers, be } = setup({});
  await store.hydrate();
  be.otherClientWrites('w150.sessions', [B]);
  store.set('w150.sessions', [C]);
  await timers.advance(500);
  const puts = be.puts();
  assert.deepStrictEqual(puts.map((p) => p[3]), [null, 1]);
  assert.deepStrictEqual(be.rows.get('w150.sessions'), { value: [B, C], version: 2 });
});

test('endless conflicts fall back to retry with backoff', async () => {
  const { store, timers, be, log } = setup({});
  await store.hydrate();
  let n = 0;
  be.put = async function (key, value, v) {
    be.calls.push(['put', key, value, v]);
    n++;
    return { ok: false, version: n, value: [{ id: 'x' + n }] };
  };
  store.set('w150.sessions', [A]);
  await timers.advance(500);
  assert.strictEqual(be.puts().length, 5);
  assert.strictEqual(log.status[log.status.length - 1], 'error');
  assert.strictEqual(store.pending(), true);
  await timers.advance(1000);
  assert.strictEqual(be.puts().length, 10);
  await timers.advance(1999);
  assert.strictEqual(be.puts().length, 10, 'backoff keeps growing');
  await timers.advance(1);
  assert.strictEqual(be.puts().length, 15);
});

test('non-list key conflict: server wins', async () => {
  const { store, timers, be, log } = setup({ 'w150.prefs': { age: 30 } });
  await store.hydrate();
  be.otherClientWrites('w150.prefs', { age: 40 });
  store.set('w150.prefs', { age: 35 });
  await timers.advance(500);
  assert.strictEqual(be.puts().length, 1);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 40 }, version: 2 });
  assert.deepStrictEqual(store.get('w150.prefs', null), { age: 40 });
  assert.strictEqual(log.notice.length, 1);
  assert.strictEqual(typeof log.notice[0], 'string');
  assert.ok(log.notice[0].length > 0 && !/[\u2013\u2014]/.test(log.notice[0]));
  assert.deepStrictEqual(log.remote, [['w150.prefs']]);
  assert.strictEqual(store.pending(), false);
  assert.strictEqual(log.status[log.status.length - 1], 'saved');
  store.set('w150.prefs', { age: 41 });
  await timers.advance(500);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 41 }, version: 3 });
});

test('server wins notice copy', async () => {
  const { store, timers, be, log } = setup({ 'w150.prefs': { age: 30 } });
  await store.hydrate();
  be.otherClientWrites('w150.prefs', { age: 40 });
  store.set('w150.prefs', { age: 35 });
  await timers.advance(500);
  assert.deepStrictEqual(log.notice, ['Another device saved a newer version, so your last change was replaced.']);
});

test('non-list key conflict without a local edit: server wins quietly', async () => {
  const { store, timers, be, log } = setup({ 'w150.prefs': { age: 30 } });
  await store.hydrate();
  be.otherClientWrites('w150.prefs', { age: 40 });
  /* persist() writes every key on each log, so the unchanged value is put again */
  store.set('w150.prefs', { age: 30 });
  await timers.advance(500);
  assert.strictEqual(be.puts().length, 1);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 40 }, version: 2 });
  assert.deepStrictEqual(store.get('w150.prefs', null), { age: 40 });
  assert.deepStrictEqual(log.notice, []);
  assert.deepStrictEqual(log.remote, [['w150.prefs']]);
  assert.strictEqual(store.pending(), false);
  store.set('w150.prefs', { age: 41 });
  await timers.advance(500);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 41 }, version: 3 });
});

test('two devices seeding the same sample on a new account end with one copy and no notice', async () => {
  /* app.js seeds samples with fixed ids and times, so both devices write identical values */
  const sample = [{ id: 'sample_0', min: 30 }, { id: 'sample_1', min: 20 }];
  const plan = { will: 'do 10 squats', sample: true, savedAt: 1000 };
  const timers = fakeTimers();
  const be = fakeBackend({}, { globalVersions: true });
  const log = { remote: [], notice: [] };
  const opts = {
    onRemoteChange: (keys) => log.remote.push(keys),
    onNotice: (t) => log.notice.push(t),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  };
  const one = W150Store.create(be, opts), two = W150Store.create(be, opts);
  await one.hydrate();
  await two.hydrate();
  [one, two].forEach((s) => { s.set('w150.sessions', sample); s.set('w150.plan', plan); });
  await timers.advance(500);
  assert.deepStrictEqual(be.rows.get('w150.sessions').value, sample);
  assert.deepStrictEqual(be.rows.get('w150.plan').value, plan);
  assert.deepStrictEqual(two.get('w150.sessions', null), sample);
  assert.deepStrictEqual(log.notice, []);
  assert.deepStrictEqual(log.remote, []);
  assert.strictEqual(one.pending() || two.pending(), false);
});

/* The server takes versions from one global sequence, so a row deleted and inserted again
   (Clear all, then a new entry, on another device) never comes back with an old version. */
test('refresh replaces a row deleted and inserted again with a new version', async () => {
  const { store, be } = setup({ 'w150.sessions': [A, B] }, null, { globalVersions: true });
  await store.hydrate();
  be.otherClientRemoves('w150.sessions');
  be.otherClientWrites('w150.sessions', [C]);
  assert.deepStrictEqual(await store.refresh(), ['w150.sessions']);
  assert.deepStrictEqual(store.get('w150.sessions', null), [C]);
});

test('a put with the version from before a delete and re-insert conflicts and merges', async () => {
  const { store, timers, be, log } = setup({ 'w150.sessions': [A, B] }, null, { globalVersions: true });
  await store.hydrate();
  const old = be.rows.get('w150.sessions').version;
  be.otherClientRemoves('w150.sessions');
  be.otherClientWrites('w150.sessions', [C]);
  store.set('w150.sessions', [A, B, D]);
  await timers.advance(500);
  const puts = be.puts();
  assert.strictEqual(puts.length, 2);
  assert.strictEqual(puts[0][3], old);
  assert.notStrictEqual(puts[1][3], old);
  /* A and B were cleared on the other device, C is its new entry, D is this device's new one */
  assert.deepStrictEqual(be.rows.get('w150.sessions').value, [C, D]);
  assert.deepStrictEqual(store.get('w150.sessions', null), [C, D]);
  assert.deepStrictEqual(log.remote, [['w150.sessions']]);
  assert.strictEqual(store.pending(), false);
});

test('remove deletes on server', async () => {
  const { store, timers, be } = setup({ 'w150.plan': { a: 1 } });
  await store.hydrate();
  assert.strictEqual(store.remove('w150.plan'), true);
  assert.strictEqual(store.get('w150.plan', 'gone'), 'gone');
  assert.strictEqual(store.pending(), true);
  await timers.advance(500);
  assert.deepStrictEqual(be.calls.filter((c) => c[0] === 'remove'), [['remove', 'w150.plan']]);
  assert.strictEqual(be.rows.has('w150.plan'), false);
  assert.strictEqual(store.pending(), false);
  store.set('w150.plan', { a: 2 });
  await timers.advance(500);
  assert.deepStrictEqual(be.puts().pop(), ['put', 'w150.plan', { a: 2 }, null]);
  assert.deepStrictEqual(be.rows.get('w150.plan'), { value: { a: 2 }, version: 1 });
});

test('set then remove within the debounce sends only the remove', async () => {
  const { store, timers, be } = setup({ 'w150.plan': { a: 1 } });
  await store.hydrate();
  store.set('w150.plan', { a: 2 });
  store.remove('w150.plan');
  await timers.advance(500);
  assert.strictEqual(be.puts().length, 0);
  assert.strictEqual(be.rows.has('w150.plan'), false);
});

test('pending is true until flush resolves', async () => {
  const { store, be } = setup({});
  await store.hydrate();
  store.set('w150.prefs', { age: 30 });
  store.set('w150.meta', { v: 1 });
  assert.strictEqual(store.pending(), true);
  const p = store.flush();
  assert.strictEqual(store.pending(), true);
  await p;
  assert.strictEqual(store.pending(), false);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 30 }, version: 1 });
  assert.deepStrictEqual(be.rows.get('w150.meta'), { value: { v: 1 }, version: 1 });
});

test('a set during an in-flight write is sent after it', async () => {
  const { store, timers, be } = setup({});
  await store.hydrate();
  let release;
  const realPut = be.put;
  be.put = function (key, value, v) {
    const r = realPut(key, value, v);
    return new Promise((res) => { release = () => res(r); });
  };
  store.set('w150.prefs', { age: 30 });
  await timers.advance(500);
  store.set('w150.prefs', { age: 31 });
  await timers.advance(500);
  assert.strictEqual(be.puts().length, 1);
  be.put = realPut;
  release();
  await timers.advance(0);
  assert.strictEqual(be.puts().length, 2);
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 31 }, version: 2 });
  assert.strictEqual(store.pending(), false);
});

test('a remove made while a conflicting put is in flight still wins', async () => {
  const { store, timers, be } = setup({ 'w150.tracks': { t_1: { n: 1 } } });
  await store.hydrate();
  be.otherClientWrites('w150.tracks', { t_1: { n: 1 }, t_2: { n: 2 } });
  let release;
  const realPut = be.put;
  be.put = function (key, value, v) {
    const r = realPut(key, value, v);
    return new Promise((res) => { release = () => res(r); });
  };
  store.set('w150.tracks', { t_1: { n: 1 }, t_3: { n: 3 } });
  await timers.advance(500);
  store.remove('w150.tracks');
  be.put = realPut;
  release();
  await timers.advance(500);
  assert.strictEqual(store.get('w150.tracks', 'none'), 'none');
  assert.strictEqual(be.rows.has('w150.tracks'), false);
  assert.strictEqual(store.pending(), false);
});

test('refresh skips keys with pending writes and returns only changed keys', async () => {
  const { store, be } = setup({ 'w150.prefs': { age: 30 }, 'w150.plan': { p: 1 }, 'w150.sessions': [A], 'w150.breaks': [1] });
  await store.hydrate();
  be.otherClientWrites('w150.plan', { p: 2 });
  be.otherClientWrites('w150.sessions', [A, B]);
  be.otherClientWrites('w150.meta', { v: 9 });
  be.rows.delete('w150.breaks');
  store.set('w150.sessions', [A, C]);
  const changed = await store.refresh();
  assert.deepStrictEqual(changed.slice().sort(), ['w150.breaks', 'w150.meta', 'w150.plan']);
  assert.deepStrictEqual(store.get('w150.plan', null), { p: 2 });
  assert.deepStrictEqual(store.get('w150.meta', null), { v: 9 });
  assert.strictEqual(store.get('w150.breaks', 'none'), 'none');
  assert.deepStrictEqual(store.get('w150.sessions', null), [A, C]);
  assert.deepStrictEqual(store.get('w150.prefs', null), { age: 30 });
  assert.deepStrictEqual(await store.refresh(), []);
});

test('refresh racing writes that finish during the fetch keeps the newer cache', async () => {
  const { store, be } = setup({ 'w150.prefs': { age: 30 } });
  await store.hydrate();
  let release;
  const realFetch = be.fetchAll;
  be.fetchAll = function () {
    const snap = realFetch();
    return new Promise((res) => { release = () => res(snap); });
  };
  store.set('w150.prefs', { age: 31 });
  const p = store.refresh();
  store.set('w150.sessions', [A]);
  await store.flush();
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 31 }, version: 2 });
  assert.deepStrictEqual(be.rows.get('w150.sessions'), { value: [A], version: 1 });
  release();
  const changed = await p;
  be.fetchAll = realFetch;
  assert.deepStrictEqual(changed, []);
  assert.deepStrictEqual(store.get('w150.prefs', null), { age: 31 });
  assert.deepStrictEqual(store.get('w150.sessions', null), [A]);
  store.set('w150.prefs', { age: 32 });
  await store.flush();
  assert.deepStrictEqual(be.rows.get('w150.prefs'), { value: { age: 32 }, version: 3 });
  assert.deepStrictEqual(await store.refresh(), []);
});

test('refresh still applies remote changes to keys untouched during the fetch', async () => {
  const { store, be } = setup({ 'w150.prefs': { age: 30 }, 'w150.plan': { p: 1 } });
  await store.hydrate();
  let release;
  const realFetch = be.fetchAll;
  be.otherClientWrites('w150.plan', { p: 2 });
  be.fetchAll = function () {
    const snap = realFetch();
    return new Promise((res) => { release = () => res(snap); });
  };
  const p = store.refresh();
  store.set('w150.prefs', { age: 31 });
  await store.flush();
  release();
  assert.deepStrictEqual(await p, ['w150.plan']);
  assert.deepStrictEqual(store.get('w150.plan', null), { p: 2 });
  assert.deepStrictEqual(store.get('w150.prefs', null), { age: 31 });
});

test('reset clears cache, timers and queue', async () => {
  const { store, timers, be } = setup({ 'w150.prefs': { age: 30 } });
  await store.hydrate();
  store.set('w150.prefs', { age: 31 });
  store.reset();
  assert.strictEqual(store.get('w150.prefs', 'none'), 'none');
  assert.strictEqual(store.pending(), false);
  assert.strictEqual(timers.count(), 0);
  await timers.advance(5000);
  assert.strictEqual(be.puts().length, 0);
});
