# Weekly 150 web (accounts and Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork the Weekly 150 Artifact into a static web app in `web/` with username login, email verification and per-user data in Supabase, running locally on the Supabase CLI Docker stack and ready for Vercel.

**Architecture:** The page stays vanilla HTML/CSS/JS with no bundler. The app script's three storage helpers are re-pointed at an in-memory store that hydrates from and writes to a `user_data` table (one jsonb row per `w150.*` key, RLS per user, compare-and-set by version, merge by id on conflict). Username login and recovery go through two Supabase Edge Functions so emails never reach the browser.

**Tech Stack:** Supabase CLI (Docker: Postgres, GoTrue, PostgREST, Edge Runtime, Mailpit), Postgres SQL + pgTAP, Deno Edge Functions (TypeScript), `@supabase/supabase-js` v2 UMD from jsDelivr (exact pinned version), Node 24 (`node:test`), Python `http.server` for the local static preview, Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-10-23-web-supabase-design.md`

## Global Constraints

- No em dashes or en dashes anywhere (code, comments, copy, docs). No Claude or Anthropic attribution.
- `weekly-150.html` (the Artifact) is frozen. Do not edit it. `docs/page-contract.md` applies to it only.
- `credit()` remains the only route for aerobic minutes. Exercise rules must behave exactly as in the Artifact.
- `w150.*` keys and value shapes stay backward compatible (add fields with defaults, never rename). Allowed server keys: `w150.meta`, `w150.sessions`, `w150.plan`, `w150.prefs`, `w150.breaks`, `w150.tracks`. `w150.theme` stays in browser localStorage.
- `tools/gpx/gpx-lib.js` is the single source of the parser; `web/js/gpx-lib.js` is a generated copy. `node tools/gpx/gpx-lib.test.js` stays at 50 passed.
- Username: `^[a-z0-9_]{3,20}$`, primary key of `profiles`, lowercased and trimmed on input, never changeable. Display name: 1 to 40 characters after trim. Age: whole number 0 to 120. Password: at least 8 characters, must equal "verify password".
- Email must be verified before first login (`enable_confirmations = true`).
- No secret (service role key, `OPENAI_API_KEY`) in `web/` or in committed files. Only the Supabase URL and anon key reach the browser.
- UI copy in English, matching the existing voice. Auth screens use existing theme tokens (all three theme blocks), work at 400px with no horizontal scroll, visible focus, every control has a stable id.
- Login failure copy is exactly `Wrong username or password.` for unknown user and wrong password. Recovery copy is exactly `If that account exists, we sent an email.` Rate limit copy is exactly `Too many attempts. Try again in a few minutes.`
- The project is not a git repository. There are no commit steps; each task ends with its verification instead.
- Delegation per CLAUDE.md: Tasks 2, 3, 4 and 6 are difficult (Opus), Tasks 1, 5 and 7 moderate (Sonnet). Only one agent at a time edits files under `web/`.

## Review Focus

1. **Access token expires while the app is open for hours.** Writes must not be lost: supabase-js refreshes the token; a write that fails with 401 is retried after `auth.refreshSession()`, and only a failed refresh sends the user to the login screen (pending writes kept in memory and retried after login in the same tab). Test: `store.test.js` "retries after auth error".
2. **Network drops while logging a session.** The cache keeps the change, status shows `Not saved, retrying`, retries back off (1 s, 2 s, 4 s, capped at 30 s), and `beforeunload` warns while writes are pending. Test: `store.test.js` "keeps value and retries on network error".
3. **Two tabs or two devices log sessions at the same time.** Both sessions survive (merge by id), and a session deleted in one tab does not come back. Test: `merge.test.js` cases plus `store.test.js` "merges on version conflict".
4. **Username typed as `  Budi `** at login, register or recovery is treated as `budi`. Test: `smoke.test.js` "login normalises username".
5. **Verification or recovery link expired or opened twice.** The app reads `error_code` from the URL hash and shows `This link has expired or was already used. Request a new one.` with the right resend or reset form, never a blank page. Checked in Task 6 browser verification step.

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json` | npm scripts and the pinned `supabase` CLI devDependency |
| `.gitignore`, `.env.example` | keep `.env`, `supabase/functions/.env`, `web/config.js`, `web/js/gpx-lib.js`, `node_modules` out of git |
| `supabase/config.toml` | local stack config (auth, email, rate limits, function JWT settings) |
| `supabase/migrations/20261024000000_accounts.sql` | profiles, user_data, auth_attempts, triggers, RLS, RPCs |
| `supabase/tests/accounts.test.sql` | pgTAP tests for schema, trigger, RLS, RPCs |
| `supabase/functions/_shared/auth.ts` | shared helpers: CORS, JSON response, username normalise, rate limit, min-duration padding |
| `supabase/functions/auth-login/index.ts` | username + password to session |
| `supabase/functions/auth-recover/index.ts` | resend verification, send reset email |
| `supabase/functions/.env.example` | future secrets (`OPENAI_API_KEY=`), unused now |
| `tools/web/build.js` | writes `web/config.js` from env (or from `supabase status`), copies `tools/gpx/gpx-lib.js` to `web/js/gpx-lib.js` |
| `tools/web/smoke.test.js` | integration tests against the running local stack |
| `web/index.html` | full HTML document: auth screens + app markup |
| `web/css/app.css` | the Artifact's CSS plus auth screen styles |
| `web/js/merge.js` | pure merge functions (browser global `W150Merge`, node `module.exports`) |
| `web/js/store.js` | cache + sync engine with injected backend (browser global `W150Store`, node `module.exports`) |
| `web/js/app.js` | the Artifact's app script, wrapped as `W150App.start(...)` |
| `web/js/auth.js` | Supabase client, auth screens, session handling, starts the app |
| `web/test/merge.test.js`, `web/test/store.test.js` | node:test unit tests |
| `vercel.json` | static deploy config |
| `docs/local-dev.md`, `docs/deploy.md` | run locally, deploy later |

