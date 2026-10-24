// auth-login: log in by username and password without exposing the account email.
// POST { username, password } -> 200 { session } | 400 | 401 | 403 | 429 | 500
// The username is resolved to the email server side (public.profiles -> Auth admin API),
// then GoTrue checks the password. Every non-200 answer takes at least PAD_MS.
//
// Rate limit (reserve then release): before the password check one attempt row is inserted
// per bucket (username, IP) and counted, so concurrent guesses see each other. The rows stay
// only for failed logins (wrong password or unknown username). A correct password (200, 403),
// a 429 and a server error release them.
import {
  adminClient,
  anonClient,
  clientIp,
  COPY,
  emailForUsername,
  json,
  normaliseUsername,
  PAD_MS,
  padTo,
  preflight,
  readJson,
  releaseAttempts,
  reserveAttempt,
} from "../_shared/auth.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

const USER_MAX = 10;
const IP_MAX = 30;
const WINDOW_MINUTES = 15;
// Unknown usernames still run a password check against this address, so the work is similar.
const DUMMY_EMAIL = "nobody@invalid.invalid";

Deno.serve(async (req: Request) => {
  const started = Date.now();
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return preflight(origin);

  const fail = async (status: number, body: unknown) => {
    await padTo(PAD_MS, started);
    return json(status, body, origin);
  };

  if (req.method !== "POST") return fail(405, { error: "method_not_allowed" });

  const body = await readJson(req);
  const rawUsername = body?.username;
  const password = body?.password;
  if (typeof rawUsername !== "string" || typeof password !== "string") {
    return fail(400, { error: "bad_request" });
  }
  const username = normaliseUsername(rawUsername);
  if (!username || !password) return fail(400, { error: "bad_request" });

  let admin: SupabaseClient | null = null;
  const reserved: number[] = [];
  const release = () => releaseAttempts(admin!, reserved);
  const serverError = () => fail(500, { error: "server_error", message: COPY.serverError });

  try {
    admin = adminClient();
    const byUser = await reserveAttempt(admin, "login:u:" + username.slice(0, 64), USER_MAX, WINDOW_MINUTES);
    reserved.push(byUser.id);
    const byIp = await reserveAttempt(admin, "login:ip:" + clientIp(req), IP_MAX, WINDOW_MINUTES);
    reserved.push(byIp.id);
    if (byUser.limited || byIp.limited) {
      await release();
      return fail(429, { error: "rate_limited", message: COPY.rateLimited });
    }

    const email = await emailForUsername(admin, username);
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: email ?? DUMMY_EMAIL,
      password,
    });

    if (email && !error && data.session) {
      await release();
      const s = data.session;
      return json(200, {
        session: {
          access_token: s.access_token,
          refresh_token: s.refresh_token,
          expires_in: s.expires_in,
          expires_at: s.expires_at,
          token_type: s.token_type,
          user: { id: s.user.id },
        },
      }, origin);
    }

    // GoTrue reports email_not_confirmed only after the password was checked as correct.
    if (email && error?.code === "email_not_confirmed") {
      await release();
      return fail(403, { error: "email_not_confirmed", message: COPY.emailNotConfirmed });
    }

    // Wrong password, or unknown username (the dummy check also answers invalid_credentials):
    // a failed login, so the reserved rows stay.
    if (error?.code === "invalid_credentials") {
      return fail(401, { error: "invalid_credentials", message: COPY.invalidCredentials });
    }

    // Anything else (GoTrue throttling, 5xx, network) is not the user's fault and must not
    // count against them or claim the password was wrong.
    console.error("auth-login: signInWithPassword", error?.status, error?.code, error?.message ?? "no session");
    await release();
    return serverError();
  } catch (e) {
    console.error("auth-login:", e instanceof Error ? e.message : String(e));
    if (admin && reserved.length) {
      await release().catch((r) => console.error("auth-login:", r instanceof Error ? r.message : String(r)));
    }
    return serverError();
  }
});
