# Weekly 150

Exercise habit app in two forms:
- `weekly-150.html`: the single-file Artifact, published as a private claude.ai Artifact at https://claude.ai/artifact/BLA3m85d4r3qry7wFm4UTa. **Frozen at v5.** Do not edit it.
- `web/`: the web version with Supabase accounts (username login through Edge Functions, verified email, per-user data with RLS), deployed on Vercel. This is where new work happens. Branch `feat/web-supabase`.

Start every session by reading `docs/PROGRESS.md` (status, features, storage, auth flows, open items, how to verify and deploy). Code-level notes for every change are in `docs/implementation-log.md`; the Artifact hosting rules are in `docs/page-contract.md`; run and deploy steps for the web app are in `docs/local-dev.md` and `docs/deploy.md`.

## Rules for the web app (`web/`, `supabase/`, `tools/web/`)
- `credit()` is the only route for aerobic minutes. Keep the `w150.*` keys and value shapes backward compatible (add fields with defaults, never rename). Server keys are only `w150.meta`, `w150.sessions`, `w150.plan`, `w150.prefs`, `w150.breaks`, `w150.tracks`; `w150.theme` stays in browser localStorage.
- Edit `tools/gpx/gpx-lib.js` only; `node tools/web/build.js` copies it to `web/js/gpx-lib.js` (generated, git-ignored). Keep `node tools/gpx/gpx-lib.test.js` green: 42 passed and 1 skipped without the owner's private GPX file, 50 passed with it.
- No secret in `web/` or in any committed file: only the Supabase URL and anon key reach the browser; the service role key and `OPENAI_API_KEY` stay in Supabase. `grep -rE "service_role|SERVICE_ROLE" web/` must return nothing.
- Colours only as tokens in all three theme blocks, 400px with no horizontal scroll, visible focus, a stable id on every control, all server and user text through `textContent`.
- Exact copy: `Wrong username or password.`, `If that account exists, we sent an email.`, `Too many attempts. Try again in a few minutes.`
- Run: `npm install`, `npm run db:start`, `npm run web:build:local`, `npm run functions:serve` (second terminal), start the `weekly150-web` server (`node tools/web/serve.js`, 127.0.0.1:8160). Details in `docs/local-dev.md`.
- Verify before calling a change done: `npm test`, `npm run db:test`, `npm run test:smoke`, then a browser check on `weekly150-web` (register, verify through Mailpit at 127.0.0.1:54324, log in, log a session, reload; 375px and desktop, light and dark). Never run `db:reset` or `db:stop` while someone else uses the stack.
- Deploy per `docs/deploy.md` (Supabase `db push`, functions with `--no-verify-jwt`, Vercel env `SUPABASE_URL` and `SUPABASE_ANON_KEY`).

## Rules for the frozen Artifact (`weekly-150.html` only)
- Obey `docs/page-contract.md` (no html/head/body tags, CSP: no external images or fetch, colours only as tokens in all three theme blocks, 400px with no horizontal scroll, localStorage only through try/catch helpers).
- `tools/gpx/gpx-lib.js` is pasted verbatim inside the page. If the Artifact is ever changed again, change both copies together.
- Verify with `bash tools/build-preview.sh` and the `weekly150-preview` server before publishing. Publish to the same artifact URL (read it first in a new conversation).

## Rules for all work
- Delegate to sub-agents by assessed difficulty: difficult to Opus, moderate to Sonnet, low to Haiku. One agent at a time on the same file (for example `web/js/app.js` or `weekly-150.html`).
- No em dashes or en dashes anywhere. Reply to the user in Indonesian.
- After a change, append to `docs/implementation-log.md` and update `docs/PROGRESS.md`.

<!-- claude-reflect: learned rules (saved from the band; edit freely) -->
## Learned rules
- Require login before any data can be recorded; each user's data must be stored separately on the server.
<!-- end claude-reflect -->