---

### Task 1: Local tooling and the Supabase stack

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `supabase/config.toml` (via `supabase init`), `supabase/functions/.env.example`
- Modify: `.claude/launch.json`

**Interfaces:**
- Produces: npm scripts `db:start`, `db:stop`, `db:reset`, `db:test`, `web:build`, `web:build:local`, `test`, `test:smoke`. Launch config `weekly150-web` serving `web/` on `127.0.0.1:8160`. Local URLs: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, Mailpit `http://127.0.0.1:54324`.

- [ ] **Step 1: Create `package.json`** with `"private": true`, `"type": "commonjs"`, and the scripts:
  `db:start` = `supabase start`, `db:stop` = `supabase stop`, `db:reset` = `supabase db reset`, `db:test` = `supabase test db`, `web:build` = `node tools/web/build.js`, `web:build:local` = `node tools/web/build.js --local`, `test` = `node --test web/test/ && node tools/gpx/gpx-lib.test.js`, `test:smoke` = `node --test tools/web/smoke.test.js`.
- [ ] **Step 2: Install the CLI pinned:** `npm install --save-dev --save-exact supabase`. Expected: `package.json` shows an exact version, `npx supabase --version` prints it.
- [ ] **Step 3: `npx supabase init`** (answer no to IDE settings). Expected: `supabase/config.toml` exists.
- [ ] **Step 4: Edit `supabase/config.toml`:** `project_id = "weekly150"`; `[auth] site_url = "http://127.0.0.1:8160"`, `additional_redirect_urls = ["http://127.0.0.1:8160", "http://localhost:8160"]`, `minimum_password_length = 8`; `[auth.email] enable_signup = true`, `enable_confirmations = true`, `secure_password_change = false`; `[auth.rate_limit] email_sent = 60` (local only, so the flows can be tested repeatedly; note it in `docs/deploy.md`); `[functions.auth-login] verify_jwt = false`; `[functions.auth-recover] verify_jwt = false`. Leave every other default.
- [ ] **Step 5: Write `.gitignore`** (`node_modules/`, `.env`, `supabase/.temp/`, `supabase/.branches/`, `supabase/functions/.env`, `web/config.js`, `web/js/gpx-lib.js`, `.claude/preview/`), `.env.example` (`SUPABASE_URL=`, `SUPABASE_ANON_KEY=`, with a comment that the CLI prints both), `supabase/functions/.env.example` (`OPENAI_API_KEY=` with a comment: reserved for the future AI assistant, unused).
- [ ] **Step 6: Add the launch config** `{ "name": "weekly150-web", "runtimeExecutable": "python", "runtimeArgs": ["-m", "http.server", "8160", "--bind", "127.0.0.1", "--directory", "web"], "port": 8160 }` next to the existing one (leave `weekly150-preview` unchanged).
- [ ] **Step 7: Start the stack** (Docker Desktop must be running): `npm run db:start` in the background (first run pulls images, can take several minutes). Expected: the CLI prints API URL `http://127.0.0.1:54321`, anon key, service_role key, Mailpit URL. `npx supabase status -o env` prints `API_URL=` and `ANON_KEY=` lines.

