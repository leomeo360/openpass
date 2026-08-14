import { ApiError, json, readJsonBody, readTextBody } from "./lib/http";
import type { Env } from "./types";

const encoder = new TextEncoder();
const sessionCookie = "openpass_admin";
const oauthStateCookie = "openpass_oauth_state";
const googleOneTapNonceCookie = "openpass_google_one_tap_nonce";
const sessionLifetimeSeconds = 12 * 60 * 60;
const oauthStateLifetimeSeconds = 10 * 60;
const googleOneTapNonceLifetimeSeconds = 10 * 60;
const googleJwksUrl = "https://www.googleapis.com/oauth2/v3/certs";
// The Cloudflare Workers production runtime rejects PBKDF2 iteration counts above 100,000.
const passwordIterations = 100_000;


export type AuthMode = "access" | "password" | "oauth" | "hybrid" | "none";
type OAuthProvider = "google" | "github";

export interface OAuthSession {
  userId: string;
  email: string;
  provider: OAuthProvider;
}

export function authMode(env: Env): AuthMode {
  const configured = (env.AUTH_MODE ?? "").trim().toLowerCase();
  if (configured === "password" || configured === "oauth" || configured === "hybrid" || configured === "none" || configured === "access") return configured;
  return env.ENVIRONMENT === "development" && !env.ADMIN_EMAILS ? "none" : "access";
}

export async function handleAdminAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const mode = authMode(env);
  if (request.method === "GET" && url.pathname === "/admin/auth/config") {
    const passwordConfigured = passwordAuthConfigured(env);
    const oauthConfigured = oauthAuthConfigured(env);
    const googleOneTapEnabled = (mode === "oauth" || mode === "hybrid")
      && oauthProviderConfigured(env, "google")
      && Boolean(env.AUTH_SESSION_SECRET && env.AUTH_SESSION_SECRET.length >= 32);
    const nonce = googleOneTapEnabled ? crypto.randomUUID() : null;
    const config = {
      mode,
      configured: mode === "password"
        ? passwordConfigured
        : mode === "oauth"
          ? oauthConfigured
          : mode === "hybrid"
            ? passwordConfigured || oauthConfigured
            : true,
      password_configured: passwordConfigured,
      oauth_configured: oauthConfigured,
      registration_enabled: registrationEnabled(env),
      providers: {
        google: oauthProviderConfigured(env, "google"),
        github: oauthProviderConfigured(env, "github"),
      },
      one_tap: googleOneTapEnabled
        ? {
          enabled: true,
          client_id: env.GOOGLE_CLIENT_ID!,
          nonce: nonce!,
          login_uri: googleOneTapCallbackUrl(url, env),
        }
        : { enabled: false },
    };
    if (!googleOneTapEnabled) return json(config, 200, { "cache-control": "no-store" });
    const nonceToken = await createSignedToken({
      kind: "google_one_tap_nonce",
      nonce,
      expires_at: Date.now() + googleOneTapNonceLifetimeSeconds * 1_000,
    }, env.AUTH_SESSION_SECRET!);
    return json(config, 200, {
      "cache-control": "no-store",
      "set-cookie": googleOneTapNonceCookieHeader(url, nonceToken),
    });
  }
  if (request.method === "POST" && url.pathname === "/admin/auth/logout") {
    return json({ ok: true }, 200, { "set-cookie": expiredSessionCookie(url) });
  }
  if (request.method === "POST" && url.pathname === "/api/auth/callback/google") {
    if (mode !== "oauth" && mode !== "hybrid") throw new ApiError(404, "AUTH_MODE_MISMATCH", "Google One Tap is not enabled.");
    if (!oauthProviderConfigured(env, "google") || !env.AUTH_SESSION_SECRET || env.AUTH_SESSION_SECRET.length < 32) {
      throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Google authentication credentials have not been configured.");
    }
    return finishGoogleOneTap(request, url, env);
  }
  const oauthMatch = /^\/admin\/auth\/oauth\/(google|github)\/(start|callback)$/.exec(url.pathname);
  if (request.method === "GET" && oauthMatch) {
    if (mode !== "oauth" && mode !== "hybrid") throw new ApiError(404, "AUTH_MODE_MISMATCH", "Social login is not enabled.");
    const provider = oauthMatch[1] as OAuthProvider;
    if (!oauthProviderConfigured(env, provider) || !env.AUTH_SESSION_SECRET) {
      throw new ApiError(503, "AUTH_NOT_CONFIGURED", `${providerName(provider)} OAuth credentials have not been configured.`);
    }
    return oauthMatch[2] === "start"
      ? startOAuth(url, env, provider)
      : finishOAuth(request, url, env, provider);
  }
  if (request.method !== "POST" || url.pathname !== "/admin/auth/login") {
    throw new ApiError(404, "NOT_FOUND", "Authentication endpoint not found.");
  }
  if (mode !== "password" && mode !== "hybrid") throw new ApiError(404, "AUTH_MODE_MISMATCH", "Password login is not enabled.");
  if (!passwordAuthConfigured(env)) {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Password login secrets have not been configured.");
  }

  const sourceIp = request.headers.get("cf-connecting-ip") ?? "unknown";
  await enforceLoginRateLimit(env, sourceIp);
  const body = await readJsonBody(request, 8_192);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const expectedUsername = env.ADMIN_USERNAME?.trim() || "admin";
  const passwordValid = password.length <= 1_024 && await verifyPassword(password, env.ADMIN_PASSWORD_HASH!);
  const usernameValid = await constantTimeTextEqual(username, expectedUsername);
  if (!usernameValid || !passwordValid) {
    await recordLoginFailure(env, sourceIp);
    throw new ApiError(401, "INVALID_CREDENTIALS", "The username or password is incorrect.");
  }
  await env.DB.prepare("DELETE FROM admin_login_attempts WHERE source_ip = ?").bind(sourceIp).run();
  const token = await createSignedToken({
    kind: "password",
    username: expectedUsername,
    expires_at: Date.now() + sessionLifetimeSeconds * 1_000,
  }, env.AUTH_SESSION_SECRET!);
  return json({ ok: true, username: expectedUsername }, 200, { "set-cookie": sessionCookieHeader(url, token) });
}

