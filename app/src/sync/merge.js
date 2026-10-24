/*
 * Merge rules for Weekly 150. No dependencies. ES module (port of web/js/merge.js).
 *
 * Used when a compare-and-set write loses to another tab or device. Three versions of a value:
 *   base   the value this client last synced with the server (null if none)
 *   local  this client's current value
 *   remote the value now on the server (null if the row does not exist)
 * Rule (three-way): start from remote; drop ids present in base but absent from local (deleted
 * or pruned locally); add or replace with every local item (local wins), except a local item
 * whose id is in base but missing from remote: it was deleted elsewhere and is dropped, unless
 * the local copy differs from its base copy (JSON compare), then the local edit wins and stays.
 * A null base means nothing counts as deleted; a null remote means everything in base was.
 *
 *   mergeList(base, local, remote, idKey = 'id') -> array
 *     Order: remote order, then new local items in local order.
 *   mergeMap(base, local, remote) -> object
 *     Same rule over own keys (for example tracks keyed by trackId). Key order: remote keys,
 *     then new local keys.
 * Inputs are never mutated. Items are not copied, the result shares them with the inputs.
 */
function asList(v) { return Array.isArray(v) ? v : []; }
function asMap(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

/* identity of a list item: its id, or its JSON text when it has no id */
function idOf(item, idKey) {
  var id = item && typeof item === 'object' ? item[idKey] : undefined;
  if (id === undefined || id === null) return 'j:' + JSON.stringify(item);
  return 'i:' + String(id);
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/* a local item missing from remote: new (not in base), edited since base, or deleted elsewhere */
function keepLocalOnly(inBase, baseItem, localItem) {
  return !inBase || !same(baseItem, localItem);
}

export function mergeList(base, local, remote, idKey) {
  if (idKey === undefined) idKey = 'id';
  var baseById = new Map(), localById = new Map(), seen = new Set(), out = [];
  asList(base).forEach(function (it) {
    var id = idOf(it, idKey);
    if (!baseById.has(id)) baseById.set(id, it);
  });
  asList(local).forEach(function (it) {
    var id = idOf(it, idKey);
    if (!localById.has(id)) localById.set(id, it);
  });
  asList(remote).forEach(function (it) {
    var id = idOf(it, idKey);
    if (seen.has(id)) return;
    if (localById.has(id)) { out.push(localById.get(id)); seen.add(id); return; }
    if (baseById.has(id)) return;
    out.push(it); seen.add(id);
  });
  asList(local).forEach(function (it) {
    var id = idOf(it, idKey);
    if (seen.has(id)) return;
    seen.add(id);
    if (keepLocalOnly(baseById.has(id), baseById.get(id), it)) out.push(it);
  });
  return out;
}

export function mergeMap(base, local, remote) {
  var b = asMap(base), l = asMap(local), r = asMap(remote), out = {};
  Object.keys(r).forEach(function (k) {
    if (has(l, k)) out[k] = l[k];
    else if (!has(b, k)) out[k] = r[k];
  });
  Object.keys(l).forEach(function (k) {
    if (has(r, k)) return;
    if (keepLocalOnly(has(b, k), b[k], l[k])) out[k] = l[k];
  });
  return out;
}
