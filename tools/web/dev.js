/*
 * One command local dev. Run with: npm run dev
 *
 * Starts the local Supabase stack (a no-op when it is already up), writes app/.env.local and
 * app/public/gpx-lib.js (build.js --local), then runs the Edge Functions server and the Vite dev
 * server side by side. Ctrl+C stops both; the Docker stack is left running (npm run db:stop).
 * Docker Desktop must be running.
 */
'use strict';
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');

function fail(msg) { console.error('dev: ' + msg); process.exit(1); }

function step(label, cmd) {
  console.log('dev: ' + label);
  const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) fail(label + ' failed');
}

step('starting the local stack', 'npx supabase start');
step('writing app/.env.local', 'node tools/web/build.js --local');

const children = [];
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  children.forEach(function (c) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill('SIGTERM');
  });
  process.exit(code);
}

function run(name, cmd) {
  const c = spawn(cmd, { cwd: root, stdio: 'inherit', shell: true });
  children.push(c);
  c.on('exit', function (code) {
    if (!stopping) {
      console.error('dev: ' + name + ' exited (' + code + '), stopping');
      stopAll(code || 1);
    }
  });
}

process.on('SIGINT', function () { stopAll(0); });
process.on('SIGTERM', function () { stopAll(0); });

run('functions', 'npx supabase functions serve');
run('vite', 'npx vite --config app/vite.config.mjs');
console.log('dev: app on http://127.0.0.1:8160, mail on http://127.0.0.1:54324');