### Task 2: Database schema, triggers, RLS and RPCs

**Files:**
- Create: `supabase/migrations/20261024000000_accounts.sql`
- Test: `supabase/tests/accounts.test.sql`

**Interfaces:**
- Consumes: running stack from Task 1.
- Produces:
  - `public.profiles(username text primary key, user_id uuid unique not null references auth.users(id) on delete cascade, display_name text not null, created_at timestamptz not null default now())`
  - `public.user_data(user_id uuid not null references auth.users(id) on delete cascade, key text not null check (key in ('w150.meta','w150.sessions','w150.plan','w150.prefs','w150.breaks','w150.tracks')), value jsonb not null, version integer not null default 1, updated_at timestamptz not null default now(), primary key (user_id, key))`
  - `public.auth_attempts(id bigserial primary key, bucket text not null, created_at timestamptz not null default now())`, index on `(bucket, created_at)`, RLS on with no policies (service role only).
  - `public.username_available(p_username text) returns boolean` (security definer, `grant execute` to `anon, authenticated`): true when the lowercased trimmed name matches the username pattern and no profile has it.
  - `public.put_user_data(p_key text, p_value jsonb, p_expected_version integer) returns table(ok boolean, version integer, value jsonb)` (security invoker, `authenticated` only). `p_expected_version` null means "insert, the row must not exist". On success `ok = true` and the new version (insert gives 1, update gives old + 1). On mismatch or existing row `ok = false` with the current server `version` and `value` (both null if the row does not exist).
  - Trigger `on_auth_user_created` after insert on `auth.users` calling `public.handle_new_user()` (security definer, `set search_path = ''`).
  - Trigger on `user_data` before update setting `updated_at = now()`.

- [ ] **Step 1: Write the failing pgTAP tests** in `supabase/tests/accounts.test.sql` (`begin; select plan(N); ... select * from finish(); rollback;`). Create users by inserting into `auth.users` with `raw_user_meta_data` and switch identity with `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';`. Assertions:
  - `has_table('public','profiles')`, `has_table('public','user_data')`, `col_is_pk('public','profiles','username')`.
  - Inserting a user with metadata `{"username":"Budi_1","display_name":"Budi","age":"34"}` creates profile `budi_1` and a `user_data` row `w150.prefs` with value `{"age": 34}` and version 1.
  - `throws_ok` for a second user with username `budi_1`; for username `ab`; for age `121`; for age `3.5`; for display name of 41 characters; for missing username.
  - Age `3` is accepted (under 5 allowed).
  - `username_available('BUDI_1')` is false, `username_available('new_user')` is true, `username_available('a b')` is false, callable as `anon`.
  - As user A: `put_user_data('w150.sessions','[]',null)` returns `ok = true, version = 1`; again with `null` returns `ok = false, version = 1`; with `1` returns `ok = true, version = 2`; with `1` again returns `ok = false, version = 2, value` equal to the stored value.
  - `put_user_data('w150.theme', '"dark"', null)` throws (check constraint).
  - As user B: `select count(*) from user_data` sees only B's rows (1, the prefs row); `update user_data set value = '1' where user_id = <A>` affects 0 rows; `put_user_data` cannot touch A's rows (it always writes `auth.uid()`); `select count(*) from profiles` returns only B's profile; B cannot `insert` into `profiles` and cannot update `username`.
  - As `anon`: `select count(*) from user_data` is 0; `select count(*) from auth_attempts` throws or returns 0.
