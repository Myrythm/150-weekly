/*
 * Build step for the web version (the Vue app in app/). Run from anywhere:
 * node tools/web/build.js [--local]
 *
 * The URL and anon key come from SUPABASE_URL / SUPABASE_ANON_KEY (process env, then .env in the
 * project root), or with --local from `npx supabase status -o env` (API_URL, ANON_KEY). Writes:
 *
 *   app/.env.local      VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the Vue app (git-ignored)
 *   app/public/gpx-lib.js  byte for byte copy of tools/gpx/gpx-lib.js, loaded by app/index.html
 *                       as a classic script (git-ignored)
 *
 * Exits 1 when a variable is missing, or when SUPABASE_ANON_KEY is a secret key (sb_secret_...) or
 * a JWT whose role is not "anon" (for example a service_role key). Only the public URL and anon
 * key are ever written.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const local = process.argv.slice(2).indexOf('--local') !== -1;

function parseEnv(text) {
  const out = {};
  String(text).split(/\r?\n/).forEach(function (line) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().charAt(0) === '#') return;
    let v = m[2];
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) v = v.slice(1, -1);
    out[m[1]] = v;
  });
  return out;
}

function fail(msg) { console.error('web build: ' + msg); process.exit(1); }

let url = '', key = '';
if (local) {
  let text = '';
  try {
    text = execSync('npx supabase status -o env', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    fail('could not run "npx supabase status -o env" (is the local stack running?)');
  }
  const env = parseEnv(text);
  url = env.API_URL || '';
  key = env.ANON_KEY || '';
  if (!url || !key) fail('API_URL or ANON_KEY missing from supabase status output');
} else {
  let fileEnv = {};
  try { fileEnv = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8')); } catch (e) { /* no .env */ }
  url = process.env.SUPABASE_URL || fileEnv.SUPABASE_URL || '';
  key = process.env.SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY || '';
  if (!url) fail('SUPABASE_URL is not set (environment or .env)');
  if (!key) fail('SUPABASE_ANON_KEY is not set (environment or .env)');
}

// Refuse a key that is not meant for browsers. Keys that are neither a JWT nor an sb_ key pass.
function checkAnonKey(k) {
  if (k.indexOf('sb_secret_') === 0) fail('SUPABASE_ANON_KEY is a secret key (sb_secret_...). Use the anon or publishable key.');
  if (k.indexOf('sb_publishable_') === 0) return;
  const parts = k.split('.');
  if (parts.length !== 3) return;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (e) {
    return; // not a JWT
  }
  if (payload && typeof payload === 'object' && payload.role !== 'anon') {
    fail('SUPABASE_ANON_KEY is a JWT with role "' + payload.role + '", expected "anon". Never put a service role key in the web build.');
  }
}
checkAnonKey(key);

// Vite reads app/.env.local, and app/index.html loads app/public/gpx-lib.js as a classic script.
fs.mkdirSync(path.join(root, 'app', 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'app', '.env.local'), 'VITE_SUPABASE_URL=' + url + '\nVITE_SUPABASE_ANON_KEY=' + key + '\n');
fs.copyFileSync(path.join(root, 'tools', 'gpx', 'gpx-lib.js'), path.join(root, 'app', 'public', 'gpx-lib.js'));
console.log('web build: wrote app/.env.local (' + url + ') and app/public/gpx-lib.js');
