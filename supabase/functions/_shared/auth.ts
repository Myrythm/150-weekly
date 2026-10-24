// Shared helpers for the auth-login and auth-recover Edge Functions.
// Emails never leave the server: responses carry only fixed copy, error codes and the session.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

export const COPY = {
  invalidCredentials: "Wrong username or password.",
  emailNotConfirmed: "Email not verified yet.",
  rateLimited: "Too many attempts. Try again in a few minutes.",
  recoverSent: "If that account exists, we sent an email.",
} as const;

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// Minimum time for every non-200 answer, so timing does not reveal whether an account exists.
export const PAD_MS = 400;

const DEFAULT_ORIGINS = "http://127.0.0.1:8160,http://localhost:8160";

export function allowedOrigins(): string[] {
  const raw = Deno.env.get("AUTH_REDIRECT_ORIGINS") || DEFAULT_ORIGINS;
  return raw.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): boolean {
  return !!origin && allowedOrigins().includes(origin);
}

export function normaliseUsername(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

export function corsHeaders(origin: string | null): HeadersInit {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function preflight(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function padTo(ms: number, started: number): Promise<void> {
  const wait = started + ms - Date.now();
  return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0].trim();
  return first || "unknown";
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error("missing env " + name);
  return v;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

// Service role client: bypasses RLS. Used only inside the functions, never sent anywhere.
export function adminClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), noSession);
}

// Fresh anon client per request, so no session is shared between callers.
export function anonClient(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), noSession);
}

function windowStart(windowMinutes: number): string {
  return new Date(Date.now() - windowMinutes * 60_000).toISOString();
}

// Number of attempts recorded for a bucket within the window. Throws on database errors.
export async function countAttempts(
  admin: SupabaseClient,
  bucket: string,
  windowMinutes: number,
): Promise<number> {
  const { count, error } = await admin
    .from("auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .gte("created_at", windowStart(windowMinutes));
  if (error) throw new Error("auth_attempts count failed: " + error.message);
  return count ?? 0;
}

export async function recordAttempt(admin: SupabaseClient, bucket: string): Promise<void> {
  const { error } = await admin.from("auth_attempts").insert({ bucket });
  if (error) throw new Error("auth_attempts insert failed: " + error.message);
}

// True when the bucket already holds max attempts in the window (check before attempting).
export async function isLimited(
  admin: SupabaseClient,
  bucket: string,
  max: number,
  windowMinutes: number,
): Promise<boolean> {
  return (await countAttempts(admin, bucket, windowMinutes)) >= max;
}

// Records one attempt, then returns true when the count in the window exceeds max.
export async function hitRateLimit(
  admin: SupabaseClient,
  bucket: string,
  max: number,
  windowMinutes: number,
): Promise<boolean> {
  await recordAttempt(admin, bucket);
  return (await countAttempts(admin, bucket, windowMinutes)) > max;
}

// Resolves a username to the account email strictly through public.profiles
// (username -> user_id) and the Auth admin API. Never trusts user_metadata.
// Returns null when there is no such account.
export async function emailForUsername(admin: SupabaseClient, username: string): Promise<string | null> {
  if (!USERNAME_RE.test(username)) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();
  if (error) throw new Error("profiles lookup failed: " + error.message);
  if (!data) return null;
  const { data: u, error: uerr } = await admin.auth.admin.getUserById(data.user_id as string);
  if (uerr || !u?.user?.email) {
    console.error("getUserById failed for a profile", uerr?.message ?? "no email");
    return null;
  }
  return u.user.email;
}
