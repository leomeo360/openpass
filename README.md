# OpenPass

**English** | [简体中文](./README.zh-CN.md)

> One real provider key, safely issued as scoped virtual keys for teams and projects.

OpenPass is an open-source, self-hosted AI API key management platform and OpenAI-compatible gateway for Cloudflare. Store a provider's real API key once, then issue isolated virtual keys to each teammate, product, environment, or project—without distributing the real key.

This repository contains the open-source edition of OpenPass, focused on a single workspace, project isolation, virtual keys, and basic member collaboration. See [`COMMUNITY.md`](./COMMUNITY.md) for the edition boundary.

## Why OpenPass

When a real key is copied into multiple apps, scripts, or team members' machines, it becomes difficult to revoke, audit, and control spend. OpenPass keeps real credentials encrypted on the server and turns access into independently manageable virtual keys.

| Scenario | How OpenPass helps |
| --- | --- |
| Team access | Issue project-specific virtual keys instead of sharing a provider key. |
| Project isolation | Give every project its own model scope, RPM, concurrency, request, and cost limits. |
| Centralized providers | Configure real keys only in the admin console, with priority, weight, health, and failure handling. |
| Safe revocation | Disable or revoke one virtual key without affecting other projects or teammates. |
| Audit and spend | Inspect requests, models, usage, latency, estimated cost, and alerts in one place. |

## How it works

```text
Real provider key
        │ encrypted at rest in the admin console
        ▼
  OpenPass Gateway
        │
   ┌────┼────┐
   ▼    ▼    ▼
Project A  Project B  Teammate C
Virtual key  Virtual key  Virtual key
```

1. Add a provider and one real API key in the admin console.
2. Create a project and set its allowed models and limits.
3. Create a virtual key and share only that key with the relevant app or member.
4. Applications call the unified OpenPass API; the real key never leaves the platform.

## Gateway examples

Every request sends the project virtual key as `Authorization: Bearer <VIRTUAL_KEY>`. The request path selects the capability, while `model` uses an alias enabled for that project.

```bash
# Chat
curl https://your-domain.example/v1/chat/completions \
  -H "Authorization: Bearer <VIRTUAL_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seed-2-1-turbo","messages":[{"role":"user","content":"Hello"}]}'

# Image generation
curl https://your-domain.example/v1/images/generations \
  -H "Authorization: Bearer <VIRTUAL_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedream-4-0","prompt":"A paper boat floating on a lake","size":"2K","response_format":"url"}'

# Video generation
curl https://your-domain.example/v1/videos/generations \
  -H "Authorization: Bearer <VIRTUAL_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedance-1-0-pro","content":[{"type":"text","text":"A spaceship flying over a sea of clouds"}],"duration":5,"resolution":"720p","ratio":"16:9"}'

# Poll the internal job ID returned by the video endpoint
curl https://your-domain.example/v1/jobs/<JOB_ID> \
  -H "Authorization: Bearer <VIRTUAL_KEY>"
```

## Key capabilities

- OpenAI-compatible gateway endpoints: `/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/images/generations`, `/v1/videos/generations`, and `/v1/embeddings`.
- Project-level virtual keys, model authorization, default models, and optional failover.
- Per-project RPM, concurrency, daily/monthly request, and cost controls.
- Encrypted provider credentials with priority, weighting, health checks, and circuit state.
- Request logs, async jobs, audit logs, alerts, and cost estimation.
- Built-in API guide with live enabled-model listings, chat/image/video examples, and provider parameters.
- Google and GitHub registration and sign-in, Cloudflare Access, or built-in password authentication. Newly registered accounts require explicit global or project access granted by an administrator.

## Architecture

| Component | Purpose |
| --- | --- |
| Cloudflare Workers | Gateway, admin API, and static console. |
| Cloudflare D1 | Projects, models, encrypted credentials, logs, alerts, and audits. |
| Durable Objects | Per-project concurrency and RPM coordination. |
| AES-GCM | Encryption at rest for real provider API keys. |

## Quick start

You need Node.js 20+, a Cloudflare account, and Wrangler CLI.

```bash
npm install
npx wrangler login
npx wrangler d1 create openpass
npx wrangler d1 migrations apply openpass --remote
```

Put the returned D1 `database_id` in your private Wrangler configuration. Never commit domains, account data, database IDs, or secrets to a public repository.

Generate and set the secret used to encrypt provider credentials:

```bash
openssl rand -base64 32 | npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY
```

> If this key is lost, existing provider credentials cannot be decrypted. Store it in a password manager or Cloudflare Secrets Store.

## Admin authentication

### Password and social sign-in

`hybrid` mode exposes the administrator password, Google, and GitHub entry points on the same sign-in page. The password account is always a global administrator; social accounts still receive access through `ADMIN_EMAILS` or project membership.

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "AUTH_MODE": "hybrid",
  "ADMIN_USERNAME": "owner@example.com",
  "ADMIN_EMAILS": "owner@example.com"
}
```

Passwords must contain at least 12 characters. Store only the output of `npm run password:hash` as the `ADMIN_PASSWORD_HASH` Worker Secret; never place the plaintext password in Wrangler configuration.

### Google One Tap, Google OAuth, and GitHub registration

In OAuth or `hybrid` mode, a user's first Google One Tap, Google OAuth, or GitHub sign-in creates an account automatically. Registration alone grants no provider-key, global-console, or project access; the email must still be listed in `ADMIN_EMAILS` or assigned to a project by an administrator.

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "AUTH_MODE": "oauth",
  "REGISTRATION_ENABLED": "true",
  "OAUTH_PUBLIC_ORIGIN": "https://your-domain.example",
  "ADMIN_EMAILS": "owner@example.com"
}
```

