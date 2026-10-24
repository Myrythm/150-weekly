import assert from 'node:assert';
import * as M from '../../src/sync/merge.js';

const a = { id: 'a', min: 30 };
const a1 = { id: 'a', min: 10 };
const a2 = { id: 'a', min: 20 };
const a3 = { id: 'a', min: 30 };
const b = { id: 'b', min: 15 };
const c = { id: 'c', min: 45 };

test('mergeList: item added remotely is kept', () => {
  assert.deepStrictEqual(M.mergeList([a], [a], [a, b]), [a, b]);
});

test('mergeList: item added locally is kept', () => {
  assert.deepStrictEqual(M.mergeList([a], [a, c], [a, b]), [a, b, c]);
});

test('mergeList: item deleted locally stays deleted', () => {
  assert.deepStrictEqual(M.mergeList([a, b], [a], [a, b]), [a]);
});

test('mergeList: local edit wins', () => {
  assert.deepStrictEqual(M.mergeList([a1], [a2], [a3]), [a2]);
});

test('mergeList: null base (first write raced an insert)', () => {
  assert.deepStrictEqual(M.mergeList(null, [c], [b]), [b, c]);
});

test('mergeList: item deleted remotely stays deleted', () => {
  assert.deepStrictEqual(M.mergeList([a, b], [a, b, c], [a]), [a, c]);
});

test('mergeList: remote delete loses to a local edit', () => {
  const bEdited = { id: 'b', min: 99 };
  assert.deepStrictEqual(M.mergeList([a, b], [a, bEdited, c], [a]), [a, bEdited, c]);
});

test('mergeList: null remote (row deleted on server) keeps only new or edited local items', () => {
  const bEdited = { id: 'b', min: 99 };
  assert.deepStrictEqual(M.mergeList([a, b], [a, bEdited, c], null), [bEdited, c]);
});

test('mergeList: null base treats nothing as a remote delete', () => {
  assert.deepStrictEqual(M.mergeList(null, [a, c], [b]), [b, a, c]);
});

test('mergeList: custom idKey', () => {
  const x = { trackId: 'x' }, y = { trackId: 'y' };
  assert.deepStrictEqual(M.mergeList([x], [x], [x, y], 'trackId'), [x, y]);
});

test('mergeList: does not mutate its inputs', () => {
  const base = [a, b], local = [a2], remote = [a3, b];
  const snap = JSON.stringify([base, local, remote]);
  M.mergeList(base, local, remote);
  assert.strictEqual(JSON.stringify([base, local, remote]), snap);
});

const t1 = { name: 'Run', metrics: { distanceM: 5000 } };
const t1b = { name: 'Run renamed', metrics: { distanceM: 5000 } };
const t1c = { name: 'Run other', metrics: { distanceM: 5000 } };
const t2 = { name: 'Ride', metrics: { distanceM: 20000 } };
const t3 = { name: 'Swim', metrics: { distanceM: 1000 } };

test('mergeMap: item added remotely is kept', () => {
  assert.deepStrictEqual(M.mergeMap({ t1 }, { t1 }, { t1, t2 }), { t1, t2 });
});

test('mergeMap: item added locally is kept', () => {
  assert.deepStrictEqual(M.mergeMap({ t1 }, { t1, t3 }, { t1, t2 }), { t1, t2, t3 });
});

test('mergeMap: item deleted locally stays deleted', () => {
  assert.deepStrictEqual(M.mergeMap({ t1, t2 }, { t1 }, { t1, t2 }), { t1 });
});

test('mergeMap: local edit wins', () => {
  assert.deepStrictEqual(M.mergeMap({ t1 }, { t1: t1b }, { t1: t1c }), { t1: t1b });
});

test('mergeMap: item deleted remotely stays deleted', () => {
  assert.deepStrictEqual(M.mergeMap({ t1, t2 }, { t1, t2, t3 }, { t1 }), { t1, t3 });
});

test('mergeMap: remote delete loses to a local edit', () => {
  assert.deepStrictEqual(M.mergeMap({ t1, t2 }, { t1: t1b, t2 }, { t2 }), { t2, t1: t1b });
});

test('mergeMap: null base and null remote', () => {
  assert.deepStrictEqual(M.mergeMap(null, { t3 }, { t2 }), { t2, t3 });
  assert.deepStrictEqual(M.mergeMap({ t1, t2 }, { t1, t2: t1b, t3 }, null), { t2: t1b, t3 });
});

test('mergeMap: key order is remote order, then new local keys', () => {
  assert.deepStrictEqual(Object.keys(M.mergeMap({}, { t3, t1 }, { t2, t1 })), ['t2', 't1', 't3']);
});
