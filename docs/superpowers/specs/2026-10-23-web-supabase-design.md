# Weekly 150 web: accounts and Supabase (design)

Date: 2026-10-23. Status: draft for approval.

## Intent and why

Weekly 150 today is one HTML file published as a claude.ai Artifact. All data lives in the visitor's browser (localStorage), there are no accounts, and the Artifact host forbids network calls. The user wants a real multi-user web app: people register, log in, and each person sees only their own training data. It will later be deployed on Vercel with the database on Supabase. For now it must run fully on a local machine, with Supabase in Docker.

A later goal shapes the design without being built now: a personal AI assistant that reads a user's week and writes a summary and advice (the user is considering an OpenAI model). That needs a server-side secret, so the design must leave a clean place for server code.

## Goals

1. A web version of Weekly 150 with registration, email verification, login, logout and password reset.
2. Login is required. Nothing can be logged without an account.
3. Each user's data is private to them, enforced in the database (Row Level Security), not only in browser code.
4. Runs locally: Supabase stack in Docker plus a static web server, with one documented command sequence.
5. Ready to deploy later on Vercel (static hosting) and a Supabase cloud project by changing configuration only.
6. A place for server functions (Supabase Edge Functions) and secrets, so the AI assistant can be added later.

## Non-goals (now)

- The AI assistant itself (separate project later).
- Actually deploying to Vercel or creating the Supabase cloud project.
- Production email (custom SMTP). Locally, emails are caught by the Supabase CLI mail catcher.
- Social login (Google etc.), magic links, offline mode.
- Moving data from the old Artifact's localStorage into accounts.
- Changes to the Artifact. It stays frozen as it is at version 5.
- Rewriting the app in a framework.

## Anti-goals (would count as failure even if it works)

- A user can read or change another user's data by editing browser code or calling the API directly.
- A user's email can be found out from their username by an unauthenticated visitor.
- Exercise rules regress: `credit()`, WHO targets, balance, strength, light activity and GPX import must behave exactly as in the Artifact.
- A service role key or any other secret ends up in browser code or in the repository.

## Decided by the user

- Hosting target: Vercel for the web app, Supabase for database and auth. Local development in Docker.
- Accounts: login with **username and password**.
- Registration fields: **username, display name, email, age, password, verify password**.
- **Username is the primary key** of the user profile.
- Email exists for verification and password reset.
- **Email must be verified before the first login.**
- Login is mandatory; every user has their own data.
- Only the web version is developed from now on. The Artifact is left as it is.
- Stack choice was handed to Claude ("the most efficient for this task").

## Decided by Claude (stack and approach)

- **No framework.** The web app is the existing page, forked into a full HTML document. Reason: all logic already runs in the browser and is tested; Supabase handles auth and data security directly from the browser; Vercel serves static files with no build risk. Server logic goes into Supabase Edge Functions.
- **Source layout.** `weekly-150.html` stays as the frozen Artifact. A new `web/` folder holds the web app (`web/index.html` plus small JS files for auth and storage). `tools/gpx/gpx-lib.js` stays the shared parser; the rule "paste verbatim, keep both copies equal" now covers `web/` too (the Artifact copy is frozen, so in practice the web copy follows `tools/gpx/gpx-lib.js`).
- **Supabase client.** `@supabase/supabase-js` v2, loaded as an ES module from jsDelivr with an exact pinned version. No bundler.
- **Local stack.** Supabase CLI (`supabase start`), which runs Postgres, Auth, PostgREST, Edge Functions and the Mailpit mail catcher in Docker. The project's `supabase/` folder (config, migrations, functions, seed) is committed so the cloud project can be created from the same migrations. The static site is served by a small local server added to `.claude/launch.json` (port 8150 stays for the Artifact preview; the web app gets its own port).
- **Config.** The browser needs only the Supabase URL and the anon (publishable) key, both public by design. They live in `web/config.js`, generated from environment variables by a tiny Node script (used as the Vercel build command later, and run locally from `.env`). `.env` is git-ignored; `.env.example` documents every variable.
- **UI language.** English, matching the current app.
- **Visual style.** Login, register, verify and reset screens use the existing track meet identity and theme tokens (light, dark, auto) and work at 400px.

## Data model

### `public.profiles`

