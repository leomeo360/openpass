import { sha256 } from "./lib/crypto";
import { ApiError, maskIp } from "./lib/http";
import { ipRuleMatches } from "./lib/ip-rules";
import { authMode, oauthSessionUser, passwordSessionUser } from "./auth";
import type { AuthenticatedProject, CredentialRoute, Env, ModelRoute } from "./types";

export function now(): string {
  return new Date().toISOString();
}

export interface AdminAccess {
  email: string;
  isGlobal: boolean;
  projects: Array<{ project_id: string; role: "manager" | "viewer" }>;
}

export async function adminAccess(request: Request, env: Env): Promise<AdminAccess> {
  const mode = authMode(env);
  if (mode === "password" || mode === "hybrid") {
    const username = await passwordSessionUser(request, env);
    if (username) return { email: username, isGlobal: true, projects: [] };
    if (mode === "password") throw new ApiError(401, "ADMIN_AUTH_REQUIRED", "Administrator login is required.");
  }
  if (mode === "oauth" || mode === "hybrid") {
    const user = await oauthSessionUser(request, env);
    if (user) return accessForEmail(env, user.email, "Your account is registered but has not been granted access to a project.");
    const message = mode === "hybrid"
      ? "Sign in with an administrator password, Google, or GitHub to continue."
      : "Sign in with Google or GitHub to continue.";
    throw new ApiError(401, "ADMIN_AUTH_REQUIRED", message);
  }
  if (mode === "none") {
    if (env.ENVIRONMENT !== "development") throw new ApiError(500, "AUTH_CONFIGURATION_ERROR", "AUTH_MODE=none is allowed only in development.");
    return { email: "local-admin@example.test", isGlobal: true, projects: [] };
  }
  const email = request.headers.get("cf-access-authenticated-user-email")?.trim().toLowerCase() ?? "";
  if (!email) throw new ApiError(403, "ADMIN_FORBIDDEN", "Cloudflare Access administrator privileges are required.");
  return accessForEmail(env, email, "Cloudflare Access administrator privileges are required.");
}

async function accessForEmail(env: Env, email: string, forbiddenMessage: string): Promise<AdminAccess> {
  const normalizedEmail = email.trim().toLowerCase();
  const allowed = (env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowed.includes(normalizedEmail)) return { email: normalizedEmail, isGlobal: true, projects: [] };
  const assignments = await env.DB.prepare(
    "SELECT project_id, role FROM project_admins WHERE email = ? AND status = 'active' ORDER BY project_id",
  ).bind(normalizedEmail).all<{ project_id: string; role: "manager" | "viewer" }>();
  if (!assignments.results.length) throw new ApiError(403, "ADMIN_FORBIDDEN", forbiddenMessage);
  return { email: normalizedEmail, isGlobal: false, projects: assignments.results };
}