- [ ] **Step 2: Run** `npm run db:test`. Expected: FAIL (tables do not exist).
- [ ] **Step 3: Write the migration** with the objects in Interfaces. `handle_new_user()` reads `new.raw_user_meta_data`, normalises username (`lower(btrim(...))`), validates username pattern, display name length 1 to 40 after trim, age matching `^\d{1,3}$` and 0 to 120, raises an exception with a clear message on any failure, inserts the profile and the `w150.prefs` row `jsonb_build_object('age', age)`. RLS: `user_data` select/insert/update/delete `using (user_id = (select auth.uid()))` and `with check` the same; `profiles` select own row, update own row with a column grant limited to `display_name` (`revoke update on profiles from authenticated; grant update (display_name) on profiles to authenticated;`), no insert/delete policy. Revoke all on `auth_attempts` from `anon, authenticated`.
- [ ] **Step 4: Apply and test:** `npm run db:reset` then `npm run db:test`. Expected: all pgTAP tests pass.

### Task 3: Edge Functions for username login and recovery

**Files:**
- Create: `supabase/functions/_shared/auth.ts`, `supabase/functions/auth-login/index.ts`, `supabase/functions/auth-recover/index.ts`
- Test: `tools/web/smoke.test.js`

**Interfaces:**
- Consumes: `profiles`, `auth_attempts` from Task 2. Env injected by the runtime: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces:
  - `POST {API}/functions/v1/auth-login` body `{ username, password }`. 200 `{ session: { access_token, refresh_token, expires_in, expires_at, token_type, user: { id } } }`. 401 `{ error: "invalid_credentials", message: "Wrong username or password." }`. 403 `{ error: "email_not_confirmed", message: "Email not verified yet." }` (only when the password was correct). 429 `{ error: "rate_limited", message: "Too many attempts. Try again in a few minutes." }`. 400 `{ error: "bad_request" }` for malformed JSON or missing fields.
  - `POST {API}/functions/v1/auth-recover` body `{ identifier, action: "resend" | "reset", redirectTo }`. Always 200 `{ message: "If that account exists, we sent an email." }` except 429 as above and 400 for a bad action or a `redirectTo` whose origin is not in an allow list read from env `AUTH_REDIRECT_ORIGINS` (comma separated; local default `http://127.0.0.1:8160,http://localhost:8160`).
  - Both answer CORS preflight (`OPTIONS`) and send `Access-Control-Allow-Origin` for the allowed origins, headers `authorization, apikey, content-type, x-client-info`.
  - `_shared/auth.ts` exports `normaliseUsername(s: string): string`, `json(status: number, body: unknown, origin: string | null): Response`, `corsHeaders(origin: string | null): HeadersInit`, `hitRateLimit(admin, bucket: string, max: number, windowMinutes: number): Promise<boolean>` (inserts an attempt row, returns true when the count in the window exceeds max), `padTo(ms: number, started: number): Promise<void>`.

- [ ] **Step 1: Write the failing smoke tests** in `tools/web/smoke.test.js` (node:test, global `fetch`). Setup reads `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` by running `npx supabase status -o env` once. Helper `createUser({ username, email, password, confirmed })` uses `POST /auth/v1/admin/users` with the service role and `user_metadata: { username, display_name, age: "30" }`, `email_confirm: confirmed`. Use random suffixes so tests can rerun. Tests:
  - "login returns a session": confirmed user, `auth-login` 200, `session.access_token` is a string, and `GET /rest/v1/user_data` with that token returns exactly one row (`w150.prefs`).
  - "login normalises username": username `budi_x`, login with `"  Budi_X "` gets 200.
  - "wrong password and unknown user give the same answer": both 401 with message `Wrong username or password.`
  - "unverified user with correct password gets email_not_confirmed": 403. "unverified user with wrong password gets invalid_credentials": 401.
  - "rate limit": 11 wrong passwords for one username, the 11th answer is 429 with the exact copy.
  - "recover is neutral": `resend` and `reset` for an existing username, an existing email and an unknown username all return 200 with `If that account exists, we sent an email.`; a reset for an existing confirmed user produces a message in Mailpit (`GET http://127.0.0.1:54324/api/v1/search?query=to:<email>`, at least 1 message).
  - "recover rejects foreign redirect": `redirectTo: "https://evil.example/"` returns 400.
  - "RLS across users": user B's token cannot read A's rows via `GET /rest/v1/user_data?user_id=eq.<A>` (empty array) and `PATCH` on A's row changes nothing.
  - "no email leak": the `auth-login` and `auth-recover` response bodies never contain the user's email.