export async function passwordSessionUser(request: Request, env: Env): Promise<string | null> {
  if (!passwordAuthConfigured(env)) return null;
  const token = cookieValue(request.headers.get("cookie") ?? "", sessionCookie);
  if (!token) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra) return null;
  const expectedSignature = await sign(payloadPart, env.AUTH_SESSION_SECRET!);
  if (!await constantTimeTextEqual(signaturePart, expectedSignature)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as { kind?: unknown; username?: unknown; expires_at?: unknown };
    if (payload.kind !== undefined && payload.kind !== "password") return null;
    if (typeof payload.username !== "string" || typeof payload.expires_at !== "number" || payload.expires_at <= Date.now()) return null;
    return payload.username;
  } catch {
    return null;
  }
}

export async function oauthSessionUser(request: Request, env: Env): Promise<OAuthSession | null> {
  if (!env.AUTH_SESSION_SECRET || env.AUTH_SESSION_SECRET.length < 32) return null;
  const payload = await verifySignedToken(cookieValue(request.headers.get("cookie") ?? "", sessionCookie), env.AUTH_SESSION_SECRET);
  if (
    payload?.kind !== "oauth"
    || typeof payload.user_id !== "string"
    || typeof payload.email !== "string"
    || (payload.provider !== "google" && payload.provider !== "github")
  ) return null;
  const user = await env.DB.prepare("SELECT id, email FROM users WHERE id = ? AND status = 'active'")
    .bind(payload.user_id).first<{ id: string; email: string }>();
  if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) return null;
  return { userId: user.id, email: user.email.toLowerCase(), provider: payload.provider };
}

