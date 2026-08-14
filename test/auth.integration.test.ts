import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPasswordHash, verifyPassword } from "../src/auth";
import type { Env } from "../src/types";
import { callWorker, jsonRequest } from "./helpers";

describe("administrator authentication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and verifies a PBKDF2 password hash", async () => {
    const password = "correct horse battery staple";
    const hash = await createPasswordHash(password, new Uint8Array(16).fill(7));
    expect(hash).toMatch(/^pbkdf2_sha256\$100000\$/);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("supports password login, signed sessions, and logout", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await createPasswordHash(password, new Uint8Array(16).fill(9));
    const authEnv: Partial<Env> = {
      AUTH_MODE: "password",
      ADMIN_USERNAME: "owner",
      ADMIN_PASSWORD_HASH: passwordHash,
      AUTH_SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      ENVIRONMENT: "production",
    };

    const anonymous = await jsonRequest<{ error: { code: string } }>(
      "/admin/api/session", "GET", undefined, { admin: false, env: authEnv },
    );
    expect(anonymous.response.status).toBe(401);
    expect(anonymous.data.error.code).toBe("ADMIN_AUTH_REQUIRED");

    const wrong = await jsonRequest<{ error: { code: string } }>(
      "/admin/auth/login", "POST", { username: "owner", password: "wrong password" },
      { admin: false, env: authEnv },
    );
    expect(wrong.response.status).toBe(401);
    expect(wrong.data.error.code).toBe("INVALID_CREDENTIALS");

    const login = await callWorker("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "owner", password }),
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.70" },
      admin: false,
      env: authEnv,
    });
    expect(login.response.status).toBe(200);
    const cookie = login.response.headers.get("set-cookie");
    expect(cookie).toContain("openpass_admin=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const session = await jsonRequest<{ role: string; email: string; auth_mode: string }>(
      "/admin/api/session", "GET", undefined,
      { admin: false, headers: { cookie: cookie!.split(";")[0] }, env: authEnv },
    );
    expect(session.response.status).toBe(200);
    expect(session.data).toMatchObject({ role: "global", email: "owner", auth_mode: "password" });

    const logout = await callWorker("/admin/auth/logout", {
      method: "POST",
      headers: { cookie: cookie!.split(";")[0] },
      admin: false,
      env: authEnv,
    });
    expect(logout.response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("supports password and OAuth entry points in hybrid mode", async () => {
    const password = "hybrid password for tests";
    const passwordHash = await createPasswordHash(password, new Uint8Array(16).fill(11));
    const authEnv: Partial<Env> = {
      AUTH_MODE: "hybrid",
      ADMIN_USERNAME: "owner@example.test",
      ADMIN_PASSWORD_HASH: passwordHash,
      AUTH_SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      GITHUB_CLIENT_ID: "github-client-id",
      GITHUB_CLIENT_SECRET: "github-client-secret",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      ADMIN_EMAILS: "owner@example.test",
      ENVIRONMENT: "production",
    };

    const config = await jsonRequest<{
      mode: string;
      configured: boolean;
      password_configured: boolean;
      oauth_configured: boolean;
      providers: { google: boolean; github: boolean };
    }>("/admin/auth/config", "GET", undefined, { admin: false, env: authEnv });
    expect(config.data).toMatchObject({
      mode: "hybrid",
      configured: true,
      password_configured: true,
      oauth_configured: true,
      providers: { google: false, github: true },
    });

    const login = await callWorker("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "owner@example.test", password }),
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.71" },
      admin: false,
      env: authEnv,
    });
    expect(login.response.status).toBe(200);
    const cookie = login.response.headers.get("set-cookie")!.split(";")[0];
    const session = await jsonRequest<{ role: string; email: string; auth_mode: string }>(
      "/admin/api/session", "GET", undefined,
      { admin: false, headers: { cookie }, env: authEnv },
    );
    expect(session.data).toMatchObject({ role: "global", email: "owner@example.test", auth_mode: "hybrid" });

    const oauthStart = await callWorker("/admin/auth/oauth/github/start", {
      method: "GET",
      admin: false,
      env: authEnv,
    });
    expect(oauthStart.response.status).toBe(302);
    expect(new URL(oauthStart.response.headers.get("location")!).origin).toBe("https://github.com");
  });

  it("uses the GIS HTML API for native One Tap form posts and keeps the OAuth fallback", async () => {
    const page = await callWorker("/admin/login.html", { method: "GET", admin: false });
    expect(page.response.status).toBe(200);
    const html = await page.response.text();
    expect(html).toContain('id="g_id_onload"');
    expect(html).toContain('class="g_id_signin one-tap-button"');
    expect(html).toContain("onload.setAttribute('data-login_uri',config.login_uri)");
    expect(html).toContain("onload.setAttribute('data-auto_prompt','true')");
    expect(html).toContain("onload.setAttribute('data-auto_select','false')");
    expect(html).toContain("onload.setAttribute('data-cancel_on_tap_outside','false')");
    expect(html).toContain("script.src='https://accounts.google.com/gsi/client'");
    expect(html).toContain('href="/admin/auth/oauth/google/start"');
    expect(html).not.toMatch(/accounts\.id\.(?:initialize|prompt)\s*\(/);
    expect(html.indexOf("onload.setAttribute('data-client_id',config.client_id)")).toBeLessThan(html.indexOf("document.head.append(script)"));
  });

  it("registers and signs in a verified Google account without granting implicit admin access", async () => {
    const email = `oauth-${crypto.randomUUID()}@example.test`;
    const authEnv: Partial<Env> = {
      AUTH_MODE: "oauth",
      AUTH_SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      REGISTRATION_ENABLED: "true",
      ADMIN_EMAILS: "",
      ENVIRONMENT: "production",
    };
    const config = await jsonRequest<{
      mode: string;
      configured: boolean;
      providers: { google: boolean; github: boolean };
    }>("/admin/auth/config", "GET", undefined, { admin: false, env: authEnv });
    expect(config.data).toMatchObject({
      mode: "oauth",
      configured: true,
      providers: { google: true, github: false },
    });

    const start = await callWorker("/admin/auth/oauth/google/start", {
      method: "GET",
      admin: false,
      env: authEnv,
    });
    expect(start.response.status).toBe(302);
    const authorization = new URL(start.response.headers.get("location")!);
    expect(authorization.origin).toBe("https://accounts.google.com");
    expect(authorization.searchParams.get("redirect_uri")).toBe("https://openpass.test/admin/auth/oauth/google/callback");
    const state = authorization.searchParams.get("state");
    const stateCookie = start.response.headers.get("set-cookie")!.split(";")[0];
    expect(stateCookie).toContain("openpass_oauth_state=");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ access_token: "google-access-token" }))
      .mockResolvedValueOnce(Response.json({
        sub: `google-${crypto.randomUUID()}`,
        email,
        email_verified: true,
        name: "OAuth Test User",
        picture: "https://images.example.test/avatar.png",
      }));
    const callback = await callWorker(`/admin/auth/oauth/google/callback?code=test-code&state=${encodeURIComponent(state!)}`, {
      method: "GET",
      headers: { cookie: stateCookie },
      admin: false,
      env: authEnv,
    });
    expect(callback.response.status).toBe(302);
    expect(callback.response.headers.get("location")).toBe("/admin/login.html?registered=1&pending=1");
    expect(callback.response.headers.get("set-cookie")).toContain("openpass_admin=");
    expect(callback.response.headers.get("set-cookie")).toContain("SameSite=Lax");

    const user = await env.DB.prepare("SELECT email, status FROM users WHERE email = ?").bind(email).first<{ email: string; status: string }>();
    expect(user).toMatchObject({ email, status: "active" });
  });

  it("signs in with Google One Tap through the native GIS form POST", async () => {
    const email = `one-tap-${crypto.randomUUID()}@example.test`;
    const authEnv: Partial<Env> = {
      AUTH_MODE: "oauth",
      AUTH_SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      REGISTRATION_ENABLED: "true",
      ADMIN_EMAILS: email,
      ENVIRONMENT: "production",
    };
    const config = await jsonRequest<{
      one_tap: { enabled: boolean; client_id: string; nonce: string; login_uri: string };
    }>("/admin/auth/config", "GET", undefined, { admin: false, env: authEnv });
    expect(config.data.one_tap).toMatchObject({
      enabled: true,
      client_id: "google-client-id",
      login_uri: "https://openpass.test/api/auth/callback/google",
    });
    const nonceCookie = config.response.headers.get("set-cookie")!.split(";")[0];
    expect(config.response.headers.get("set-cookie")).toContain("Path=/api/auth/callback/google");
    expect(config.response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(config.response.headers.get("set-cookie")).toContain("SameSite=None");

    const googleKey = await googleSigningKey();
    const credential = await signGoogleIdToken(googleKey, {
      sub: `google-one-tap-${crypto.randomUUID()}`,
      email,
      nonce: config.data.one_tap.nonce,
      aud: authEnv.GOOGLE_CLIENT_ID,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ keys: [googleKey.jwk] }));
    const csrfToken = `csrf-${crypto.randomUUID()}`;
    const callback = await callWorker("/api/auth/callback/google", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `${nonceCookie}; g_csrf_token=${csrfToken}`,
      },
      body: new URLSearchParams({ credential, g_csrf_token: csrfToken }).toString(),
      admin: false,
      env: authEnv,
    });
    expect(callback.response.status).toBe(303);
    expect(callback.response.headers.get("location")).toBe("/admin/");
    const sessionCookie = callback.response.headers.get("set-cookie")!.split(",").find((value) => value.includes("openpass_admin="));
    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(callback.response.headers.get("set-cookie")).toContain("openpass_google_one_tap_nonce=;");

    const session = await jsonRequest<{ email: string; role: string; auth_mode: string }>(
      "/admin/api/session", "GET", undefined,
      { admin: false, headers: { cookie: sessionCookie!.trim().split(";")[0] }, env: authEnv },
    );
    expect(session.response.status).toBe(200);
    expect(session.data).toMatchObject({ email, role: "global", auth_mode: "oauth" });
    const account = await env.DB.prepare(
      "SELECT oa.provider, oa.provider_user_id FROM oauth_accounts oa JOIN users u ON u.id = oa.user_id WHERE u.email = ?",
    ).bind(email).first<{ provider: string; provider_user_id: string }>();
    expect(account?.provider).toBe("google");
  });

  it("rejects a One Tap POST when the GIS CSRF cookie and form field do not match", async () => {
    const authEnv: Partial<Env> = {
      AUTH_MODE: "oauth",
      AUTH_SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      ENVIRONMENT: "production",
    };
    const config = await jsonRequest<{ one_tap: { nonce: string } }>(
      "/admin/auth/config", "GET", undefined, { admin: false, env: authEnv },
    );
    const nonceCookie = config.response.headers.get("set-cookie")!.split(";")[0];
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const callback = await callWorker("/api/auth/callback/google", {
      method: "POST",
      body: new URLSearchParams({ credential: "unused", g_csrf_token: "form-value" }).toString(),
      admin: false,
      env: authEnv,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: `${nonceCookie}; g_csrf_token=cookie-value`,
      },
    });
    const data = await callback.response.json() as { error: { code: string } };
    expect(callback.response.status).toBe(400);
    expect(data.error.code).toBe("INVALID_ONE_TAP_CSRF");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects One Tap ID tokens with invalid signature or security claims", async () => {
    const authEnv: Partial<Env> = {
      AUTH_MODE: "oauth",
      AUTH_SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      ENVIRONMENT: "production",
    };
    const googleKey = await googleSigningKey();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ keys: [googleKey.jwk] }));
    const now = Math.floor(Date.now() / 1_000);
    const cases: Array<{
      name: string;
      overrides: Record<string, unknown>;
      mutate?: (credential: string) => string;
      status: number;
    }> = [
      { name: "issuer", overrides: { iss: "https://attacker.example" }, status: 401 },
      { name: "audience", overrides: { aud: "different-client-id" }, status: 401 },
      { name: "expiry", overrides: { exp: now - 120 }, status: 401 },
      { name: "nonce", overrides: { nonce: "different-nonce" }, status: 401 },
      { name: "email verification", overrides: { email_verified: false }, status: 403 },
      {
        name: "signature",
        overrides: {},
        mutate: (credential) => {
          const [header, payload, signature] = credential.split(".");
          return `${header}.${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
        },
        status: 401,
      },
    ];
    for (const testCase of cases) {
      const config = await jsonRequest<{ one_tap: { nonce: string } }>(
        "/admin/auth/config", "GET", undefined, { admin: false, env: authEnv },
      );
      const nonceCookie = config.response.headers.get("set-cookie")!.split(";")[0];
      const email = `invalid-${testCase.name.replace(/\s/g, "-")}-${crypto.randomUUID()}@example.test`;
      let credential = await signGoogleIdToken(googleKey, {
        sub: `google-${crypto.randomUUID()}`,
        email,
        nonce: config.data.one_tap.nonce,
        aud: authEnv.GOOGLE_CLIENT_ID,
        ...testCase.overrides,
      });
      if (testCase.mutate) credential = testCase.mutate(credential);
      const csrfToken = `csrf-${crypto.randomUUID()}`;
      const result = await callWorker("/api/auth/callback/google", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: `${nonceCookie}; g_csrf_token=${csrfToken}`,
        },
        body: new URLSearchParams({ credential, g_csrf_token: csrfToken }).toString(),
        admin: false,
        env: authEnv,
      });
      expect(result.response.status, testCase.name).toBe(testCase.status);
      const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
      expect(user, testCase.name).toBeNull();
    }
  });

  it("registers and signs in an authorised GitHub account", async () => {
    const email = `github-${crypto.randomUUID()}@example.test`;
    const authEnv: Partial<Env> = {
      AUTH_MODE: "oauth",
      AUTH_SESSION_SECRET: "test-session-secret-that-is-longer-than-32-characters",
      GITHUB_CLIENT_ID: "github-client-id",
      GITHUB_CLIENT_SECRET: "github-client-secret",
      REGISTRATION_ENABLED: "true",
      OAUTH_PUBLIC_ORIGIN: "https://openpass.example.com",
      ADMIN_EMAILS: email,
      ENVIRONMENT: "production",
    };
    const start = await callWorker("/admin/auth/oauth/github/start", {
      method: "GET",
      admin: false,
      env: authEnv,
    });
    const authorization = new URL(start.response.headers.get("location")!);
    expect(authorization.origin).toBe("https://github.com");
    expect(authorization.searchParams.get("scope")).toContain("user:email");
    expect(authorization.searchParams.get("redirect_uri")).toBe("https://openpass.example.com/admin/auth/oauth/github/callback");
    const state = authorization.searchParams.get("state");
    const stateCookie = start.response.headers.get("set-cookie")!.split(";")[0];

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ access_token: "github-access-token" }))
      .mockResolvedValueOnce(Response.json({
        id: 123456,
        login: "oauth-test",
        name: "GitHub Test User",
        avatar_url: "https://avatars.githubusercontent.com/u/123456",
      }))
      .mockResolvedValueOnce(Response.json([
        { email, primary: true, verified: true },
      ]));
    const callback = await callWorker(`/admin/auth/oauth/github/callback?code=test-code&state=${encodeURIComponent(state!)}`, {
      method: "GET",
      headers: { cookie: stateCookie },
      admin: false,
      env: authEnv,
    });
    expect(callback.response.status).toBe(302);
    expect(callback.response.headers.get("location")).toBe("/admin/");
    const sessionCookie = callback.response.headers.get("set-cookie")!.split(",").find((value) => value.includes("openpass_admin="));
    expect(sessionCookie).toBeTruthy();

    const session = await jsonRequest<{ email: string; role: string; auth_mode: string }>(
      "/admin/api/session", "GET", undefined,
      { admin: false, headers: { cookie: sessionCookie!.trim().split(";")[0] }, env: authEnv },
    );
    expect(session.response.status).toBe(200);
    expect(session.data).toMatchObject({ email, role: "global", auth_mode: "oauth" });
  });
});

interface GoogleTestKey {
  keyPair: CryptoKeyPair;
  jwk: JsonWebKey & { kid: string; alg: string; use: string };
}

let googleTestKey: Promise<GoogleTestKey> | undefined;

function googleSigningKey(): Promise<GoogleTestKey> {
  googleTestKey ??= (async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2_048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    ) as CryptoKeyPair;
    const jwk = {
      ...await crypto.subtle.exportKey("jwk", keyPair.publicKey),
      kid: "google-test-key",
      alg: "RS256",
      use: "sig",
    };
    return { keyPair, jwk };
  })();
  return googleTestKey;
}

async function signGoogleIdToken(key: GoogleTestKey, overrides: Record<string, unknown>): Promise<string> {
  const now = Math.floor(Date.now() / 1_000);
  const claims = {
    iss: "https://accounts.google.com",
    aud: "google-client-id",
    exp: now + 3_600,
    iat: now,
    sub: `google-${crypto.randomUUID()}`,
    email: `google-${crypto.randomUUID()}@example.test`,
    email_verified: true,
    nonce: crypto.randomUUID(),
    name: "Google One Tap Test User",
    picture: "https://images.example.test/google-one-tap.png",
    ...overrides,
  };
  const headerPart = encodeJwtPart({ alg: "RS256", typ: "JWT", kid: key.jwk.kid });
  const payloadPart = encodeJwtPart(claims);
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key.keyPair.privateKey,
    new TextEncoder().encode(signingInput),
  ));
  return `${signingInput}.${base64Url(signature)}`;
}

function encodeJwtPart(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