- [ ] **Step 2: Run** `npm run test:smoke`. Expected: FAIL (404 on the functions).
- [ ] **Step 3: Implement `_shared/auth.ts`.** Rate limit buckets: `login:u:<username>` max 10 per 15 min, `login:ip:<ip>` max 30 per 15 min, `recover:ip:<ip>` max 10 per 15 min, `recover:id:<identifier>` max 3 per 15 min. IP from the first entry of `x-forwarded-for`, falling back to `unknown`. Only failed logins count toward the login buckets (insert after failure, check before attempting).
- [ ] **Step 4: Implement `auth-login`.** Look up `profiles.user_id` by normalised username with the service role client, then `auth.admin.getUserById` for the email, then `signInWithPassword` with a fresh anon client (`persistSession: false`). Map GoTrue error code `email_not_confirmed` to 403 and everything else to 401. For an unknown username call `signInWithPassword` with `nobody@invalid.invalid` so the work is similar. Pad every non-200 response to at least 400 ms from request start.
- [ ] **Step 5: Implement `auth-recover`.** Identifier containing `@` is an email (lowercased), otherwise a username resolved to an email as above. `resend` calls `auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } })`; `reset` calls `auth.resetPasswordForEmail(email, { redirectTo })`. Errors from GoTrue are logged with `console.error` and never returned. Pad to 400 ms.
- [ ] **Step 6: Run** `npm run test:smoke`. Expected: all pass. If the functions are not picked up automatically by `supabase start`, run `npx supabase functions serve` in the background and note the requirement in `docs/local-dev.md`.

### Task 4: Merge and store modules

**Files:**
- Create: `web/js/merge.js`, `web/js/store.js`
- Test: `web/test/merge.test.js`, `web/test/store.test.js`

**Interfaces:**
- Produces:
  - `W150Merge.mergeList(base: object[] | null, local: object[], remote: object[] | null, idKey = 'id'): object[]` and `W150Merge.mergeMap(base: object | null, local: object, remote: object | null): object`. Rule: start from remote; drop ids present in base but absent from local (deleted or pruned locally); add or replace with every local item (local wins). Order of `mergeList`: remote order, then new local items in local order.
  - `W150Store.create(backend, opts) -> store`, where `backend = { fetchAll(): Promise<{key, value, version}[]>, put(key, value, expectedVersion | null): Promise<{ok, version, value}>, remove(key): Promise<void>, refreshAuth(): Promise<boolean> }` and `opts = { debounceMs = 500, retry = [1000, 2000, 4000, 8000, 16000, 30000], onStatus(state: 'saving' | 'saved' | 'error'), onRemoteChange(keys: string[]), onNotice(text: string), now, setTimeout, clearTimeout }` (timer functions injectable for tests).
  - `store.hydrate(): Promise<void>`, `store.get(key, fallback)`, `store.set(key, value): true`, `store.remove(key): true`, `store.flush(): Promise<void>`, `store.pending(): boolean`, `store.refresh(): Promise<string[]>` (changed keys), `store.reset(): void` (clears cache, timers and queue, used on logout).
  - Both files end with `if (typeof module !== 'undefined') { module.exports = ...; }` like `gpx-lib.js`, and define a browser global otherwise.

- [ ] **Step 1: Write failing `merge.test.js`** (node:test, `assert.deepStrictEqual`):
  - item added remotely is kept: base `[a]`, local `[a]`, remote `[a,b]` gives `[a,b]`.
  - item added locally is kept: base `[a]`, local `[a,c]`, remote `[a,b]` gives `[a,b,c]`.
  - item deleted locally stays deleted: base `[a,b]`, local `[a]`, remote `[a,b]` gives `[a]`.
  - local edit wins: base `[a1]`, local `[a2]`, remote `[a3]` gives `[a2]`.
  - null base (first write raced an insert): local `[c]`, remote `[b]` gives `[b,c]`.
  - `mergeMap` mirrors the three main cases with `{t1:{...}}` objects keyed by trackId.
