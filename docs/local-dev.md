# Local development (web version)

## Edge Functions (auth-login, auth-recover)

Username login and recovery run as Supabase Edge Functions in `supabase/functions/`.

- Serve them with `npx supabase functions serve` in a second terminal while the stack is up
  (`npx supabase start`). Keep it running; it hot reloads on file changes. A stack started
  before the function folders existed serves no functions at all ("Function not found", 404).
- Optional local secrets go in `supabase/functions/.env` (git-ignored, never commit it).
  `AUTH_REDIRECT_ORIGINS` (comma separated) lists the origins allowed for CORS and for the
  `redirectTo` of recovery emails. Default when unset: `http://127.0.0.1:8160,http://localhost:8160`.
  In the cloud set it with `supabase secrets set AUTH_REDIRECT_ORIGINS=...`.
- The local Kong gateway answers CORS preflight itself and sends `Access-Control-Allow-Origin: *`.
  The functions' own origin check only takes effect in the cloud.
- Smoke tests: `npm run test:smoke` (needs the stack and the functions served). The tests clear
  `public.auth_attempts` first so reruns do not trip the rate limits.
