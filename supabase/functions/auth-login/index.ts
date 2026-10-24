// auth-login: log in by username and password without exposing the account email.
// POST { username, password } -> 200 { session } | 400 | 401 | 403 | 429 | 500
// The username is resolved to the email server side (public.profiles -> Auth admin API),
// then GoTrue checks the password. Every non-200 answer takes at least PAD_MS.
import {
  adminClient,
  anonClient,
  clientIp,
  COPY,
  emailForUsername,
  isLimited,
  json,
  normaliseUsername,
  PAD_MS,
  padTo,
  preflight,
  readJson,
  recordAttempt,
} from "../_shared/auth.ts";

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

  try {
    const admin = adminClient();
    const userBucket = "login:u:" + username.slice(0, 64);
    const ipBucket = "login:ip:" + clientIp(req);

    // Only failed logins are recorded; check before attempting.
    if (
      await isLimited(admin, userBucket, USER_MAX, WINDOW_MINUTES) ||
      await isLimited(admin, ipBucket, IP_MAX, WINDOW_MINUTES)
    ) {
      return fail(429, { error: "rate_limited", message: COPY.rateLimited });
    }

    const email = await emailForUsername(admin, username);
    const { data, error } = await anonClient().auth.signInWithPassword({
      email: email ?? DUMMY_EMAIL,
      password,
    });

    if (email && !error && data.session) {
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
      return fail(403, { error: "email_not_confirmed", message: COPY.emailNotConfirmed });
    }

    if (error && error.code !== "invalid_credentials") {
      console.error("auth-login: signInWithPassword", error.status, error.code, error.message);
    }
    await recordAttempt(admin, userBucket);
    await recordAttempt(admin, ipBucket);
    return fail(401, { error: "invalid_credentials", message: COPY.invalidCredentials });
  } catch (e) {
    console.error("auth-login:", e instanceof Error ? e.message : String(e));
    return fail(500, { error: "server_error" });
  }
});