- [ ] **Step 2: Run** `node --test web/test/merge.test.js`. Expected: FAIL (module missing). **Step 3: Implement.** **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Write failing `store.test.js`** with a fake backend (in-memory map with versions, switchable failure modes) and fake timers:
  - "hydrate then get": values from `fetchAll` are returned by `get`; a missing key returns the fallback.
  - "set is debounced per key": three `set` calls on one key within 500 ms produce one `put`.
  - "status goes saving then saved".
  - "keeps value and retries on network error": `put` rejects twice then succeeds; `get` returns the new value throughout; status is `error` after the first failure and `saved` at the end; retry delays are 1000 then 2000 ms.
  - "retries after auth error": `put` rejects with `{ status: 401 }`, `refreshAuth` is called, the write then succeeds.
  - "merges on version conflict": another client writes `w150.sessions` first; the store's `put` gets `ok: false`, the store merges with `mergeList` using its last synced value as base, writes again with the server version, and calls `onRemoteChange(['w150.sessions'])`.
  - "non-list key conflict: server wins": conflict on `w150.prefs` takes the server value, calls `onNotice` and `onRemoteChange(['w150.prefs'])`.
  - "remove deletes on server" and "pending is true until flush resolves".
  - "refresh skips keys with pending writes" and returns only keys whose version changed.
- [ ] **Step 6: Run** `node --test web/test/store.test.js`. Expected: FAIL. **Step 7: Implement** (per key state: `value`, `syncedValue`, `version`, timer, attempt count). **Step 8: Run** `npm test`. Expected: all node tests pass, gpx tests still `50 passed`.

### Task 5: Fork the page into `web/` and the build script

**Files:**
- Create: `web/index.html`, `web/css/app.css`, `web/js/app.js`, `tools/web/build.js`
- Read only: `weekly-150.html` (lines 3 font link, 4 to 615 style, 616 to 1141 markup, 1143 to 4383 script; confirm the markers before cutting)

**Interfaces:**
- Consumes: `W150Store` store object (Task 4) and global `GPX` from `web/js/gpx-lib.js`.
- Produces: `window.W150App.start({ store, profile: { username, displayName }, onLogout(): void, onClearAll(): Promise<void> })`, called exactly once per page load after hydration, and `window.W150App.reload()` which re-reads all state from the store and re-renders (used by `onRemoteChange`). `tools/web/build.js` writes `web/config.js` as `window.W150_CONFIG = { supabaseUrl: "...", supabaseAnonKey: "..." };` from `SUPABASE_URL` / `SUPABASE_ANON_KEY` (env, then `.env`), or with `--local` from `npx supabase status -o env` (`API_URL`, `ANON_KEY`); it copies `tools/gpx/gpx-lib.js` to `web/js/gpx-lib.js` byte for byte and exits non-zero if either variable is missing.

- [ ] **Step 1: Write `tools/web/build.js`** and run `npm run web:build:local`. Expected: `web/config.js` contains `http://127.0.0.1:54321`; `web/js/gpx-lib.js` is identical to `tools/gpx/gpx-lib.js` (`node -e` compare prints `same`).
- [ ] **Step 2: Create `web/css/app.css`** from the Artifact style block unchanged, and `web/index.html` as a full document: `<!doctype html>`, `<html lang="en">`, head with charset, viewport (`width=device-width, initial-scale=1, viewport-fit=cover`), `<title>Weekly 150</title>`, the Google Fonts link, `css/app.css`, and the base rules the Artifact host used to inject (copy them from `tools/build-preview.sh` line 11, including `[hidden]{display:none!important}`). Body: the Artifact markup wrapped in `<div id="app" hidden>`, plus an empty `<div id="auth">` placeholder for Task 6. Scripts at the end in order: supabase-js UMD (exact version from `npm view @supabase/supabase-js version` on the day, URL `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@<ver>/dist/umd/supabase.js`), `config.js`, `js/gpx-lib.js`, `js/merge.js`, `js/store.js`, `js/app.js`, `js/auth.js`.
- [ ] **Step 3: Create `web/js/app.js`** from the Artifact script with these changes only:
  - Remove the pasted GPX block (from the "pasted verbatim" marker through `if (typeof module ...)`); the global `GPX` is used instead.
  - Replace the outer `(function () { ... })();` with `window.W150App = { start: function (ctx) { ... }, reload: ... }` so nothing runs at parse time. Inside `start`, keep the code order as is.
  - `load`, `save`, `removeKey` call `ctx.store.get/set/remove`, except `KEYS.theme`, which keeps using localStorage in try/catch. `storageOk` becomes `true` for data; `probeStorage` and `KEYS.probe` are removed.
  - Turn the `boot` IIFE and the tracks init block into a named `loadState()` that both `start` and `reload` call; `reload` then calls `renderAll()` and resets the age input.
  - `clearAllData()`: keep `prefs.age`, remove the six data keys through `removeKey`, save `meta` and `prefs`; replace the localStorage key loop. Clear-confirm copy: `Delete all your sessions, plans and imports from your account on every device?`; done copy: `All cleared.`
  - `renderFooter()`: `Your log is saved to your account. Only you can see it.`
  - Header: add `<span class="who" id="who-name">` (display name, text only) and `<button class="btn btn-outline btn-small" id="logout" type="button">Log out</button>` in `.header-actions`, and `<span class="small" id="sync-status" role="status" aria-live="polite">` showing `Saving`, `Saved` or `Not saved, retrying`. Styles in `app.css` with existing tokens; at 400px the header must not scroll horizontally (hide `#who-name` below 480px if needed).