export async function createPasswordHash(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  if (password.length < 12) throw new Error("Password must contain at least 12 characters.");
  const derived = await derivePassword(password, salt, passwordIterations);
  return `pbkdf2_sha256$${passwordIterations}$${base64UrlEncode(salt)}$${base64UrlEncode(derived)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expectedText, extra] = encoded.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2_sha256" || extra || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
  try {
    const salt = base64UrlDecode(saltText);
    const expected = base64UrlDecode(expectedText);
    const actual = await derivePassword(password, salt, iterations);
    return constantTimeBytesEqual(actual, expected);
  } catch {
    return false;
  }
}

function passwordAuthConfigured(env: Env): boolean {
  return Boolean(env.ADMIN_PASSWORD_HASH && env.AUTH_SESSION_SECRET && env.AUTH_SESSION_SECRET.length >= 32);
}

function oauthAuthConfigured(env: Env): boolean {
  return Boolean(env.AUTH_SESSION_SECRET && env.AUTH_SESSION_SECRET.length >= 32
    && (oauthProviderConfigured(env, "google") || oauthProviderConfigured(env, "github")));
}

function oauthProviderConfigured(env: Env, provider: OAuthProvider): boolean {
  return provider === "google"
    ? Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
    : Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}

function registrationEnabled(env: Env): boolean {
  return (env.REGISTRATION_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

async function startOAuth(url: URL, env: Env, provider: OAuthProvider): Promise<Response> {
  const state = await createSignedToken({
    kind: "oauth_state",
    provider,
    nonce: crypto.randomUUID(),
    expires_at: Date.now() + oauthStateLifetimeSeconds * 1_000,
  }, env.AUTH_SESSION_SECRET!);
  const redirectUri = oauthCallbackUrl(url, provider, env);
  const authorization = provider === "google"
    ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
    : new URL("https://github.com/login/oauth/authorize");
  authorization.searchParams.set("client_id", provider === "google" ? env.GOOGLE_CLIENT_ID! : env.GITHUB_CLIENT_ID!);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("scope", provider === "google" ? "openid email profile" : "read:user user:email");
  if (provider === "google") {
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("prompt", "select_account");
  }
  const headers = new Headers({ location: authorization.toString(), "cache-control": "no-store" });
  headers.append("set-cookie", oauthStateCookieHeader(url, state));
  return new Response(null, { status: 302, headers });
}

async function finishOAuth(request: Request, url: URL, env: Env, provider: OAuthProvider): Promise<Response> {
  const oauthError = url.searchParams.get("error");
  if (oauthError) return loginRedirect(url, `oauth_${oauthError}`, true);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const cookieState = cookieValue(request.headers.get("cookie") ?? "", oauthStateCookie);
  if (!code || !state || !cookieState || state !== cookieState) {
    throw new ApiError(400, "INVALID_OAUTH_STATE", "The social login request is invalid or has expired.");
  }
  const statePayload = await verifySignedToken(state, env.AUTH_SESSION_SECRET!);
  if (statePayload?.kind !== "oauth_state" || statePayload.provider !== provider) {
    throw new ApiError(400, "INVALID_OAUTH_STATE", "The social login request is invalid or has expired.");
  }

  const profile = provider === "google"
    ? await googleProfile(code, oauthCallbackUrl(url, provider, env), env)
    : await githubProfile(code, oauthCallbackUrl(url, provider, env), env);
  const session = await completeOAuthProfile(env, provider, profile);
  const headers = new Headers({ location: session.location, "cache-control": "no-store" });
  headers.append("set-cookie", sessionCookieHeader(url, session.token));
  headers.append("set-cookie", expiredOAuthStateCookie(url));
  return new Response(null, { status: 302, headers });
}

async function finishGoogleOneTap(request: Request, url: URL, env: Env): Promise<Response> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    throw new ApiError(400, "INVALID_ONE_TAP_REQUEST", "Google One Tap must use a form POST.");
  }
  const form = new URLSearchParams(await readTextBody(request, 16_384));
  const csrfCookie = cookieValue(request.headers.get("cookie") ?? "", "g_csrf_token");
  const csrfBody = form.get("g_csrf_token");
  if (!csrfCookie || !csrfBody || csrfCookie.length > 1_024 || csrfBody.length > 1_024
    || !await constantTimeTextEqual(csrfCookie, csrfBody)) {
    throw new ApiError(400, "INVALID_ONE_TAP_CSRF", "The Google One Tap CSRF check failed.");
  }
  const nonceToken = cookieValue(request.headers.get("cookie") ?? "", googleOneTapNonceCookie);
  const noncePayload = await verifySignedToken(nonceToken, env.AUTH_SESSION_SECRET!);
  if (noncePayload?.kind !== "google_one_tap_nonce" || typeof noncePayload.nonce !== "string") {
    throw new ApiError(400, "INVALID_ONE_TAP_NONCE", "The Google One Tap request is invalid or has expired.");
  }
  const credential = form.get("credential") ?? "";
  if (!credential || credential.length > 12_000) {
    throw new ApiError(400, "INVALID_GOOGLE_CREDENTIAL", "A valid Google One Tap credential is required.");
  }
  const profile = await googleOneTapProfile(credential, noncePayload.nonce, env);
  const session = await completeOAuthProfile(env, "google", profile);
  const headers = new Headers({ location: session.location, "cache-control": "no-store" });
  headers.append("set-cookie", sessionCookieHeader(url, session.token));
  headers.append("set-cookie", expiredGoogleOneTapNonceCookie(url));
  return new Response(null, { status: 303, headers });
}

async function completeOAuthProfile(
  env: Env,
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<{ token: string; location: string }> {
  const existingIdentity = await env.DB.prepare(
    "SELECT u.id, u.email, u.status FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id WHERE oa.provider = ? AND oa.provider_user_id = ?",
  ).bind(provider, profile.providerUserId).first<{ id: string; email: string; status: string }>();
  if (existingIdentity?.status === "disabled") throw new ApiError(403, "ACCOUNT_DISABLED", "This account has been disabled.");
  if (!existingIdentity && !registrationEnabled(env)) {
    throw new ApiError(403, "REGISTRATION_DISABLED", "New account registration is currently disabled.");
  }

  const timestamp = new Date().toISOString();
  const existingUser = existingIdentity ?? await env.DB.prepare("SELECT id, email, status FROM users WHERE email = ? COLLATE NOCASE")
    .bind(profile.email).first<{ id: string; email: string; status: string }>();
  if (existingUser?.status === "disabled") throw new ApiError(403, "ACCOUNT_DISABLED", "This account has been disabled.");
  const userId = existingUser?.id ?? crypto.randomUUID();
  if (!existingUser) {
    await env.DB.prepare(
      "INSERT INTO users(id, email, display_name, avatar_url, status, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
    ).bind(userId, profile.email, profile.name, profile.avatarUrl, timestamp, timestamp, timestamp).run();
  } else {
    await env.DB.prepare(
      "UPDATE users SET display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url), last_login_at = ?, updated_at = ? WHERE id = ?",
    ).bind(profile.name, profile.avatarUrl, timestamp, timestamp, userId).run();
  }
  await env.DB.prepare(
    `INSERT INTO oauth_accounts(id, user_id, provider, provider_user_id, provider_email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_user_id) DO UPDATE SET provider_email = excluded.provider_email, updated_at = excluded.updated_at`,
  ).bind(crypto.randomUUID(), userId, provider, profile.providerUserId, profile.email, timestamp, timestamp).run();

  const sessionEmail = existingUser?.email.toLowerCase() ?? profile.email;
  const token = await createSignedToken({
    kind: "oauth",
    user_id: userId,
    email: sessionEmail,
    provider,
    expires_at: Date.now() + sessionLifetimeSeconds * 1_000,
  }, env.AUTH_SESSION_SECRET!);
  const hasAccess = await accountHasAccess(env, sessionEmail);
  return {
    token,
    location: hasAccess ? "/admin/" : "/admin/login.html?registered=1&pending=1",
  };
}

async function googleOneTapProfile(credential: string, expectedNonce: string, env: Env): Promise<OAuthProfile> {
  const [headerPart, payloadPart, signaturePart, extra] = credential.split(".");
  if (!headerPart || !payloadPart || !signaturePart || extra) throw invalidGoogleCredential();

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  let signature: Uint8Array;
  try {
    const decodedHeader: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerPart)));
    const decodedClaims: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart)));
    if (!decodedHeader || typeof decodedHeader !== "object" || Array.isArray(decodedHeader)
      || !decodedClaims || typeof decodedClaims !== "object" || Array.isArray(decodedClaims)) {
      throw new Error("Invalid JWT objects.");
    }
    header = decodedHeader as Record<string, unknown>;
    claims = decodedClaims as Record<string, unknown>;
    signature = base64UrlDecode(signaturePart);
  } catch {
    throw invalidGoogleCredential();
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 256) {
    throw invalidGoogleCredential();
  }

  let jwksResponse: Response;
  try {
    jwksResponse = await fetch(googleJwksUrl, { headers: { accept: "application/json" } });
  } catch {
    throw new ApiError(502, "GOOGLE_IDENTITY_UNAVAILABLE", "Google identity verification is temporarily unavailable.");
  }
  if (!jwksResponse.ok) {
    throw new ApiError(502, "GOOGLE_IDENTITY_UNAVAILABLE", "Google identity verification is temporarily unavailable.");
  }
  let jwks: { keys?: unknown };
  try {
    jwks = await jwksResponse.json() as { keys?: unknown };
  } catch {
    throw new ApiError(502, "GOOGLE_IDENTITY_UNAVAILABLE", "Google identity verification is temporarily unavailable.");
  }
  const keyRecord = Array.isArray(jwks.keys)
    ? jwks.keys.find((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
      const key = candidate as Record<string, unknown>;
      return key.kid === header.kid
        && key.kty === "RSA"
        && (key.alg === undefined || key.alg === "RS256")
        && (key.use === undefined || key.use === "sig");
    }) as Record<string, unknown> | undefined
    : undefined;
  if (!keyRecord) throw invalidGoogleCredential();

  let signatureValid = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      keyRecord as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    signatureValid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      Uint8Array.from(signature),
      encoder.encode(`${headerPart}.${payloadPart}`),
    );
  } catch {
    throw new ApiError(502, "GOOGLE_IDENTITY_UNAVAILABLE", "Google identity verification is temporarily unavailable.");
  }
  if (!signatureValid) throw invalidGoogleCredential();

  const now = Math.floor(Date.now() / 1_000);
  const clockSkewSeconds = 60;
  const issuerValid = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  const audiences = typeof claims.aud === "string"
    ? [claims.aud]
    : Array.isArray(claims.aud) && claims.aud.every((audience) => typeof audience === "string")
      ? claims.aud as string[]
      : [];
  const audienceValid = audiences.includes(env.GOOGLE_CLIENT_ID!)
    && (audiences.length <= 1 || claims.azp === env.GOOGLE_CLIENT_ID);
  const timestampsValid = Number.isInteger(claims.exp)
    && (claims.exp as number) > now - clockSkewSeconds
    && Number.isInteger(claims.iat)
    && (claims.iat as number) <= now + clockSkewSeconds
    && (claims.nbf === undefined || (Number.isInteger(claims.nbf) && (claims.nbf as number) <= now + clockSkewSeconds));
  const subjectValid = typeof claims.sub === "string" && claims.sub.length > 0 && claims.sub.length <= 255;
  const nonceValid = typeof claims.nonce === "string" && await constantTimeTextEqual(claims.nonce, expectedNonce);
  if (!issuerValid || !audienceValid || !timestampsValid || !subjectValid || !nonceValid) {
    throw invalidGoogleCredential();
  }
  if (typeof claims.email !== "string" || claims.email_verified !== true) {
    throw new ApiError(403, "OAUTH_EMAIL_UNVERIFIED", "Google did not return a verified email address.");
  }
  return {
    providerUserId: claims.sub as string,
    email: normalizeEmail(claims.email),
    name: typeof claims.name === "string" ? claims.name.slice(0, 200) : null,
    avatarUrl: safeAvatarUrl(claims.picture),
  };
}

function invalidGoogleCredential(): ApiError {
  return new ApiError(401, "INVALID_GOOGLE_CREDENTIAL", "The Google sign-in credential is invalid or has expired.");
}

async function googleProfile(code: string, redirectUri: string, env: Env): Promise<OAuthProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = await tokenResponse.json() as { access_token?: unknown };
  if (!tokenResponse.ok || typeof token.access_token !== "string") throw new ApiError(502, "OAUTH_EXCHANGE_FAILED", "Google login could not be completed.");
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
  });
  const profile = await profileResponse.json() as { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown; picture?: unknown };
  if (!profileResponse.ok || typeof profile.sub !== "string" || typeof profile.email !== "string" || profile.email_verified !== true) {
    throw new ApiError(403, "OAUTH_EMAIL_UNVERIFIED", "Google did not return a verified email address.");
  }
  return {
    providerUserId: profile.sub,
    email: normalizeEmail(profile.email),
    name: typeof profile.name === "string" ? profile.name.slice(0, 200) : null,
    avatarUrl: safeAvatarUrl(profile.picture),
  };
}

async function githubProfile(code: string, redirectUri: string, env: Env): Promise<OAuthProfile> {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: env.GITHUB_CLIENT_ID!,
      client_secret: env.GITHUB_CLIENT_SECRET!,
      redirect_uri: redirectUri,
    }),
  });
  const token = await tokenResponse.json() as { access_token?: unknown };
  if (!tokenResponse.ok || typeof token.access_token !== "string") throw new ApiError(502, "OAUTH_EXCHANGE_FAILED", "GitHub login could not be completed.");
  const headers = { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "OpenPass" };
  const [profileResponse, emailsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);
  const profile = await profileResponse.json() as { id?: unknown; name?: unknown; login?: unknown; avatar_url?: unknown };
  const emails = await emailsResponse.json() as Array<{ email?: unknown; primary?: unknown; verified?: unknown }>;
  const email = Array.isArray(emails)
    ? emails.find((item) => item.primary === true && item.verified === true && typeof item.email === "string")
      ?? emails.find((item) => item.verified === true && typeof item.email === "string")
    : undefined;
  if (!profileResponse.ok || !emailsResponse.ok || (typeof profile.id !== "number" && typeof profile.id !== "string") || !email || typeof email.email !== "string") {
    throw new ApiError(403, "OAUTH_EMAIL_UNVERIFIED", "GitHub did not return a verified email address.");
  }
  return {
    providerUserId: String(profile.id),
    email: normalizeEmail(email.email),
    name: typeof profile.name === "string" ? profile.name.slice(0, 200) : typeof profile.login === "string" ? profile.login.slice(0, 200) : null,
    avatarUrl: safeAvatarUrl(profile.avatar_url),
  };
}

interface OAuthProfile {
  providerUserId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) || normalized.length > 320) {
    throw new ApiError(400, "INVALID_OAUTH_EMAIL", "The identity provider returned an invalid email address.");
  }
  return normalized;
}

function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function accountHasAccess(env: Env, email: string): Promise<boolean> {
  const allowed = (env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowed.includes(email.toLowerCase())) return true;
  const assignment = await env.DB.prepare("SELECT 1 AS allowed FROM project_admins WHERE email = ? AND status = 'active' LIMIT 1")
    .bind(email.toLowerCase()).first<{ allowed: number }>();
  return Boolean(assignment);
}

function oauthCallbackUrl(url: URL, provider: OAuthProvider, env: Env): string {
  return `${publicAuthOrigin(url, env)}/admin/auth/oauth/${provider}/callback`;
}

function googleOneTapCallbackUrl(url: URL, env: Env): string {
  return `${publicAuthOrigin(url, env)}/api/auth/callback/google`;
}

function publicAuthOrigin(url: URL, env: Env): string {
  let origin = url.origin;
  if (env.OAUTH_PUBLIC_ORIGIN) {
    try {
      const configured = new URL(env.OAUTH_PUBLIC_ORIGIN);
      if (configured.protocol !== "https:" && env.ENVIRONMENT !== "development") {
        throw new ApiError(500, "AUTH_CONFIGURATION_ERROR", "OAUTH_PUBLIC_ORIGIN must use HTTPS in production.");
      }
      origin = configured.origin;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "AUTH_CONFIGURATION_ERROR", "OAUTH_PUBLIC_ORIGIN is not a valid absolute URL.");
    }
  }
  return origin;
}

function providerName(provider: OAuthProvider): string {
  return provider === "google" ? "Google" : "GitHub";
}

function loginRedirect(url: URL, error: string, expireState = false): Response {
  const location = new URL("/admin/login.html", url);
  location.searchParams.set("error", error);
  const headers = new Headers({ location: location.toString(), "cache-control": "no-store" });
  if (expireState) headers.append("set-cookie", expiredOAuthStateCookie(url));
  return new Response(null, { status: 302, headers });
}

async function createSignedToken(payloadValue: Record<string, unknown>, secret: string): Promise<string> {
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(payloadValue)));
  return `${payload}.${await sign(payload, secret)}`;
}

async function verifySignedToken(token: string | null, secret: string): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra) return null;
  const expectedSignature = await sign(payloadPart, secret);
  if (!await constantTimeTextEqual(signaturePart, expectedSignature)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as Record<string, unknown>;
    if (typeof payload.expires_at !== "number" || payload.expires_at <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = Uint8Array.from(salt);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations }, key, 256));
}

async function constantTimeTextEqual(left: string, right: string): Promise<boolean> {
  const leftDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(left)));
  const rightDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(right)));
  return constantTimeBytesEqual(leftDigest, rightDigest);
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length === 0 || right.length === 0) return left.length === right.length;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index % left.length] ?? 0) ^ (right[index % right.length] ?? 0);
  return difference === 0;
}

async function enforceLoginRateLimit(env: Env, sourceIp: string): Promise<void> {
  const row = await env.DB.prepare("SELECT failed_attempts, locked_until FROM admin_login_attempts WHERE source_ip = ?")
    .bind(sourceIp).first<{ failed_attempts: number; locked_until: string | null }>();
  if (row?.locked_until && Date.parse(row.locked_until) > Date.now()) {
    throw new ApiError(429, "LOGIN_RATE_LIMITED", "Too many failed login attempts. Try again in 15 minutes.");
  }
}

async function recordLoginFailure(env: Env, sourceIp: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO admin_login_attempts(source_ip, failed_attempts, locked_until, updated_at)
    VALUES (?, 1, NULL, ?)
    ON CONFLICT(source_ip) DO UPDATE SET
      failed_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= ? THEN 1 ELSE failed_attempts + 1 END,
      locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= ? THEN 1 ELSE failed_attempts + 1 END) >= 5
        THEN datetime('now', '+15 minutes') ELSE NULL END,
      updated_at = excluded.updated_at`)
    .bind(sourceIp, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()).run();
}