Configure OAuth credentials as Worker Secrets, never in `wrangler.jsonc`. Either provider can be enabled independently, or both can be enabled:

```bash
npx wrangler secret put AUTH_SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

OAuth application callback URLs:

```text
https://your-domain.example/admin/auth/oauth/google/callback
https://your-domain.example/admin/auth/oauth/github/callback
```

Google One Tap uses the same Web Client ID and the native GIS form POST callback:

```text
https://your-domain.example/api/auth/callback/google
```

In Google Auth Platform, add `https://your-domain.example` as an Authorized JavaScript origin and register each callback above that the deployment uses. The Worker checks GIS's double-submit `g_csrf_token` cookie and a short-lived nonce before verifying the Google ID token signature, issuer, audience, expiry, and verified email.

Set `REGISTRATION_ENABLED` to `false` to keep existing-account login available while preventing new registrations.

Do not place Cloudflare Access in front of `/admin/*` on the public OAuth hostname, including the `start` and `callback` routes. Access would intercept users before OpenPass can run the Google/GitHub registration flow. If Access is still required, protect a separate operations or compatibility hostname.

### Cloudflare Access

Cloudflare Access can be used as an alternative authentication mode or on a separate operations hostname.

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "AUTH_MODE": "access",
  "ADMIN_EMAILS": "owner@example.com"
}
```

Create a Self-hosted Access Application in Cloudflare Zero Trust to protect:

```text
https://your-domain.example/admin/*
```

`ADMIN_EMAILS` accepts comma-separated global admin emails. Other people can be project managers or viewers without ever receiving a real provider key.

### Built-in password authentication

This mode is suitable for personal deployments or environments without Cloudflare Access.

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "AUTH_MODE": "password",
  "ADMIN_USERNAME": "admin"
}
```

```bash
read -s OPENPASS_PASSWORD
printf %s "$OPENPASS_PASSWORD" | npm run password:hash | npx wrangler secret put ADMIN_PASSWORD_HASH
unset OPENPASS_PASSWORD
openssl rand -base64 48 | npx wrangler secret put AUTH_SESSION_SECRET
```

## Local development

```bash
cp .dev.vars.example .dev.vars
# Set a local-only CREDENTIAL_ENCRYPTION_KEY in .dev.vars
npx wrangler d1 migrations apply openpass --local
npm run dev
```

Open `http://localhost:3103/admin/`. `AUTH_MODE=none` is available only with `ENVIRONMENT=development`.

## Deployment

Run checks before deployment:

```bash
npm run check
npm test
npx wrangler deploy --dry-run
npm run deploy
```

With a private deployment configuration:

```bash
npx wrangler d1 migrations apply openpass --remote --config wrangler.private.jsonc
npx wrangler deploy --config wrangler.private.jsonc
```

### Continuous integration

Pushes and pull requests run `.github/workflows/ci.yml` for TypeScript checks and tests. The public repository does not auto-deploy and does not read Cloudflare production credentials.

## Important configuration

| Name | Type | Description |
| --- | --- | --- |
| `ENVIRONMENT` | Var | `development` or `production` |
| `AUTH_MODE` | Var | `hybrid`, `oauth`, `access`, `password`, or development-only `none` |
| `REGISTRATION_ENABLED` | Var | Whether first OAuth sign-in can create an account; defaults to `true` |
| `OAUTH_PUBLIC_ORIGIN` | Var | Canonical OAuth callback origin; required for multiple entry domains and GitHub's single callback |
| `ADMIN_EMAILS` | Var | Comma-separated global admin emails |
| `ADMIN_USERNAME` | Var | Administrator username for password sign-in |
| `MAX_REQUEST_BODY_BYTES` | Var | Maximum request body size |
| `CREDENTIAL_ENCRYPTION_KEY` | Secret | AES-GCM credential encryption key |
| `ADMIN_PASSWORD_HASH` | Secret | PBKDF2-SHA256 password hash |
| `AUTH_SESSION_SECRET` | Secret | Session signing secret for OAuth/password modes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Secret | Google OAuth application credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Secret | GitHub OAuth application credentials |

## Security practices

- Never put real provider keys in clients, examples, issues, logs, or Git history.
- Configure real keys only in the admin console; applications use least-privilege project virtual keys.
- Use separate virtual keys per project and environment; revoke only the affected key after exposure.
- Production must use explicit admin authentication: the OAuth hostname uses signed sessions and role authorization, while a separate operations hostname may use Cloudflare Access with a restricted administrator allowlist.
- Do not commit `.dev.vars`, `.env*`, private Wrangler configs, backups, or tokens.

Before committing, you can run:

```bash
git status --short
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' \
  '(sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}|BEGIN PRIVATE KEY)'
```

See [SECURITY.md](./SECURITY.md) and [TESTING.md](./TESTING.md) for more details.

## Contributing

```bash
npm run check
npm test
```

Please add integration tests for new endpoints. Never include real API keys, cookies, D1 exports, or Cloudflare tokens in issues, pull requests, or test fixtures.

## License

[MIT](./LICENSE)