- [ ] **Step 4: Temporary harness check.** Add a throwaway `web/dev-start.html` that creates a store over an in-memory fake backend and calls `W150App.start`. Start `weekly150-web`, open `/dev-start.html`, confirm the app renders with the sample week, logging a session updates the meter, GPX import of `tools/gpx/fixtures/garmin-run-hr-ele.gpx` works, no console errors, 375px and desktop, light and dark. Delete `web/dev-start.html` afterwards.

### Task 6: Auth screens and app wiring

**Files:**
- Create: `web/js/auth.js`
- Modify: `web/index.html` (auth markup in `#auth`), `web/css/app.css` (auth styles)

**Interfaces:**
- Consumes: `W150_CONFIG`, `supabase.createClient`, `W150Store.create`, `W150App.start/reload`, the two Edge Functions (Task 3), RPC `username_available`, RPC `put_user_data`.
- Produces: the running app. Screen ids: `#auth-login`, `#auth-register`, `#auth-check-email`, `#auth-forgot`, `#auth-reset`, each a `<section hidden>`; form control ids `login-username`, `login-password`, `reg-username`, `reg-display`, `reg-email`, `reg-age`, `reg-password`, `reg-password2`, `forgot-identifier`, `reset-password`, `reset-password2`; message area `#auth-msg` (`role="status"`); buttons `#login-submit`, `#reg-submit`, `#resend-verification`, `#forgot-submit`, `#reset-submit`, links `#to-register`, `#to-login`, `#to-forgot`.

- [ ] **Step 1: Markup and styles** for the five screens in the track meet style (paper card on the track band, existing label and button classes), 400px safe, visible focus, labels on every field, password fields `autocomplete="current-password"` / `new-password`, username `autocomplete="username"`, `autocapitalize="none"`.
- [ ] **Step 2: Backend adapter in `auth.js`:** `fetchAll` = `select key, value, version from user_data`; `put` = `rpc('put_user_data', { p_key, p_value, p_expected_version })` (first row of the result); `remove` = `delete().eq('key', key)`; `refreshAuth` = `auth.refreshSession()` returns `!error`. PostgREST/HTTP errors are thrown as `{ status }` so the store can tell 401 from network errors.
- [ ] **Step 3: Register flow.** Client validation per Global Constraints with inline errors on the field; username availability checked on blur (debounced 300 ms) with `Username taken.` under the field; submit calls `auth.signUp` with `options: { data: { username, display_name, age: String(age) }, emailRedirectTo: location.origin + '/' }`; a database error after a passing availability check shows `Username taken.`; success (including the silent "email already registered" case) shows `#auth-check-email` with `Check your email to verify your account, then log in.`
- [ ] **Step 4: Login flow.** POST to `auth-login` with `apikey` and `Authorization: Bearer <anon key>` headers; on 200 `auth.setSession({ access_token, refresh_token })`; on 403 show `Email not verified yet.` and `#resend-verification` (calls `auth-recover` `resend` with the typed username); on 401 and 429 show the server message.
- [ ] **Step 5: Links from email.** On load parse `location.hash`: `error_code` present shows the expired-link copy from Review Focus 5 and opens `#auth-forgot`; `type=signup` signs out locally and shows login with `Email verified. You can log in now.`; the `PASSWORD_RECOVERY` auth event shows `#auth-reset`, which calls `auth.updateUser({ password })`, then `auth.signOut({ scope: 'others' })`, then starts the app. Clear the hash with `history.replaceState` after reading it.
- [ ] **Step 6: Start and stop the app.** With a session (on load or after login): read own profile (`username, display_name`), create the store, `hydrate()`, unhide `#app`, hide `#auth`, call `W150App.start` once; `onRemoteChange` calls `W150App.reload`; `onStatus` writes `#sync-status`; `onNotice` writes to the existing `#live` region. `visibilitychange` to visible calls `store.refresh()` then `reload` if keys changed. `beforeunload` sets `returnValue` while `store.pending()`. Logout: `await store.flush()` (max 3 s), `auth.signOut()`, `store.reset()`, `location.reload()`. `SIGNED_OUT` from a failed refresh shows the login screen with `Your session ended. Log in again to keep saving.` and keeps the store queue in memory; after logging in again as the same user, `flush()` it.
- [ ] **Step 7: Browser verification** (Browser pane, `weekly150-web`, stack running, `npm run web:build:local` done): register user A (age 34), open the email in Mailpit, follow the link, see `Email verified. You can log in now.`; log in as `  A ` with spaces; app shows sample week with age set (no age prompt), display name in header; log a session, see `Saving` then `Saved`; reload, the session is still there; import a GPX fixture, reload, detail view works; Clear all keeps the age; log out; register user B, log in, B sees none of A's data; forgot password for A via username, follow the Mailpit link, set a new password, log in with it; open an already used link and see the expired copy. Two tabs as A: log a session in each, reload both, both sessions present. Check 375px and desktop, light and dark, console has no errors. Take one screenshot of the login screen and one of the app for the log.

