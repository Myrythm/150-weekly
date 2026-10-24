/*
 * Links from the auth emails. GoTrue sends the visitor to `/` with `#access_token=...&type=signup`
 * (or `type=recovery`), or with `#error_code=...` when the link is expired or used. supabase-js
 * reads and clears the hash when the client starts, so main.js calls captureInitialLink() before
 * it creates the client and the router, then routes with routeForLink().
 *
 *   readLink(hash, search)  -> { type, errorCode }
 *   captureInitialLink()    -> { hash, search, link }   reads location once, later calls return the same
 *   routeForLink(link)      -> null | { path, query?, msg?, tone?, focus? }
 *   cleanLocation(to)       -> null | the same location without auth link parts (plain section anchors stay)
 *   safeNext(next)          -> a same-site path to go to after login, '/' otherwise
 */
import { COPY } from './copy.js';

const LINK_QUERY_KEYS = ['error', 'error_code', 'error_description', 'type', 'code'];
const PLAIN_ANCHOR = /^#[a-z][a-z0-9-]*$/;

export function readLink(hash, search) {
  hash = String(hash || '');
  search = String(search || '');
  const h = new URLSearchParams(hash.charAt(0) === '#' ? hash.slice(1) : hash);
  const q = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);
  return {
    type: h.get('type') || q.get('type') || '',
    errorCode: h.get('error_code') || q.get('error_code') || h.get('error') || q.get('error') || ''
  };
}

let initial = null;
export function captureInitialLink() {
  if (initial) return initial;
  let hash = '', search = '';
  try { hash = window.location.hash || ''; search = window.location.search || ''; } catch (e) { /* no location */ }
  initial = { hash: hash, search: search, link: readLink(hash, search) };
  return initial;
}

/* same order as boot() in web/js/auth.js: an error code wins, then recovery, then signup */
export function routeForLink(link) {
  if (!link) return null;
  if (link.errorCode) return { path: '/forgot', msg: COPY.expired, tone: 'error', focus: 'forgot-identifier' };
  if (link.type === 'recovery') return { path: '/reset', msg: '' };
  if (link.type === 'signup') return { path: '/login', msg: COPY.verified, tone: 'ok', focus: 'login-username' };
  return null;
}

/* the first route of a page load must not carry the auth link (tokens in the hash, codes in the query) */
export function cleanLocation(to) {
  const query = Object.assign({}, to.query || {});
  let changed = false;
  LINK_QUERY_KEYS.forEach(function (k) { if (k in query) { delete query[k]; changed = true; } });
  let hash = to.hash || '';
  if (hash && !PLAIN_ANCHOR.test(hash)) { hash = ''; changed = true; }
  if (!changed) return null;
  return { path: to.path, query: query, hash: hash, replace: true };
}

export function safeNext(next) {
  const s = typeof next === 'string' ? next : '';
  if (s.charAt(0) !== '/' || s.charAt(1) === '/' || s.charAt(1) === '\\') return '/';
  return s;
}
