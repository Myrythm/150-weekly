# Deploying the web version (Supabase cloud and Vercel)

Not executed yet. This is the checklist for the first deploy. Replace `<domain>` with the final Vercel domain (lowercase, no trailing slash) and `<project-ref>` with the Supabase project reference.

## 1. Push the repository

The project is a git repository (branch `feat/vue-migration`). Push it to a Git host that Vercel can read (for example GitHub). Make sure nothing secret is tracked: `.env`, `supabase/functions/.env`, `app/.env.local`, `app/public/gpx-lib.js`, `app/dist/` and the private GPX file are git-ignored.

## 2. Create and link the Supabase project

1. Create a project in the Supabase dashboard (choose a region near the users; keep the database password in a password manager).
2. `npx supabase login`, then `npx supabase link --project-ref <project-ref>`.
3. Apply the schema: `npx supabase db push` (runs `supabase/migrations/20261024000000_accounts.sql`: tables `profiles`, `user_data`, `auth_attempts`, RLS, the sign-up trigger, and the RPCs `username_available` and `put_user_data`).
4. Deploy the functions. Both must skip JWT verification because the caller has no session yet:
   ```
   npx supabase functions deploy auth-login --no-verify-jwt
   npx supabase functions deploy auth-recover --no-verify-jwt
   ```
5. Set the allowed origins (comma separated, lowercase, exact origins with scheme, no path):
   ```
   npx supabase secrets set AUTH_REDIRECT_ORIGINS=https://<domain>
   ```
   Add the preview or custom domains too if they must work (`https://<domain>,https://www.<domain>`). A mixed-case value will not match the browser's lowercase origin. If `AUTH_REDIRECT_ORIGINS` is not set, the functions fall back to the local origins (`http://127.0.0.1:8160,http://localhost:8160`) and recovery requests from the real domain answer 400.
6. Later, for the AI assistant: `npx supabase secrets set OPENAI_API_KEY=...`. It is a function secret only and must never appear in `app/` or in a committed file.

## 3. Auth settings (dashboard, Authentication)

- Site URL: `https://<domain>`. Redirect URLs: `https://<domain>` (add `https://<domain>/**` if the dashboard asks for a pattern). Remove the local `127.0.0.1` entries in production.
- Email: confirmations on (`enable_confirmations`, verified email before first login), sign-ups on, minimum password length 8.
- Custom SMTP (for example Resend, with a verified sending domain). The built-in Supabase mailer is for testing only and is heavily limited.
- Rate limits: keep `email_sent` at the cloud default with custom SMTP. The local value of 60 in `supabase/config.toml` is for testing only.
- Raise `sign_in_sign_ups`. In the cloud this limit is per IP, and every login is proxied by the `auth-login` Edge Function, so GoTrue sees one egress IP for all users and the default would throttle everyone together. The local config uses 300 per 5 minutes; pick a value for the expected traffic, or verify how GoTrue keys the limit for requests that come from an Edge Function and forward the client IP if it supports that. Until that is checked, GoTrue throttling answers 500 (`Something went wrong. Try again.`) from `auth-login`, not 401.
- `supabase/config.toml` only drives the local stack. `npx supabase config push` can send auth settings to the project, but review the diff first because the local file has local-only values (site URL, rate limits).

## 4. Vercel project

1. Import the repository. Framework preset: Other. `vercel.json` already sets `framework: null`, install command `npm ci`, build command `npm run app:build`, output directory `app/dist`, and a rewrite of every path to `/index.html` (the app is a single page app: `/log` and `/activity/<id>` are handled by Vue Router, so a reload or a direct URL must get `index.html`; real files such as `/assets/...` and `/gpx-lib.js` are still served first).
   - Node version: Vite 8 and Vitest 5 need Node 22.12 or newer (`engines` in `package.json`). In the Vercel project settings (General, Node.js Version) choose 22.x or 24.x.
   - Vercel installs dev dependencies by default, and the build tools (`vite`, `@vitejs/plugin-vue`) are dev dependencies, so leave that as it is: do not set `NPM_CONFIG_PRODUCTION=true` or `NODE_ENV=production` for the install.
2. Environment variables (Production and Preview): `SUPABASE_URL` (the project URL, `https://<project-ref>.supabase.co`) and `SUPABASE_ANON_KEY` (the anon or publishable key from Project Settings, API).
3. `npm run app:build` first runs `node tools/web/build.js`, which writes `app/.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) from those two variables and copies `tools/gpx/gpx-lib.js` to `app/public/gpx-lib.js`, then `vite build` bundles the app into `app/dist` with the URL and anon key inlined. The build step exits non-zero when a variable is missing, and refuses a `sb_secret_` key or a JWT whose role is not `anon`. Never set the service role key in Vercel. After a build, `grep -rE "service_role|SERVICE_ROLE" app/dist` must find nothing.
4. Deploy, then open `https://<domain>` and run the checks below.

## 5. Security follow-ups to settle after the first deploy

- **x-forwarded-for.** `auth-login` and `auth-recover` take the first entry of `x-forwarded-for` as the client IP for the per-IP buckets. The first entry can be supplied by the client. Look at what the Supabase gateway actually sends and pick the trusted hop (for example the last entry added by the gateway) in `clientIp` in `supabase/functions/_shared/auth.ts`. The per-username and per-identifier buckets hold either way.
- **Login timing.** Every non-200 answer is padded to `PAD_MS` = 400 ms so known and unknown usernames take the same time. After deploy, measure the p95 of known versus unknown username (and wrong password) and raise `PAD_MS` if the real work sometimes exceeds the floor.
- **CORS.** The local Kong gateway forces `Access-Control-Allow-Origin: *`, so the origin allow list was never exercised locally. Check in the cloud: an `OPTIONS` and a `POST` with `Origin: https://evil.example` must get no `Access-Control-Allow-Origin` header, and `Origin: https://<domain>` must get it echoed.
- **Prune `public.auth_attempts`.** Rows are only ever inserted. Enable `pg_cron` and schedule a delete of rows older than a day, for example `select cron.schedule('prune-auth-attempts', '17 * * * *', $$delete from public.auth_attempts where created_at < now() - interval '1 day'$$);`.
- **AUTH_REDIRECT_ORIGINS** must be lowercase and exact, as above.
- **GoTrue errors other than invalid credentials** (throttling, user banned, outages) answer 500 for a known account but 401 for an unknown one. Harmless for enumeration at this scale, but note it when reading logs.
- **Email in the token.** The logged-in user's access token carries their own email claim. Other users' emails never reach the browser.

## 6. Smoke checks on the live site

1. Register a new account, confirm the verification email arrives from the custom SMTP sender and the link returns to `https://<domain>`.
2. Log in with a mixed-case username with spaces around it.
3. Log a session, reload, log in on another device: the session is there.
4. Forgot password: neutral copy for an existing and an unknown username, reset link works once, the second open shows the expired-link message.
5. Wrong password ten times for one username gives `Too many attempts. Try again in a few minutes.`
6. Check the Supabase logs for `auth-login` and `auth-recover` errors.