| Column | Type | Notes |
|---|---|---|
| `username` | text, **primary key** | lowercase, `^[a-z0-9_]{3,20}$` (Claude's call). Cannot be changed after registration. |
| `user_id` | uuid, unique, not null | references `auth.users(id)` on delete cascade |
| `display_name` | text, not null | 1 to 40 characters (Claude's call) |
| `created_at` | timestamptz | default now() |

Created by a trigger on `auth.users` insert, from the sign-up metadata (`username`, `display_name`, `age`). Email is not copied here; it stays in `auth.users`.

### `public.user_data`

One row per user per storage key, the same shape the page already stores.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | references `auth.users(id)` on delete cascade |
| `key` | text | one of `w150.meta`, `w150.sessions`, `w150.plan`, `w150.prefs`, `w150.breaks`, `w150.tracks` (check constraint) |
| `value` | jsonb, not null | exactly what the page would have put in localStorage |
| `updated_at` | timestamptz | set by trigger |

Primary key `(user_id, key)`.

**Age** lives only in `w150.prefs.age` (single source of truth, as today). The sign-up trigger writes the initial `w150.prefs` row as `{ "age": N }` only; the page fills its other defaults as it already does. The in-page "enter your age first" step is therefore already satisfied on first login. The age can still be changed in the app as today.

Age range at registration is the same as the page: a whole number from 0 to 120, validated in the form and again in the trigger (Claude's call). Ages under 5 are allowed and get the existing "no targets, see the WHO under-5 guideline" state.

`w150.theme` stays in the browser's localStorage (a device preference, not user data). `w150.probe` is no longer needed.

### Security (RLS)

- `user_data`: select, insert, update, delete only where `user_id = auth.uid()`.
- `profiles`: a user can select and update their own row (display name only). No direct inserts or deletes from the client.
- Nothing is readable by the anon role except through the Edge Functions and the `username_available` check below.

## Auth flows

Supabase Auth needs an email for password login. Login by username is done by an Edge Function so that emails are never exposed to the browser.

1. **Register.** Form: username, display name, email, age, password, verify password. Client checks: username format, display name length, age is a whole number in the app's accepted range, password at least 8 characters (Claude's call), passwords match. Username availability is checked live through an RPC `username_available(text) returns boolean` (reveals only whether a username exists). Then `supabase.auth.signUp({ email, password, options: { data: { username, display_name, age }, emailRedirectTo } })`. The trigger also re-checks the username and fails the sign-up if it is taken (race safety). The screen then says "Check your email to verify your account".
   - Note: with email confirmation on, Supabase does not report "email already registered" (to prevent enumeration). The UI shows the same "check your email" message in that case. Claude's call: accept this.
2. **Verify.** The email link returns to the app; the app shows the login screen with "Email verified, you can log in now".
3. **Log in.** Username and password are sent to Edge Function `auth-login`. It looks up the user by username with the service role, then signs in with email and password, and returns the session. The client calls `supabase.auth.setSession`. Errors: one generic "Wrong username or password" for unknown username or wrong password; a specific "Email not verified yet" with a "Resend verification email" button when the email is unconfirmed, shown **only after the password was checked as correct** (Claude's call), so the message never confirms an account to someone without the password. Unknown usernames still run a password check against a dummy hash or equivalent delay, so timing does not reveal them (Claude's call).
   - **Rate limiting** (Claude's call): Edge Functions are not covered by Supabase's built-in auth limits, so `auth-login` and `auth-recover` keep a small attempts table (per username and per IP, for example 10 failed logins per 15 minutes) and answer "Too many attempts, try again later" when exceeded.
   - Username existence itself is not secret (the live availability check reveals it); emails are.
4. **Resend verification** and **forgot password.** Edge Function `auth-recover` takes a username or an email and an action (`resend` or `reset`). It always answers with the same neutral message ("If that account exists, we sent an email"). Reset sends Supabase's recovery email; the link returns to the app, which shows a "Set a new password" form (password plus verify). After a successful reset, other sessions are signed out (`signOut({ scope: 'others' })`) and the user stays logged in on this device (Claude's call). Reset for an unverified account is allowed; clicking the recovery link proves ownership of the email (Claude's call).
5. **Log out.** A button inside the app. Clears the in-memory cache and returns to the login screen.
6. **Session.** Supabase's default persisted session in the browser. On page load: no session means the auth screens; a session means load data and show the app.

Mail in local development goes to Mailpit (opened in the browser from the Supabase CLI output). Production SMTP is a deployment task (non-goal now) and is listed in the deploy notes.

## Storage adapter (the only change inside the app logic)

The page reads and writes data only through `load(key, fallback)`, `save(key, value)` and `removeKey(key)` (plus one loop over localStorage keys near line 3378 that must be rewritten to use the cache). The adapter keeps those synchronous signatures:

- After login, before the app initialises, fetch all of the user's `user_data` rows into an in-memory cache. The app's existing init then runs unchanged and reads from the cache.
- `load` reads from the cache.
- `save` and `removeKey` update the cache immediately and queue an upsert or delete for that key, debounced per key (Claude's call: about 500 ms), so rapid edits send one request.
- A small status indicator shows "Saving", "Saved" or "Not saved, retrying". Failed writes retry with backoff, and the page warns before unload while writes are pending.
- **Concurrency across tabs or devices** (Claude's call). Values are whole arrays (`w150.sessions`, `w150.tracks`), so plain last write wins could silently erase a session logged on another device. Instead:
  - Every write is compare and set on a `version` counter (an RPC that only succeeds if the row still has the version the client last saw). `updated_at` is kept for information only.
  - On conflict, the client fetches the server value. For `w150.sessions` and `w150.tracks` it merges by `id` / `trackId` (union, the local version of an item wins, items removed locally since the last sync stay removed) and writes again. For the other keys the server value wins and the local change is dropped with a short notice.
  - The app refetches all keys when the tab becomes visible again, which makes conflicts rare in normal use (one person, phone and laptop).
- Payload size: `w150.tracks` is capped by the page at 30 tracks of 500 points (roughly 1 MB at most). That fits within Supabase request limits; no further cap now.
- The theme helper keeps using localStorage directly. The page's "storage blocked" mode (`storageOk`) now only concerns the theme; the data paths no longer depend on it.
- The localStorage key loop near line 3378 (used by "clear all data") is rewritten to work on the cache and the server.

**Clear all data** (Claude's call). For an account it deletes the user's `user_data` rows on the server, except that the age in `w150.prefs` is kept so the targets still apply. The account itself stays. The existing inline confirm is reworded to say the data is deleted from the account on all devices. Account deletion is not in scope.

**Privacy copy.** The footer line that says nothing is sent anywhere becomes false. It is replaced with plain copy saying the data is stored in the user's account and only they can see it (Claude's call).

**Sample data.** A new account starts the same way a first visit does today: sample data clearly marked, cleared by the first real entry (Claude's call: keep current behaviour). Seeding is decided by the absence of `w150.meta`, which the sign-up trigger does not create.

**Display name.** Shown in the app (Claude's call: on the race bib or in the header, whichever fits the existing layout at 400px).

## Server functions and secrets (prepared for later)

- `supabase/functions/auth-login` and `supabase/functions/auth-recover` (built now).
- `supabase/functions/.env` for local function secrets (git-ignored), with `.env.example` listing future keys such as `OPENAI_API_KEY` (unused for now).
- The future weekly AI summary can read `user_data` as the calling user (RLS applies) or be scheduled with `pg_cron`. Nothing for it is built now.

## Local development (what "done" looks like)

From a clean checkout with Docker Desktop and Node installed:

1. `npx supabase start` brings up the stack and applies migrations.
2. Copy `.env.example` to `.env`, fill the local URL and anon key printed by the CLI (or a script does it), generate `web/config.js`.
3. Start the web preview server.
4. A person can register, open the verification email in Mailpit, verify, log in by username, log sessions, import a GPX file, reload and see the same data, log out, and reset a forgotten password.
5. A second account sees none of the first account's data, and a direct REST call with the second account's token cannot read or write the first account's rows.

These steps are written in a new `docs/local-dev.md` (or a section of `docs/PROGRESS.md`).

**Local auth config** (Claude's call), in the committed `supabase/config.toml`: `enable_confirmations = true` for email, `site_url` set to the local web URL, `additional_redirect_urls` listing the local URL (the Vercel URLs are added in the cloud dashboard at deploy time, listed in the deploy notes).

**Automated proof** (Claude's call): there is no CI and no git repository yet, so tests run locally against the Docker stack. A Node script (or pgTAP via `supabase test db`) creates two users and proves the RLS rules and the username login function; the browser flows are checked by hand in the preview and recorded in the implementation log.

**Project docs.** `CLAUDE.md`, `docs/PROGRESS.md` and `docs/implementation-log.md` are updated for the web version: the Artifact rules (page contract, publish to the artifact URL) are marked as applying to the frozen Artifact only, and the web app's verify and run steps are added.

## Deployment preparation (documented, not executed)

- `vercel.json` (static output from `web/`, build command generates `config.js` from Vercel environment variables).
- Deploy notes: create the Supabase project, `supabase link` and `supabase db push`, deploy the Edge Functions, set Auth site URL and redirect URLs to the Vercel domain, configure custom SMTP, set Vercel env vars.
- The project is not a git repository yet. Vercel deploys from git or its CLI; initialising git is left to the user when they deploy.

## Constraints carried over

- `credit()` remains the only route for aerobic minutes.
- Storage keys `w150.*` and their value shapes stay backward compatible (add fields with defaults, never rename).
- Theme tokens defined in all three theme blocks, 400px with no horizontal scroll, visible focus, reduced motion respected.
- `node tools/gpx/gpx-lib.test.js` stays at 50 passed.
- No em dashes or en dashes anywhere. No Claude or Anthropic attribution.
- The Artifact page contract (no html/head/body tags, no network) no longer applies to `web/`, which is a normal HTML document. It still applies to the frozen `weekly-150.html`.

## Left to the builder

- Exact file split inside `web/` and how the page script is split (or not) into files.
- Local static server choice and port.
- Edge Function internals, error codes, and rate limiting beyond Supabase defaults.
- Whether SQL tests for RLS use pgTAP (`supabase test db`) or a Node script; some automated proof of goal 5 is expected.
- Exact copy for the auth screens, following the existing voice.
