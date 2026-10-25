/*
 * Storage engine for Weekly 150. ES module (port of web/js/store.js).
 * Uses mergeList and mergeMap from ./merge.js.
 *
 * An in-memory cache that the app reads and writes synchronously, plus a sync engine that
 * writes each key to the server: debounced per key, compare-and-set on a version counter,
 * merge or server-wins on conflict, retry with backoff on errors.
 *
 *   var store = createStore(backend, opts);
 *   backend = {
 *     fetchAll(): Promise<[{ key, value, version }]>,
 *     put(key, value, expectedVersion | null): Promise<{ ok, version, value }>
 *       expectedVersion null means "insert, the row must not exist". On ok: false, version and
 *       value are the server's current ones (both null when the row does not exist).
 *     remove(key): Promise<void>,
 *     refreshAuth(): Promise<boolean>
 *   }
 *   Errors are thrown; { status: 401 } means the access token expired, anything else (other
 *   status, TypeError from fetch) is retried with backoff.
 *   opts = { debounceMs = 500, retry = [1000, 2000, 4000, 8000, 16000, 30000],
 *            onStatus(state: 'saving' | 'saved' | 'error'), onRemoteChange(keys), onNotice(text),
 *            now, setTimeout, clearTimeout }
 *
 * API
 *   hydrate(): Promise<void>     load every row into the cache (keys with pending writes kept)
 *   get(key, fallback)           a deep copy of the cached value, or fallback when there is none
 *   set(key, value): true        cache now, queue a debounced put
 *   remove(key): true            drop from the cache now, queue a debounced delete
 *   flush(): Promise<void>       send every queued write now (also writes held after a failed
 *                                auth refresh); resolves when each key succeeded or failed once
 *   pending(): boolean           true while any write is queued, waiting to retry or in flight
 *   refresh(): Promise<string[]> refetch all rows; keys with pending writes, or that were busy or
 *                                changed at any point during the fetch, are skipped; returns
 *                                the keys whose version changed (or that were added or deleted)
 *   reset()                      clear cache, timers and queue (logout)
 *
 * Values are copied through JSON on set and on get, like localStorage, so callers may mutate
 * what they get or what they passed to set without touching the cache or the merge base.
 *
 * Conflicts: 'w150.sessions' merges with mergeList by id and 'w150.tracks' with
 * mergeMap, using the last value synced with the server as the base, then writes
 * again with the server's version; onRemoteChange([key]) is called when the merge changed the
 * local value. Other keys: the server value wins, the local change is dropped and
 * onRemoteChange([key]) is called; onNotice too, but only when the local value was a real edit
 * (it differed from the last synced value). Versions are only compared for equality (the server
 * never reuses one, even after a delete). A remove made while a put is in flight is not merged away,
 * the delete is sent. Five conflicts in a row are treated like an error (backoff).
 *
 * Auth: a 401 calls refreshAuth(); if it succeeds the write is retried at once (one time, then
 * normal backoff). If it fails the write stays queued in memory, status is 'error', and no
 * retry is scheduled until flush() is called (after logging in again).
 */
import { mergeList, mergeMap } from './merge.js';

var MERGERS = {
  'w150.sessions': function (base, local, remote) { return mergeList(base, local, remote, 'id'); },
  'w150.tracks': function (base, local, remote) { return mergeMap(base, local, remote); }
};
var DEFAULT_RETRY = [1000, 2000, 4000, 8000, 16000, 30000];
var MAX_CONFLICTS = 5;
var NOTICE = 'Another device saved a newer version, so your last change was replaced.';

function noop() {}
function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function isAuthError(err) { return !!err && typeof err === 'object' && err.status === 401; }

