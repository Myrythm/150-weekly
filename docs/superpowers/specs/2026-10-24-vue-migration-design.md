# Weekly 150 web: Vue migration design

Date: 2026-10-24. Branch: `feat/vue-migration` (from `feat/full-log-pages`, PR #2).

## Why

`web/js/app.js` (about 2,200 lines) keeps global state (`sessions`, `prefs`, `tracks`, `plan`) and renders by hand with `replaceChildren()`. Splitting the full log and the activity details into their own pages needed `<body data-page>`, three `wire*()` functions and many `PAGE` checks. More pages are coming (AI assistant, account deletion, data export). The app is not deployed yet, so this is the cheapest time to move to components and a router.

## Decisions (agreed with the owner)

1. **Stack:** Vue 3.5 (Composition API, `<script setup>`), Vue Router 5 in history mode, Pinia 4, Vite 8, Vitest 5 with `@vue/test-utils` and `happy-dom`. Plain JavaScript, no TypeScript. `@supabase/supabase-js` from npm, pinned to 2.118.0 (the version the current page loads).
2. **Not Next.js, not React:** all pages are behind a login, so server rendering and SEO bring nothing; Supabase (RLS, Edge Functions) is the server. Vue templates take the existing markup almost verbatim.
3. **Port, not redesign.** Behaviour, copy, element ids, classes and CSS come from `web/` at commit `83e82d3` (the reference). Exercise rules, sample data, Undo, merge and auth flows behave exactly as now. Visual changes are out of scope.
4. **Folder:** the Vue app lives in `app/` (Vite root `app/`, sources `app/src/`, tests `app/test/`, output `app/dist/`). `web/` stays untouched as the reference until the cutover task deletes it.
5. **Pure logic first.** Rules, dates, guideline table, sanitizers, sample data, history grouping and GPX effort move into framework-free ES modules in `app/src/core/` with unit tests before any component is written. `credit()` stays the only route for aerobic minutes.
6. **Sync engine unchanged in behaviour.** `web/js/store.js` and `web/js/merge.js` become ES modules in `app/src/sync/`; their 48 tests move to Vitest unchanged in substance. A Pinia store wraps them.
7. **GPX parser:** `tools/gpx/gpx-lib.js` stays the single source (the frozen Artifact pastes it verbatim). The build copies it to `app/public/gpx-lib.js` (git-ignored), `app/index.html` loads it as a classic script, and `app/src/core/gpx.js` re-exports `globalThis.GPX`.
8. **Routes:** `/` (week), `/log` (full log), `/activity/:id?from=week|log` (one activity), and the auth screens `/login`, `/register`, `/check-email`, `/forgot`, `/reset` (each takes `?next=`). Unknown paths redirect to `/`. Section anchors on the week page (`/#log`, `/#splits`, ...) scroll once the data is loaded.
9. **Config:** `tools/web/build.js` keeps its key guard and its inputs (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `--local`), and writes `app/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (git-ignored). Vercel env names do not change.
10. **Local dev:** Vite dev server on `127.0.0.1:8160` with `strictPort`, because GoTrue `site_url`, `additional_redirect_urls` and the functions' default `AUTH_REDIRECT_ORIGINS` all name port 8160.
11. **Deploy:** Vercel install `npm ci`, build `npm run app:build`, output `app/dist`, one SPA rewrite of every path to `/index.html` (static files win first). `cleanUrls` is no longer needed.
12. **Text safety:** text only through `{{ }}` or `textContent`; `v-html` is not allowed anywhere.

## Out of scope

New features, visual redesign, TypeScript, SSR, changes to `supabase/` (schema, RLS, Edge Functions), changes to the frozen Artifact `weekly-150.html`.
