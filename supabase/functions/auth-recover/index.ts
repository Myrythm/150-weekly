// auth-recover: resend the verification email or send a password reset email.
// POST { identifier, action: "resend" | "reset", redirectTo } -> always 200 with neutral copy,
// except 400 (bad request, action or redirect origin), 429 (rate limited) and 500.
// The identifier is an email (contains "@") or a username resolved server side.
// The email work runs after the answer is decided, so the answer and its timing are the same
// whether or not the account exists. GoTrue errors are logged, never returned.
import {
  adminClient,
  anonClient,
  clientIp,
  COPY,
  emailForUsername,
  hitRateLimit,
  isAllowedOrigin,
  json,
  normaliseUsername,
  PAD_MS,
  padTo,
  preflight,
  readJson,
} from "../_shared/auth.ts";

const IP_MAX = 10;
const ID_MAX = 3;
const WINDOW_MINUTES = 15;

type Action = "resend" | "reset";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function redirectOk(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return isAllowedOrigin(new URL(value).origin);
  } catch {
    return false;
  }
}

async function sendEmail(identifier: string, isEmail: boolean, action: Action, redirectTo?: string) {
  try {
    const email = isEmail ? identifier : await emailForUsername(adminClient(), identifier);
    if (!email) return;
    const auth = anonClient().auth;
    const { error } = action === "resend"
      ? await auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } })
      : await auth.resetPasswordForEmail(email, { redirectTo });
    if (error) console.error("auth-recover:", action, error.status, error.code, error.message);
  } catch (e) {
    console.error("auth-recover:", action, e instanceof Error ? e.message : String(e));
  }
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return preflight(origin);

  const answer = async (status: number, body: unknown) => {
    await padTo(PAD_MS, started);
    return json(status, body, origin);
  };

  if (req.method !== "POST") return answer(405, { error: "method_not_allowed" });

  const body = await readJson(req);
  const rawId = body?.identifier;
  const action = body?.action;
  const redirectTo = body?.redirectTo;
  if (typeof rawId !== "string" || !rawId.trim()) return answer(400, { error: "bad_request" });
  if (action !== "resend" && action !== "reset") return answer(400, { error: "bad_action" });
  if (redirectTo !== undefined && !redirectOk(redirectTo)) {
    return answer(400, { error: "bad_redirect" });
  }

  const isEmail = rawId.includes("@");
  const identifier = isEmail ? rawId.trim().toLowerCase() : normaliseUsername(rawId);

  try {
    const admin = adminClient();
    // Every request counts toward both buckets.
    const ipLimited = await hitRateLimit(admin, "recover:ip:" + clientIp(req), IP_MAX, WINDOW_MINUTES);
    const idLimited = await hitRateLimit(admin, "recover:id:" + identifier.slice(0, 254), ID_MAX, WINDOW_MINUTES);
    if (ipLimited || idLimited) {
      return answer(429, { error: "rate_limited", message: COPY.rateLimited });
    }
  } catch (e) {
    console.error("auth-recover:", e instanceof Error ? e.message : String(e));
    return answer(500, { error: "server_error" });
  }

  const work = sendEmail(identifier, isEmail, action, redirectTo as string | undefined);
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(work);
  } else {
    await work;
  }
  return answer(200, { message: COPY.recoverSent });
});
