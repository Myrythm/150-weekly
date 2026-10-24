# Local development (web version)

The web app is a Vue 3 app in `app/` (Vite, Vue Router, Pinia) and talks to a Supabase stack that runs in Docker on this machine. The Artifact `weekly-150.html` is frozen at v5 and is not part of this setup.

## Prerequisites

- Docker Desktop, running. The first `npm run db:start` pulls about a dozen images and can take a long time when the registry rate limits.
- Node 22.12 or newer (Node 24 is what the project is developed on; Vite 8 and Vitest 5 need at least 22.12). No Python is needed for the web app. Only the Artifact preview server (`weekly150-preview`) still uses Python.
- Free ports: 54321 (API), 54322 (database), 54323 (Studio), 54324 (Mailpit), 54327 (analytics), 8160 (Vite dev server). Another local Supabase project on the default ports must be stopped first.

## First run

```
npm install
npm run db:start
npm run web:build:local
```

Then, in a second terminal, serve the Edge Functions (see below), and start the `weekly150-web` server from `.claude/launch.json` (it runs `npm run app:dev`, the Vite dev server on http://127.0.0.1:8160 with hot reload; the port is strict, so it fails when something else holds 8160). Open http://127.0.0.1:8160. Paths like `/log` and `/activity/<id>` work by reload and by direct URL, because Vite serves `index.html` for them.

- `npm install` pins the Supabase CLI (`supabase` 2.122.0) as a dev dependency. Use it through `npx supabase ...` or the npm scripts.
- `npm run web:build:local` runs `node tools/web/build.js --local`. It reads `API_URL` and `ANON_KEY` from `npx supabase status -o env` and writes `app/.env.local` (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`), and it copies `tools/gpx/gpx-lib.js` to `app/public/gpx-lib.js`, which `app/index.html` loads as a classic script. Both outputs are git-ignored. Rerun it after every `tools/gpx/gpx-lib.js` change and after `db:reset` or any change of keys, then restart the dev server (Vite reads `.env.local` at start).
- `npm run app:build:local` runs `node tools/web/build.js --local` and then `vite build` into `app/dist`, so it needs only the local stack (like `web:build:local`). Use it to check that the production build passes on your machine.
- `npm run app:build` is the Vercel and cloud build: it runs the build step without `--local`, so it needs `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the environment or `.env` and exits 1 without them. It also rewrites `app/.env.local` from those values. If you run it locally, rerun `npm run web:build:local` afterwards to restore `app/.env.local` for the local stack, then restart the dev server; otherwise the dev server talks to the cloud project.
- The build refuses a `SUPABASE_ANON_KEY` that starts with `sb_secret_` or that is a JWT whose `role` is not `anon`. Only the URL and anon key may reach the browser.

## Useful URLs

| What | URL |
|---|---|
| App | http://127.0.0.1:8160 |
| Mailpit (verification and reset emails) | http://127.0.0.1:54324 |
| Studio (tables, SQL, auth users) | http://127.0.0.1:54323 |
| API gateway | http://127.0.0.1:54321 |

All mail the stack sends (sign-up verification, recovery, resend) lands in Mailpit. Open the link from there in the same browser.

## Edge Functions (auth-login, auth-recover)

Username login and recovery run as Supabase Edge Functions in `supabase/functions/` (shared code in `_shared/auth.ts`).

- Serve them with `npm run functions:serve` (same as `npx supabase functions serve`) in a second terminal while the stack is up. Keep it running; it hot reloads on file changes. It also replaces the stack's edge-runtime container with one that mounts `supabase/functions`.
- Why this step is documented as required: a stack that was started before the function folders existed serves no functions at all ("Function not found", 404). Whether a fresh `supabase start` serves them by itself is not stated in `supabase start --help` or `supabase functions serve --help`, and it was not tested by restarting the stack. `functions:serve` is the safe step in every case.
- `supabase start` fails when `supabase/config.toml` declares a function whose folder is missing, so keep `supabase/functions/auth-login/index.ts` and `auth-recover/index.ts` in place.
- Optional local secrets go in `supabase/functions/.env` (git-ignored, never commit it). `AUTH_REDIRECT_ORIGINS` (comma separated, lowercase) lists the origins allowed for CORS and for the `redirectTo` of recovery emails. Default when unset: `http://127.0.0.1:8160,http://localhost:8160`. In the cloud set it with `npx supabase secrets set AUTH_REDIRECT_ORIGINS=...`.
- The local Kong gateway answers CORS preflight itself and sends `Access-Control-Allow-Origin: *`. The functions' own origin check only takes effect in the cloud.

## Tests

| Command | What it covers | Needs |
|---|---|---|
| `npm test` | The Vitest suite in `app/test` (`npm run app:test`: core rules, sync store and merge, stores, router, pages and components), then `node tools/gpx/gpx-lib.test.js` | nothing running |
| `npm run db:test` | pgTAP tests of the schema, trigger, RLS and RPCs (`supabase/tests/accounts.test.sql`, rolled back, leaves no data) | stack up |
| `npm run test:smoke` | End to end against the stack: login, rate limits, recovery, CORS headers, RLS across users, no email leak (`tools/web/smoke.test.js`) | stack up and `functions:serve` running |

Notes:

- The gpx test reports 42 passed and 1 skipped in a fresh checkout. The real Mi Fitness file (`20261006Outdoor running_01 (1).gpx`, private and git-ignored) is not in the repo; with it the count is 50 passed.
- The smoke suite clears `public.auth_attempts` before each test, so reruns do not trip the rate limits. It creates users with random suffixes and leaves them in the local database.
- Browser check: after the tests, open the app on `weekly150-web`, register, verify through Mailpit, log in, log a session, reload, open `/log` and `/activity/<id>` by direct URL while logged out (log in, then you land back on that page), check at 375px and desktop in light and dark.

## Reset and stop

- `npm run db:reset` wipes all local data (users, sessions, attempts) and reapplies the migrations. If the functions stop answering afterwards, restart `functions:serve`. Do not run it while someone else is testing against the stack.
- `npm run db:stop` stops the containers (data is kept in Docker volumes).

## Local rate limits and known noise

- `supabase/config.toml` raises `[auth.rate_limit] email_sent = 60` and `sign_in_sign_ups = 300` for local testing only. Do not copy these to the cloud (see `docs/deploy.md`).
- The `supabase_vector_weekly150` container may restart in a loop on Windows. It only affects log collection for Studio and analytics; auth, REST, Mailpit and functions are unaffected.
- `supabase start` and `db reset` print `no files matched pattern: supabase/seed.sql`. Harmless: there is no seed file.