function sessionCookieHeader(url: URL, token: string): string {
  return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionLifetimeSeconds}${url.protocol === "https:" ? "; Secure" : ""}`;
}

function expiredSessionCookie(url: URL): string {
  return `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`;
}

function oauthStateCookieHeader(url: URL, token: string): string {
  return `${oauthStateCookie}=${token}; Path=/admin/auth/oauth/; HttpOnly; SameSite=Lax; Max-Age=${oauthStateLifetimeSeconds}${url.protocol === "https:" ? "; Secure" : ""}`;
}

function expiredOAuthStateCookie(url: URL): string {
  return `${oauthStateCookie}=; Path=/admin/auth/oauth/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}`;
}

function googleOneTapNonceCookieHeader(url: URL, token: string): string {
  const crossSiteAttributes = url.protocol === "https:" ? "; SameSite=None; Secure" : "; SameSite=Lax";
  return `${googleOneTapNonceCookie}=${token}; Path=/api/auth/callback/google; HttpOnly; Max-Age=${googleOneTapNonceLifetimeSeconds}${crossSiteAttributes}`;
}

function expiredGoogleOneTapNonceCookie(url: URL): string {
  const crossSiteAttributes = url.protocol === "https:" ? "; SameSite=None; Secure" : "; SameSite=Lax";
  return `${googleOneTapNonceCookie}=; Path=/api/auth/callback/google; HttpOnly; Max-Age=0${crossSiteAttributes}`;
}

function cookieValue(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

function base64UrlEncode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