export async function audit(
  env: Env,
  request: Request,
  actor: string,
  action: string,
  objectType: string,
  objectId: string,
  beforeSummary: string | null,
  afterSummary: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs(id, actor_email, action, object_type, object_id, before_summary, after_summary, source_ip, result, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)`,
  ).bind(
    crypto.randomUUID(), actor, action, objectType, objectId, beforeSummary, afterSummary,
    request.headers.get("cf-connecting-ip") ?? null, now(),
  ).run();
}

export async function authenticateProject(request: Request, env: Env): Promise<AuthenticatedProject> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(pk_live_[A-Za-z0-9_-]{20,})$/.exec(authorization);
  if (!match) throw new ApiError(401, "INVALID_API_KEY", "A valid Bearer virtual API key is required.");
  const keyHash = await sha256(match[1]);
  const result = await env.DB.prepare(
    `SELECT p.id AS project_id, p.name AS project_name, p.slug AS project_slug, p.status AS project_status,
            p.log_policy, p.ip_logging, vk.id AS virtual_key_id, vk.status AS virtual_key_status,
            vk.expires_at AS virtual_key_expires_at, vk.rotation_expires_at AS virtual_key_rotation_expires_at,
            l.rpm_limit, l.concurrency_limit,
            l.daily_request_limit, l.monthly_request_limit, l.daily_cost_limit_cents, l.monthly_cost_limit_cents
     FROM virtual_keys vk
     JOIN projects p ON p.id = vk.project_id
     JOIN project_limits l ON l.project_id = p.id
     WHERE vk.key_hash = ?`,
  ).bind(keyHash).first<AuthenticatedProject>();
  if (!result) throw new ApiError(401, "INVALID_API_KEY", "The virtual API key is invalid.");
  if (result.virtual_key_expires_at && Date.parse(result.virtual_key_expires_at) <= Date.now()) {
    throw new ApiError(401, "API_KEY_EXPIRED", "The virtual API key has expired.");
  }
  if (result.virtual_key_status === "rotating" && result.virtual_key_rotation_expires_at && Date.parse(result.virtual_key_rotation_expires_at) <= Date.now()) {
    throw new ApiError(403, "API_KEY_ROTATION_EXPIRED", "The virtual API key rotation grace period has ended.");
  }
  if (result.virtual_key_status !== "active" && result.virtual_key_status !== "rotating") {
    throw new ApiError(403, "PROJECT_DISABLED", "The virtual API key is not active.");
  }
  if (result.project_status !== "active") throw new ApiError(403, "PROJECT_DISABLED", "The project is not active.");
  return result;
}

export async function resolveModel(env: Env, projectId: string, requestedModel: string): Promise<ModelRoute> {
  const requested = requestedModel.trim();
  const route = await env.DB.prepare(
    `SELECT m.id AS model_id, m.name AS model_name, m.alias AS model_alias, pm.project_alias,
            m.request_type, pm.fallback_priority, m.provider_model_id,
            m.fixed_cost_cents, m.input_cost_microunits, m.output_cost_microunits, m.billing_unit, m.unit_cost_microunits,
            pm.daily_cost_limit_cents AS project_daily_cost_limit_cents,
            pm.monthly_cost_limit_cents AS project_monthly_cost_limit_cents, m.price_version, p.id AS provider_id, p.name AS provider_name, p.slug AS provider_slug,
            p.base_url, p.adapter_type, p.timeout_ms, p.retry_count
     FROM project_models pm
     JOIN models m ON m.id = pm.model_id
     JOIN providers p ON p.id = m.provider_id
     WHERE pm.project_id = ?
       AND ((? <> '' AND (pm.project_alias = ? OR m.alias = ? OR m.provider_model_id = ?))
         OR (? = '' AND pm.is_default = 1))
       AND pm.status = 'active' AND m.status = 'active' AND p.status = 'active'
     ORDER BY pm.is_default DESC, pm.fallback_priority ASC
     LIMIT 1`,
  ).bind(projectId, requested, requested, requested, requested, requested).first<ModelRoute>();
  if (!route) {
    throw new ApiError(
      403,
      "MODEL_NOT_ALLOWED",
      requested ? "This project is not allowed to use the requested model." : "This project does not have an active default model.",
    );
  }
  return route;
}

/**
 * A model entry is an opt-in, stable public model name (for example
 * `chat-default`). It deliberately lives alongside the existing per-project
 * model routing: no legacy project is affected until it requests an entry.
 */
export async function resolveModelEntry(env: Env, projectId: string, requestedModel: string): Promise<ModelRoute[] | null> {
  const requested = requestedModel.trim();
  if (!requested) return null;
  const rows = await env.DB.prepare(
    `SELECT m.id AS model_id, m.name AS model_name, m.alias AS model_alias, e.slug AS project_alias,
            m.request_type, er.priority AS fallback_priority, m.provider_model_id,
            m.fixed_cost_cents, m.input_cost_microunits, m.output_cost_microunits, m.billing_unit, m.unit_cost_microunits,
            NULL AS project_daily_cost_limit_cents, NULL AS project_monthly_cost_limit_cents,
            m.price_version, p.id AS provider_id, p.name AS provider_name, p.slug AS provider_slug,
            p.base_url, p.adapter_type, p.timeout_ms, p.retry_count
     FROM model_entries e
     JOIN model_entry_routes er ON er.entry_id = e.id
     JOIN models m ON m.id = er.model_id
     JOIN providers p ON p.id = m.provider_id
     WHERE e.slug = ? AND e.status = 'active'
       AND (e.scope = 'all' OR EXISTS (SELECT 1 FROM model_entry_projects ep WHERE ep.entry_id = e.id AND ep.project_id = ?))
       AND m.status = 'active' AND p.status = 'active' AND p.deleted_at IS NULL
     ORDER BY er.priority ASC, m.alias ASC
     LIMIT 6`,
  ).bind(requested, projectId).all<ModelRoute>();
  return rows.results.length ? rows.results : null;
}

export async function fallbackModels(env: Env, projectId: string, primary: ModelRoute): Promise<ModelRoute[]> {
  const rows = await env.DB.prepare(
    `SELECT m.id AS model_id, m.name AS model_name, m.alias AS model_alias, pm.project_alias,
            m.request_type, pm.fallback_priority, m.provider_model_id,
            m.fixed_cost_cents, m.input_cost_microunits, m.output_cost_microunits, m.billing_unit, m.unit_cost_microunits,
            pm.daily_cost_limit_cents AS project_daily_cost_limit_cents,
            pm.monthly_cost_limit_cents AS project_monthly_cost_limit_cents, m.price_version, p.id AS provider_id, p.name AS provider_name, p.slug AS provider_slug,
            p.base_url, p.adapter_type, p.timeout_ms, p.retry_count
     FROM project_models pm
     JOIN projects project_config ON project_config.id = pm.project_id AND project_config.model_fallback_enabled = 1
     JOIN models m ON m.id = pm.model_id
     JOIN providers p ON p.id = m.provider_id
     WHERE pm.project_id = ? AND m.id <> ? AND m.request_type = ?
       AND pm.status = 'active' AND m.status = 'active' AND p.status = 'active'
     ORDER BY pm.fallback_priority ASC, pm.is_default DESC, m.alias ASC
     LIMIT 5`,
  ).bind(projectId, primary.model_id, primary.request_type).all<ModelRoute>();
  return rows.results;
}

export async function credentialsFor(env: Env, providerId: string): Promise<CredentialRoute[]> {
  const rows = await env.DB.prepare(
    `SELECT id, name, encrypted_secret, status, health_status, priority, weight, rpm_limit, daily_request_limit, circuit_open_until
     FROM provider_credentials
     WHERE provider_id = ? AND status = 'active'
       AND (health_status = 'healthy' OR (health_status IN ('rate_limited', 'unhealthy') AND circuit_open_until IS NOT NULL AND circuit_open_until <= ?))
       AND (circuit_open_until IS NULL OR circuit_open_until <= ?)
     ORDER BY priority ASC, last_used_at ASC`,
  ).bind(providerId, now(), now()).all<CredentialRoute>();
  return weightedCredentialOrder(rows.results);
}

export function weightedCredentialOrder(credentials: CredentialRoute[], random = Math.random): CredentialRoute[] {
  const ordered: CredentialRoute[] = [];
  for (const priority of [...new Set(credentials.map((credential) => credential.priority))].sort((a, b) => a - b)) {
    const remaining = credentials.filter((credential) => credential.priority === priority);
    while (remaining.length) {
      const totalWeight = remaining.reduce((sum, credential) => sum + Math.max(1, credential.weight), 0);
      let cursor = random() * totalWeight;
      let selectedIndex = remaining.length - 1;
      for (let index = 0; index < remaining.length; index += 1) {
        cursor -= Math.max(1, remaining[index].weight);
        if (cursor < 0) { selectedIndex = index; break; }
      }
      ordered.push(remaining.splice(selectedIndex, 1)[0]);
    }
  }
  return ordered;
}

export function recordedIp(request: Request, policy: AuthenticatedProject["ip_logging"]): string | null {
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  if (!ip || policy === "none") return null;
  return policy === "masked" ? maskIp(ip) : ip;
}

export async function enforceProjectIpRules(env: Env, projectId: string, request: Request): Promise<void> {
  const sourceIp = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  const rows = await env.DB.prepare(
    "SELECT rule_type, value FROM project_ip_rules WHERE project_id = ? AND status = 'active' ORDER BY rule_type",
  ).bind(projectId).all<{ rule_type: "allow" | "block"; value: string }>();
  if (!rows.results.length) return;
  if (rows.results.some((rule) => rule.rule_type === "block" && ipRuleMatches(sourceIp, rule.value))) {
    throw new ApiError(403, "IP_BLOCKED", "This source IP is blocked for the project.");
  }
  const allowed = rows.results.filter((rule) => rule.rule_type === "allow");
  if (allowed.length && !allowed.some((rule) => ipRuleMatches(sourceIp, rule.value))) {
    throw new ApiError(403, "IP_NOT_ALLOWED", "This source IP is not on the project's allowlist.");
  }
}