### Task 7: Vercel prep and project docs

**Files:**
- Create: `vercel.json`, `docs/local-dev.md`, `docs/deploy.md`
- Modify: `CLAUDE.md`, `docs/PROGRESS.md`, `docs/implementation-log.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: `vercel.json`:** `{ "framework": null, "installCommand": "", "buildCommand": "node tools/web/build.js", "outputDirectory": "web", "cleanUrls": true }`. Verify locally: `SUPABASE_URL=https://example.supabase.co SUPABASE_ANON_KEY=x node tools/web/build.js` writes those values; then rerun `npm run web:build:local` to restore.
- [ ] **Step 2: `docs/local-dev.md`:** prerequisites (Docker Desktop, Node 24, Python), `npm install`, `npm run db:start`, `npm run web:build:local`, start `weekly150-web`, Mailpit and Studio URLs, `npm test`, `npm run db:test`, `npm run test:smoke`, `npm run db:reset` to wipe local data, `npm run db:stop`.
- [ ] **Step 3: `docs/deploy.md`** (not executed): `git init` and push; create the Supabase project; `npx supabase link`; `npx supabase db push`; `npx supabase functions deploy auth-login --no-verify-jwt` and `auth-recover`; `npx supabase secrets set AUTH_REDIRECT_ORIGINS=https://<domain>`; Auth settings: site URL and redirect URLs to the Vercel domain, email confirmations on, custom SMTP (for example Resend), default `email_sent` rate limit; Vercel project with env `SUPABASE_URL`, `SUPABASE_ANON_KEY`; later `OPENAI_API_KEY` as a Supabase function secret for the AI assistant.
- [ ] **Step 4: Update `CLAUDE.md`, `docs/PROGRESS.md`, `docs/implementation-log.md`:** the Artifact is frozen at v5 and its rules apply to `weekly-150.html` only; the web app lives in `web/` with its own run and verify steps (`npm test`, `npm run db:test`, `npm run test:smoke`, browser check on `weekly150-web`); the gpx rule becomes "edit `tools/gpx/gpx-lib.js`, the build copies it"; storage table, auth flows, functions, and open items (production SMTP, deploy, AI assistant, account deletion). Implementation log entry "I: web version with accounts" with files, functions, ids and decisions.
- [ ] **Step 5: Final check:** `npm test` (gpx `50 passed`), `npm run db:test`, `npm run test:smoke` all pass; `grep -P '\x{2014}|\x{2013}'` (em and en dash) in `web/`, `supabase/`, `tools/web/`, `docs/` returns nothing new; `grep -r "service_role\|SERVICE_ROLE" web/` returns nothing.