export function createStore(backend, opts) {
  opts = opts || {};
  var debounceMs = typeof opts.debounceMs === 'number' ? opts.debounceMs : 500;
  var retry = Array.isArray(opts.retry) && opts.retry.length ? opts.retry.slice() : DEFAULT_RETRY.slice();
  var onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : noop;
  var onRemoteChange = typeof opts.onRemoteChange === 'function' ? opts.onRemoteChange : noop;
  var onNotice = typeof opts.onNotice === 'function' ? opts.onNotice : noop;
  var setT = typeof opts.setTimeout === 'function' ? opts.setTimeout : function (fn, ms) { return setTimeout(fn, ms); };
  var clearT = typeof opts.clearTimeout === 'function' ? opts.clearTimeout : function (id) { clearTimeout(id); };

  /* per key: value (local, undefined = absent), synced (last value agreed with the server,
     the merge base), version (server row version, null = no row), op ('put' | 'remove' | null),
     seq (bumped on every local change), timer, attempt (failed tries in a row), authRetried,
     blocked (auth refresh failed, waiting for flush), inflight (promise of the running sync) */
  var entries = new Map();
  var generation = 0;
  var status = 'saved';

  function call(fn, arg) { try { fn(arg); } catch (e) { /* a UI callback must not stop the engine */ } }

  function entry(key) {
    var e = entries.get(key);
    if (!e) {
      e = { key: key, value: undefined, synced: undefined, version: null, op: null, seq: 0,
        timer: null, attempt: 0, authRetried: false, blocked: false, inflight: null };
      entries.set(key, e);
    }
    return e;
  }
  function alive(e) { return entries.get(e.key) === e; }
  function busy(e) { return !!(e.op || e.inflight); }

  function updateStatus() {
    var s = 'saved';
    entries.forEach(function (e) {
      if (!busy(e)) return;
      if (e.attempt > 0 || e.blocked) s = 'error';
      else if (s !== 'error') s = 'saving';
    });
    if (s !== status) { status = s; call(onStatus, s); }
  }

  function stopTimer(e) {
    if (e.timer !== null) { clearT(e.timer); e.timer = null; }
  }
  function schedule(e, ms) {
    stopTimer(e);
    e.timer = setT(function () {
      e.timer = null;
      /* a running sync picks the change up when it finishes */
      if (!alive(e) || e.inflight) return;
      start(e);
    }, ms);
  }

  /* resolves true when the key has nothing left that failed, false after a failure */
  function start(e) {
    if (e.inflight) return e.inflight;
    var p = sync(e).catch(function () { return false; }).then(function (ok) {
      e.inflight = null;
      if (alive(e)) updateStatus();
      return ok;
    });
    e.inflight = p;
    return p;
  }

  function delayFor(attempt) { return retry[Math.min(attempt, retry.length - 1)]; }

  function conflict(e, res) {
    var hasRow = res.version !== null && res.version !== undefined;
    var remote = hasRow ? res.value : undefined;
    var merge = MERGERS[e.key];
    if (e.op === 'remove') {
      /* removed locally while the put was in flight: the delete is the newest intent, send it */
      e.synced = copy(remote);
      e.version = hasRow ? res.version : null;
      return;
    }
    if (merge) {
      var before = e.value;
      var merged = copy(merge(e.synced === undefined ? null : e.synced, e.value, hasRow ? remote : null));
      e.synced = copy(remote);
      e.version = hasRow ? res.version : null;
      e.value = merged;
      if (!same(before, merged)) call(onRemoteChange, [e.key]);
      return;
    }
    var changed = !same(e.value, remote);
    /* only a real local edit (the value differs from the last synced one) was lost; the app
       rewrites unchanged keys on every save, those adopt the server value without a notice */
    var edited = !same(e.value, e.synced);
    e.synced = copy(remote);
    e.version = hasRow ? res.version : null;
    e.value = copy(remote);
    e.op = null;
    stopTimer(e);
    if (changed) {
      if (edited) call(onNotice, NOTICE);
      call(onRemoteChange, [e.key]);
    }
  }

  function backoff(e) {
    e.authRetried = false;
    var delay = delayFor(e.attempt);
    e.attempt++;
    schedule(e, delay);
    updateStatus();
  }

  async function sync(e) {
    var conflicts = 0;
    while (alive(e) && e.op && !e.blocked) {
      var op = e.op, seq = e.seq, expected = e.version;
      var sent = op === 'put' ? copy(e.value) : undefined;
      var res = null;
      try {
        if (op === 'put') {
          res = await backend.put(e.key, sent, expected);
          if (!res || typeof res !== 'object' || typeof res.ok !== 'boolean') throw new Error('Unexpected reply from the server.');
        } else {
          await backend.remove(e.key);
        }
      } catch (err) {
        if (!alive(e)) return false;
        if (isAuthError(err)) {
          var refreshed = false;
          try { refreshed = !!(await backend.refreshAuth()); } catch (x) { refreshed = false; }
          if (!alive(e)) return false;
          if (!refreshed) { e.blocked = true; stopTimer(e); updateStatus(); return false; }
          if (!e.authRetried) { e.authRetried = true; continue; }
        }
        backoff(e);
        return false;
      }
      if (!alive(e)) return false;
      e.authRetried = false;
      if (op === 'remove') {
        e.attempt = 0;
        e.version = null;
        e.synced = undefined;
        if (e.seq === seq) e.op = null;
      } else if (res.ok) {
        e.attempt = 0;
        e.version = res.version;
        e.synced = sent;
        if (e.seq === seq) e.op = null;
      } else {
        conflict(e, res);
        if (!e.op) e.attempt = 0;
        else {
          /* merged: write it now with the server version (it already holds any newer change);
             a server that keeps answering with conflicts is treated like an error */
          if (++conflicts >= MAX_CONFLICTS) { backoff(e); return false; }
          stopTimer(e);
          continue;
        }
      }
      /* a change made while this write was in flight, whose debounce already ran out */
      if (e.op && e.timer === null) continue;
      return true;
    }
    return !(alive(e) && e.blocked);
  }

  function queue(e) {
    e.seq++;
    /* while waiting to retry (or for a new login) keep that schedule, the newest value goes then */
    if (!e.blocked && !(e.attempt > 0 && e.timer !== null)) schedule(e, debounceMs);
    updateStatus();
  }

  async function pull() {
    var gen = generation;
    /* the fetched rows are a snapshot from somewhere during the request; a key that was busy
       when it started, is busy now, or changed meanwhile (a write finished, a new key was
       created) already holds newer data than the snapshot and must not be touched */
    var before = new Map();
    entries.forEach(function (e, key) {
      before.set(key, { e: e, version: e.version, seq: e.seq, busy: busy(e) });
    });
    var rows = await backend.fetchAll();
    if (gen !== generation) return [];
    function stable(key) {
      var e = entries.get(key), b = before.get(key);
      if (!e) return true;
      if (!b) return false;
      return b.e === e && !b.busy && !busy(e) && b.version === e.version && b.seq === e.seq;
    }
    var seen = new Set(), changed = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r || typeof r.key !== 'string') return;
      seen.add(r.key);
      if (!stable(r.key)) return;
      var e = entry(r.key);
      if (e.version === r.version) return;
      e.value = copy(r.value);
      e.synced = copy(r.value);
      e.version = r.version;
      changed.push(r.key);
    });
    entries.forEach(function (e, key) {
      if (seen.has(key) || !stable(key)) return;
      if (e.version === null && e.value === undefined) return;
      e.value = undefined;
      e.synced = undefined;
      e.version = null;
      changed.push(key);
    });
    return changed;
  }

  return {
    hydrate: function () { return pull().then(function () {}); },
    get: function (key, fallback) {
      var e = entries.get(key);
      if (!e || e.value === undefined) return fallback;
      return copy(e.value);
    },
    set: function (key, value) {
      var e = entry(key);
      var v = copy(value);
      e.value = v;
      e.op = v === undefined ? 'remove' : 'put';
      queue(e);
      return true;
    },
    remove: function (key) {
      var e = entry(key);
      e.value = undefined;
      e.op = 'remove';
      queue(e);
      return true;
    },
    flush: async function () {
      var failed = new Set();
      for (;;) {
        var waits = [];
        entries.forEach(function (e) {
          var p;
          if (e.inflight) p = e.inflight;
          else if (e.op && !failed.has(e)) { stopTimer(e); e.blocked = false; p = start(e); }
          if (p) waits.push(p.then(function (ok) { if (!ok) failed.add(e); }));
        });
        if (!waits.length) return;
        await Promise.all(waits);
      }
    },
    pending: function () {
      var any = false;
      entries.forEach(function (e) { if (busy(e)) any = true; });
      return any;
    },
    refresh: function () { return pull(); },
    reset: function () {
      entries.forEach(stopTimer);
      entries = new Map();
      generation++;
      status = 'saved';
    }
  };
}
