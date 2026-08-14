import { decryptSecret, encryptSecret, generateVirtualKey, keyIdentity, sha256 } from "./lib/crypto";
import { authMode } from "./auth";
import { ApiError, json, readJsonBody } from "./lib/http";
import { normalizeIpRule } from "./lib/ip-rules";
import { adminAccess, audit, now, type AdminAccess } from "./services";
import type { Env } from "./types";

const maxAdminBody = 256_000;

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const access = await adminAccess(request, env);
  const actor = access.email;
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "GET" && path === "/admin/api/session") {
    return json({ email: access.email, role: access.isGlobal ? "global" : "project", projects: access.projects, auth_mode: authMode(env) });
  }
  if (!access.isGlobal) await enforceProjectAdminRoute(request, env, access, url);

  if (request.method === "GET" && path === "/admin/api/dashboard") return dashboard(env, url);
  if (request.method === "GET" && path === "/admin/api/projects") return listProjects(request, env, url, access.isGlobal ? null : access.projects.map((item) => item.project_id));
  if (request.method === "POST" && path === "/admin/api/projects") return createProject(request, env, actor);
  if (request.method === "GET" && /^\/admin\/api\/projects\/[^/]+$/.test(path)) return projectDetail(request, env, segment(path, 4));
  if (request.method === "PATCH" && /^\/admin\/api\/projects\/[^/]+$/.test(path)) return updateProject(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/projects\/[^/]+\/delete$/.test(path)) return deleteProject(request, env, actor, segment(path, 4));
  if (request.method === "DELETE" && /^\/admin\/api\/projects\/[^/]+$/.test(path)) {
    return deleteProject(request, env, actor, segment(path, 4));
  }
  if (request.method === "GET" && /^\/admin\/api\/projects\/[^/]+\/keys$/.test(path)) return listVirtualKeys(env, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/projects\/[^/]+\/keys$/.test(path)) return createVirtualKey(request, env, actor, segment(path, 4));
  if (request.method === "GET" && /^\/admin\/api\/projects\/[^/]+\/ip-rules$/.test(path)) return listProjectIpRules(env, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/projects\/[^/]+\/ip-rules$/.test(path)) return createProjectIpRule(request, env, actor, segment(path, 4));
  if (request.method === "PATCH" && /^\/admin\/api\/ip-rules\/[^/]+$/.test(path)) return updateProjectIpRule(request, env, actor, segment(path, 4));
  if (request.method === "DELETE" && /^\/admin\/api\/ip-rules\/[^/]+$/.test(path)) return deleteProjectIpRule(request, env, actor, segment(path, 4));
  if (request.method === "GET" && /^\/admin\/api\/projects\/[^/]+\/admins$/.test(path)) return listProjectAdmins(env, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/projects\/[^/]+\/admins$/.test(path)) return createProjectAdmin(request, env, actor, segment(path, 4));
  if (request.method === "PATCH" && /^\/admin\/api\/project-admins\/[^/]+$/.test(path)) return updateProjectAdmin(request, env, actor, segment(path, 4));
  if (request.method === "DELETE" && /^\/admin\/api\/project-admins\/[^/]+$/.test(path)) return deleteProjectAdmin(request, env, actor, segment(path, 4));
  if (request.method === "GET" && /^\/admin\/api\/projects\/[^/]+\/webhooks$/.test(path)) return listProjectWebhooks(env, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/projects\/[^/]+\/webhooks$/.test(path)) return createProjectWebhook(request, env, actor, segment(path, 4));
  if (request.method === "PATCH" && /^\/admin\/api\/webhooks\/[^/]+$/.test(path)) return updateProjectWebhook(request, env, actor, segment(path, 4));
  if (request.method === "DELETE" && /^\/admin\/api\/webhooks\/[^/]+$/.test(path)) return deleteProjectWebhook(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/virtual-keys\/[^/]+\/revoke$/.test(path)) return revokeVirtualKey(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/virtual-keys\/[^/]+\/status$/.test(path)) return setVirtualKeyStatus(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/virtual-keys\/[^/]+\/rotate$/.test(path)) return rotateVirtualKey(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/projects\/[^/]+\/status$/.test(path)) return setProjectStatus(request, env, actor, segment(path, 4));
  if (request.method === "GET" && path === "/admin/api/providers") return listProviders(env, url);
  if (request.method === "POST" && path === "/admin/api/providers") return createProvider(request, env, actor);
  if (request.method === "PATCH" && /^\/admin\/api\/providers\/[^/]+$/.test(path)) return updateProvider(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/providers\/[^/]+\/update$/.test(path)) return updateProvider(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/providers\/[^/]+\/archive$/.test(path)) return archiveProvider(request, env, actor, segment(path, 4));
  if (request.method === "DELETE" && /^\/admin\/api\/providers\/[^/]+$/.test(path)) return archiveProvider(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/providers\/[^/]+\/test$/.test(path)) return testProvider(env, actor, request, segment(path, 4));
  if (request.method === "GET" && /^\/admin\/api\/providers\/[^/]+\/credentials$/.test(path)) return listCredentials(env, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/providers\/[^/]+\/credentials$/.test(path)) return createCredential(request, env, actor, segment(path, 4));
  if (request.method === "PATCH" && /^\/admin\/api\/credentials\/[^/]+$/.test(path)) return updateCredential(request, env, actor, segment(path, 4));
  if (request.method === "DELETE" && /^\/admin\/api\/credentials\/[^/]+$/.test(path)) return eraseCredential(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/credentials\/[^/]+\/status$/.test(path)) return setCredentialStatus(request, env, actor, segment(path, 4));
  if (request.method === "GET" && path === "/admin/api/models") return listModels(env, url);
  if (request.method === "POST" && path === "/admin/api/models") return createModel(request, env, actor);
  if (request.method === "PATCH" && /^\/admin\/api\/models\/[^/]+$/.test(path)) return updateModel(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/models\/[^/]+\/update$/.test(path)) return updateModel(request, env, actor, segment(path, 4));
  if (request.method === "GET" && path === "/admin/api/model-entries") return listModelEntries(env);
  if (request.method === "POST" && path === "/admin/api/model-entries") return createModelEntry(request, env, actor);
  if (request.method === "PATCH" && /^\/admin\/api\/model-entries\/[^/]+$/.test(path)) return updateModelEntry(request, env, actor, segment(path, 4));
  if (request.method === "POST" && /^\/admin\/api\/model-entries\/[^/]+\/delete$/.test(path)) return deleteModelEntry(request, env, actor, segment(path, 4));
  if (request.method === "GET" && path === "/admin/api/requests/export") return exportRequests(env, actor, request, url, access.isGlobal ? null : access.projects.map((item) => item.project_id));
  if (request.method === "GET" && path === "/admin/api/requests") return listRequests(env, url, access.isGlobal ? null : access.projects.map((item) => item.project_id));
  if (request.method === "GET" && /^\/admin\/api\/requests\/[^/]+$/.test(path)) return requestDetail(env, request, actor, segment(path, 4));
  if (request.method === "GET" && path === "/admin/api/jobs") return listJobs(env, url, access.isGlobal ? null : access.projects.map((item) => item.project_id));
  if (request.method === "GET" && path === "/admin/api/alerts") return listAlerts(env, url, access.isGlobal ? null : access.projects.map((item) => item.project_id));
  if (request.method === "POST" && /^\/admin\/api\/alerts\/[^/]+\/status$/.test(path)) return setAlertStatus(request, env, actor, segment(path, 4));
  if (request.method === "GET" && path === "/admin/api/settings") return listSettings(env);
  if (request.method === "PATCH" && path === "/admin/api/settings") return updateSettings(request, env, actor);
  if (request.method === "GET" && path === "/admin/api/audit-logs") return listAuditLogs(env, url);
  throw new ApiError(404, "NOT_FOUND", "The requested admin endpoint does not exist.");
}

async function enforceProjectAdminRoute(request: Request, env: Env, access: AdminAccess, url: URL): Promise<void> {
  const path = url.pathname;
  const roles = new Map(access.projects.map((item) => [item.project_id, item.role]));
  const allowedProject = (projectId: string | null | undefined, write = false): void => {
    const role = projectId ? roles.get(projectId) : undefined;
    if (!role || (write && role !== "manager")) {
      throw new ApiError(403, "ADMIN_SCOPE_FORBIDDEN", write
        ? "This project administrator has read-only access or is not assigned to the project."
        : "This project administrator is not assigned to the requested project.");
    }
  };
  if (request.method === "GET" && ["/admin/api/projects", "/admin/api/models", "/admin/api/requests", "/admin/api/requests/export", "/admin/api/jobs", "/admin/api/alerts"].includes(path)) return;
  const projectMatch = /^\/admin\/api\/projects\/([^/]+)(?:\/(?:keys|ip-rules|admins|webhooks|status|delete))?$/.exec(path);
  if (projectMatch) {
    allowedProject(projectMatch[1], request.method !== "GET");
    return;
  }
  const requestMatch = /^\/admin\/api\/requests\/([^/]+)$/.exec(path);
  if (requestMatch && request.method === "GET") {
    const row = await env.DB.prepare("SELECT project_id FROM requests WHERE id = ?").bind(requestMatch[1]).first<{ project_id: string | null }>();
    allowedProject(row?.project_id);
    return;
  }
  const keyMatch = /^\/admin\/api\/virtual-keys\/([^/]+)\/(?:revoke|status|rotate)$/.exec(path);
  if (keyMatch) {
    const row = await env.DB.prepare("SELECT project_id FROM virtual_keys WHERE id = ?").bind(keyMatch[1]).first<{ project_id: string }>();
    allowedProject(row?.project_id, true);
    return;
  }
  const ipRuleMatch = /^\/admin\/api\/ip-rules\/([^/]+)$/.exec(path);
  if (ipRuleMatch) {
    const row = await env.DB.prepare("SELECT project_id FROM project_ip_rules WHERE id = ?").bind(ipRuleMatch[1]).first<{ project_id: string }>();
    allowedProject(row?.project_id, true);
    return;
  }
  const projectAdminMatch = /^\/admin\/api\/project-admins\/([^/]+)$/.exec(path);
  if (projectAdminMatch) {
    const row = await env.DB.prepare("SELECT project_id FROM project_admins WHERE id = ?").bind(projectAdminMatch[1]).first<{ project_id: string }>();
    allowedProject(row?.project_id, true);
    return;
  }
  const webhookMatch = /^\/admin\/api\/webhooks\/([^/]+)$/.exec(path);
  if (webhookMatch) {
    const row = await env.DB.prepare("SELECT project_id FROM project_webhooks WHERE id = ?").bind(webhookMatch[1]).first<{ project_id: string }>();
    allowedProject(row?.project_id, true);
    return;
  }
  const alertMatch = /^\/admin\/api\/alerts\/([^/]+)\/status$/.exec(path);
  if (alertMatch) {
    const row = await env.DB.prepare("SELECT project_id FROM alerts WHERE id = ?").bind(alertMatch[1]).first<{ project_id: string | null }>();
    allowedProject(row?.project_id, true);
    return;
  }
  throw new ApiError(403, "ADMIN_SCOPE_FORBIDDEN", "Project administrators cannot access this global administration resource.");
}

async function dashboard(env: Env, url: URL): Promise<Response> {
  const period = url.searchParams.get("period") ?? "today";
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const since = period === "7d" ? new Date(Date.now() - 6 * 86_400_000).toISOString() : period === "30d" ? new Date(Date.now() - 29 * 86_400_000).toISOString() : period === "month" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() : period === "custom" ? validDateQuery(url, "started_after") ?? todayStart : todayStart;
  const until = period === "custom" ? validDateQuery(url, "started_before") : null;
  const conditions = ["r.started_at >= ?"];
  const values: string[] = [since];
  const monthConditions = ["r.started_at >= ?"];
  const monthValues: string[] = [new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()];
  if (until) { conditions.push("r.started_at <= ?"); values.push(until); }
  for (const [param, column] of [["project_id", "r.project_id"], ["provider_id", "r.provider_id"], ["model_id", "r.model_id"]] as const) {
    const value = url.searchParams.get(param);
    if (value) {
      conditions.push(`${column} = ?`);
      values.push(value);
      monthConditions.push(`${column} = ?`);
      monthValues.push(value);
    }
  }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const monthWhere = `WHERE ${monthConditions.join(" AND ")}`;
  const [summary, month, projects, dailyUsage, serviceStatus, costByProject, models, atRisk] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(estimated_cost_cents), 0) AS cost, COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS successes, COALESCE(SUM(CASE WHEN status IN ('failed', 'rejected') THEN 1 ELSE 0 END), 0) AS failures, COALESCE(AVG(duration_ms), 0) AS average_duration_ms FROM requests r ${where}`).bind(...values).first(),
    env.DB.prepare(`SELECT COUNT(*) AS requests, COALESCE(SUM(estimated_cost_cents), 0) AS cost FROM requests r ${monthWhere}`).bind(...monthValues).first(),
    env.DB.prepare("SELECT status, COUNT(*) AS count FROM projects GROUP BY status").all(),
    env.DB.prepare(`SELECT date(r.started_at) AS usage_date, COUNT(*) AS requests,
      COALESCE(SUM(r.estimated_cost_cents), 0) AS cost_cents,
      COALESCE(SUM(CASE WHEN r.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS successes,
      COALESCE(SUM(CASE WHEN r.status IN ('failed', 'rejected') THEN 1 ELSE 0 END), 0) AS failures
      FROM requests r ${where} GROUP BY date(r.started_at) ORDER BY usage_date ASC`).bind(...values).all(),
    env.DB.prepare(`SELECT date(started_at) AS usage_date, COUNT(*) AS requests,
      COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS successes,
      COALESCE(SUM(CASE WHEN status IN ('failed', 'rejected') THEN 1 ELSE 0 END), 0) AS failures
      FROM requests WHERE started_at >= datetime('now', '-29 days')
      GROUP BY date(started_at) ORDER BY usage_date ASC`).all(),
    env.DB.prepare(`SELECT p.name, COALESCE(SUM(r.estimated_cost_cents), 0) AS cost_cents FROM projects p JOIN requests r ON r.project_id = p.id ${where} GROUP BY p.id ORDER BY cost_cents DESC LIMIT 8`).bind(...values).all(),
    env.DB.prepare(`SELECT m.alias, COUNT(r.id) AS requests, COALESCE(SUM(r.estimated_cost_cents), 0) AS cost_cents FROM models m JOIN requests r ON r.model_id = m.id ${where} GROUP BY m.id ORDER BY requests DESC LIMIT 8`).bind(...values).all(),
    env.DB.prepare(`SELECT p.id, p.name, p.slug, d.request_count, d.estimated_cost_cents, l.daily_request_limit, l.daily_cost_limit_cents
      FROM projects p JOIN project_limits l ON l.project_id = p.id LEFT JOIN usage_daily d ON d.project_id = p.id AND d.usage_date = date('now')
      WHERE p.status = 'active' AND ((l.daily_request_limit IS NOT NULL AND COALESCE(d.request_count, 0) * 100 >= l.daily_request_limit * 70) OR (l.daily_cost_limit_cents IS NOT NULL AND COALESCE(d.estimated_cost_cents, 0) * 100 >= l.daily_cost_limit_cents * 70))
      ORDER BY MAX(COALESCE(d.request_count, 0) * 1.0 / NULLIF(l.daily_request_limit, 0), COALESCE(d.estimated_cost_cents, 0) * 1.0 / NULLIF(l.daily_cost_limit_cents, 0)) DESC LIMIT 8`).all(),
  ]);
  return json({ period, range: { started_after: since, started_before: until }, summary, today: summary, month, projects: projects.results, daily_usage: dailyUsage.results, service_status: serviceStatus.results, cost_by_project: costByProject.results, model_usage: models.results, at_risk_projects: atRisk.results });
}

async function listProjects(request: Request, env: Env, url: URL, allowedProjectIds: string[] | null = null): Promise<Response> {
  const { page, pageSize, offset } = paginationParams(url);
  const scope = allowedProjectIds ? `WHERE p.id IN (${allowedProjectIds.map(() => "?").join(",")})` : "";
  const [result, count] = await Promise.all([
    env.DB.prepare(
    `SELECT p.id, p.name, p.slug, p.category, p.status, p.environment, p.contact_email, p.log_policy, p.ip_logging, p.model_fallback_enabled, p.created_at,
            l.rpm_limit, l.concurrency_limit, l.daily_request_limit, l.monthly_request_limit, l.daily_cost_limit_cents, l.monthly_cost_limit_cents,
            COALESCE(d.request_count, 0) AS today_requests, COALESCE(d.estimated_cost_cents, 0) AS today_cost_cents,
            (SELECT key_prefix || '…' || key_last4 FROM virtual_keys vk WHERE vk.project_id = p.id AND vk.status = 'active' ORDER BY vk.created_at DESC LIMIT 1) AS virtual_key_mask,
            (SELECT id FROM virtual_keys vk WHERE vk.project_id = p.id AND vk.status = 'active' ORDER BY vk.created_at DESC LIMIT 1) AS virtual_key_id,
            (SELECT key_prefix FROM virtual_keys vk WHERE vk.project_id = p.id AND vk.status = 'active' ORDER BY vk.created_at DESC LIMIT 1) AS virtual_key_prefix,
            (SELECT key_last4 FROM virtual_keys vk WHERE vk.project_id = p.id AND vk.status = 'active' ORDER BY vk.created_at DESC LIMIT 1) AS virtual_key_last4
     FROM projects p JOIN project_limits l ON l.project_id = p.id
     LEFT JOIN usage_daily d ON d.project_id = p.id AND d.usage_date = date('now')
     ${scope} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...(allowedProjectIds ?? []), pageSize, offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM projects p ${scope}`).bind(...(allowedProjectIds ?? [])).first<{ total: number }>(),
  ]);
  const projects = await Promise.all(result.results.map(async (project) => ({
    ...project,
    integration: await projectIntegrationInfo(request, env, String(project.id)),
  })));
  return json({ projects, pagination: paginationMeta(page, pageSize, Number(count?.total ?? 0)) });
}

async function createProject(request: Request, env: Env, actor: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const name = requiredString(body, "name");
  const slug = requiredSlug(body, "slug");
  const existingProject = await env.DB.prepare("SELECT id FROM projects WHERE slug = ?").bind(slug).first();
  if (existingProject) throw new ApiError(409, "PROJECT_SLUG_EXISTS", "A project with this slug already exists. Choose a different slug.");
  const id = crypto.randomUUID();
  const createdAt = now();
  const [defaultLogPolicy, defaultIpLogging] = await Promise.all([settingValue(env, "default_log_policy", "metadata"), settingValue(env, "default_ip_logging", "masked")]);
  const limits = body.limits && typeof body.limits === "object" ? body.limits as Record<string, unknown> : {};
  const modelIds = Array.isArray(body.model_ids) && body.model_ids.every((value) => typeof value === "string")
    ? [...new Set(body.model_ids as string[])] : [];
  if (!modelIds.length) throw new ApiError(400, "MODEL_REQUIRED", "Select at least one active model for the project.");
  if (modelIds.length) {
    const models = await Promise.all(modelIds.map((modelId) => env.DB.prepare("SELECT id FROM models WHERE id = ? AND status = 'active'").bind(modelId).first()));
    if (models.some((model) => !model)) throw new ApiError(400, "INVALID_REQUEST", "One or more selected models do not exist or are inactive.");
  }
  const routing = projectModelRouting(body, modelIds);
  const key = generateVirtualKey();
  const identity = keyIdentity(key);
  const virtualKeyId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO projects(id, name, slug, description, category, environment, contact_email, status, log_policy, ip_logging, model_fallback_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)")
      .bind(id, name, slug, optionalString(body, "description") ?? "", optionalEnum(body, "category", ["image_saas", "video_saas", "other_tools"], "other_tools"), optionalEnum(body, "environment", ["development", "staging", "production"], "production"), optionalString(body, "contact_email"), optionalEnum(body, "log_policy", ["metadata", "request", "full"], defaultLogPolicy === "request" || defaultLogPolicy === "full" ? defaultLogPolicy : "metadata"), optionalEnum(body, "ip_logging", ["full", "masked", "none"], defaultIpLogging === "full" || defaultIpLogging === "none" ? defaultIpLogging : "masked"), booleanInt(body, "model_fallback_enabled", 0), createdAt, createdAt),
    env.DB.prepare("INSERT INTO project_limits(project_id, rpm_limit, concurrency_limit, daily_request_limit, monthly_request_limit, daily_cost_limit_cents, monthly_cost_limit_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, positiveInt(limits, "rpm_limit", 60), positiveInt(limits, "concurrency_limit", 5), nullablePositiveInt(limits, "daily_request_limit"), nullablePositiveInt(limits, "monthly_request_limit"), nullablePositiveInt(limits, "daily_cost_limit_cents"), nullablePositiveInt(limits, "monthly_cost_limit_cents"), createdAt, createdAt),
    env.DB.prepare("INSERT INTO virtual_keys(id, project_id, name, key_hash, key_prefix, key_last4, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)")
      .bind(virtualKeyId, id, `${name} default`, await sha256(key), identity.prefix, identity.last4, actor, createdAt),
    ...modelIds.map((modelId) => env.DB.prepare("INSERT INTO project_models(project_id, model_id, is_default, status, project_alias, fallback_priority, daily_cost_limit_cents, monthly_cost_limit_cents, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)")
      .bind(
        id,
        modelId,
        routing.defaultModelId === modelId ? 1 : 0,
        routing.aliases[modelId] ?? null,
        routing.priorities[modelId],
        routing.limits[modelId]?.daily_cost_limit_cents ?? null,
        routing.limits[modelId]?.monthly_cost_limit_cents ?? null,
        createdAt,
        createdAt,
      )),
  ]);
  await audit(env, request, actor, "project.create", "project", id, null, JSON.stringify({ name, slug }));
  return json({
    project: { id, name, slug },
    virtual_key_id: virtualKeyId,
    virtual_key: key,
    integration: await projectIntegrationInfo(request, env, id),
    warning: "Copy this virtual key now. It cannot be retrieved again.",
  }, 201);
}

async function createVirtualKey(request: Request, env: Env, actor: string, projectId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const project = await env.DB.prepare("SELECT id, name FROM projects WHERE id = ?").bind(projectId).first<{ id: string; name: string }>();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const key = generateVirtualKey();
  const identity = keyIdentity(key);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO virtual_keys(id, project_id, name, key_hash, key_prefix, key_last4, status, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)")
    .bind(id, projectId, optionalString(body, "name") ?? `${project.name} key`, await sha256(key), identity.prefix, identity.last4, optionalString(body, "expires_at"), actor, now()).run();
  await audit(env, request, actor, "virtual_key.create", "virtual_key", id, null, JSON.stringify({ project_id: projectId, prefix: identity.prefix, last4: identity.last4 }));
  return json({
    id,
    virtual_key: key,
    integration: await projectIntegrationInfo(request, env, projectId),
    warning: "Copy this virtual key now. It cannot be retrieved again.",
  }, 201);
}

async function revokeVirtualKey(request: Request, env: Env, actor: string, keyId: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT status, key_prefix, key_last4 FROM virtual_keys WHERE id = ?").bind(keyId).first<{ status: string; key_prefix: string; key_last4: string }>();
  if (!row) throw new ApiError(404, "VIRTUAL_KEY_NOT_FOUND", "Virtual key not found.");
  await env.DB.prepare("UPDATE virtual_keys SET status = 'revoked', revoked_at = ? WHERE id = ?").bind(now(), keyId).run();
  await audit(env, request, actor, "virtual_key.revoke", "virtual_key", keyId, JSON.stringify(row), JSON.stringify({ status: "revoked" }));
  return json({ revoked: true });
}

async function setProjectStatus(request: Request, env: Env, actor: string, projectId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const status = optionalEnum(body, "status", ["active", "paused", "disabled"], "paused");
  const previous = await env.DB.prepare("SELECT status FROM projects WHERE id = ?").bind(projectId).first<{ status: string }>();
  if (!previous) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await env.DB.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?").bind(status, now(), projectId).run();
  await audit(env, request, actor, "project.status", "project", projectId, JSON.stringify(previous), JSON.stringify({ status }));
  return json({ status });
}

async function deleteProject(request: Request, env: Env, actor: string, projectId: string): Promise<Response> {
  const project = await env.DB.prepare("SELECT id, name, slug, status FROM projects WHERE id = ?")
    .bind(projectId)
    .first<{ id: string; name: string; slug: string; status: string }>();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM requests WHERE project_id = ?").bind(projectId),
    env.DB.prepare("DELETE FROM alerts WHERE project_id = ?").bind(projectId),
    env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId),
  ]);
  await audit(env, request, actor, "project.delete", "project", projectId, JSON.stringify(project), JSON.stringify({ deleted: true }));
  return json({ deleted: true, project: { id: project.id, name: project.name } });
}

async function projectDetail(request: Request, env: Env, projectId: string): Promise<Response> {
  const [project, keys, models, recentRequests, daily, monthly, alerts, ipRules] = await Promise.all([
    env.DB.prepare(`SELECT p.*, l.rpm_limit, l.concurrency_limit, l.daily_request_limit, l.monthly_request_limit,
      l.daily_cost_limit_cents, l.monthly_cost_limit_cents FROM projects p JOIN project_limits l ON l.project_id = p.id WHERE p.id = ?`).bind(projectId).first(),
    env.DB.prepare(
      `SELECT vk.id, vk.name, vk.key_prefix, vk.key_last4, vk.status, vk.expires_at,
              vk.rotation_expires_at, vk.last_used_at, vk.created_at, vk.revoked_at,
              COUNT(r.id) AS request_count,
              COALESCE(SUM(CASE WHEN r.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_count,
              COALESCE(SUM(r.input_tokens), 0) AS input_tokens,
              COALESCE(SUM(r.output_tokens), 0) AS output_tokens,
              COALESCE(SUM(r.estimated_cost_cents), 0) AS estimated_cost_cents,
              COALESCE(AVG(r.duration_ms), 0) AS average_duration_ms
       FROM virtual_keys vk
       LEFT JOIN requests r ON r.virtual_key_id = vk.id
       WHERE vk.project_id = ?
       GROUP BY vk.id
       ORDER BY vk.created_at DESC`,
    ).bind(projectId).all(),
    env.DB.prepare(`SELECT m.id, m.name, m.alias, m.request_type, pm.project_alias, pm.fallback_priority,
      pm.is_default, pm.status, pm.daily_cost_limit_cents, pm.monthly_cost_limit_cents
      FROM project_models pm JOIN models m ON m.id = pm.model_id
      WHERE pm.project_id = ? ORDER BY pm.fallback_priority, m.alias`).bind(projectId).all(),
    env.DB.prepare(`SELECT id, endpoint, status, http_status, duration_ms, estimated_cost_cents, error_code, started_at
      FROM requests WHERE project_id = ? ORDER BY started_at DESC LIMIT 20`).bind(projectId).all(),
    env.DB.prepare("SELECT request_count, success_count, failure_count, estimated_cost_cents FROM usage_daily WHERE project_id = ? AND usage_date = date('now')").bind(projectId).first(),
    env.DB.prepare("SELECT request_count, success_count, failure_count, estimated_cost_cents FROM usage_monthly WHERE project_id = ? AND usage_month = strftime('%Y-%m', 'now')").bind(projectId).first(),
    env.DB.prepare("SELECT id, type, severity, message, status, created_at, resolved_at FROM alerts WHERE project_id = ? ORDER BY created_at DESC LIMIT 20").bind(projectId).all(),
    env.DB.prepare("SELECT id, rule_type, value, note, status, created_at, updated_at FROM project_ip_rules WHERE project_id = ? ORDER BY rule_type, created_at").bind(projectId).all(),
  ]);
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  return json({
    project,
    keys: keys.results,
    models: models.results,
    recent_requests: recentRequests.results,
    alerts: alerts.results,
    ip_rules: ipRules.results,
    integration: await projectIntegrationInfo(request, env, projectId),
    usage: { daily: daily ?? emptyUsage(), monthly: monthly ?? emptyUsage() },
  });
}

async function listVirtualKeys(env: Env, projectId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT vk.id, vk.name, vk.key_prefix, vk.key_last4, vk.status, vk.expires_at,
            vk.rotation_expires_at, vk.last_used_at, vk.created_at, vk.revoked_at,
            COUNT(r.id) AS request_count,
            COALESCE(SUM(CASE WHEN r.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_count,
            COALESCE(SUM(r.input_tokens), 0) AS input_tokens,
            COALESCE(SUM(r.output_tokens), 0) AS output_tokens,
            COALESCE(SUM(r.estimated_cost_cents), 0) AS estimated_cost_cents,
            COALESCE(AVG(r.duration_ms), 0) AS average_duration_ms
     FROM virtual_keys vk
     LEFT JOIN requests r ON r.virtual_key_id = vk.id
     WHERE vk.project_id = ?
     GROUP BY vk.id
     ORDER BY vk.created_at DESC`,
  ).bind(projectId).all();
  return json({ virtual_keys: result.results });
}

async function listProjectIpRules(env: Env, projectId: string): Promise<Response> {
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const result = await env.DB.prepare(
    "SELECT id, rule_type, value, note, status, created_by, created_at, updated_at FROM project_ip_rules WHERE project_id = ? ORDER BY rule_type, created_at",
  ).bind(projectId).all();
  return json({ ip_rules: result.results });
}

async function createProjectIpRule(request: Request, env: Env, actor: string, projectId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const value = normalizeIpRule(requiredString(body, "value"));
  if (!value) throw new ApiError(400, "INVALID_IP_RULE", "value must be an IPv4 address, IPv4 CIDR, or IPv6 address.");
  const ruleType = optionalEnum(body, "rule_type", ["allow", "block"], "block");
  const id = crypto.randomUUID();
  const timestamp = now();
  try {
    await env.DB.prepare("INSERT INTO project_ip_rules(id, project_id, rule_type, value, note, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)")
      .bind(id, projectId, ruleType, value, optionalString(body, "note") ?? "", actor, timestamp, timestamp).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) throw new ApiError(409, "IP_RULE_EXISTS", "This IP rule already exists for the project.");
    throw error;
  }
  await audit(env, request, actor, "project_ip_rule.create", "project_ip_rule", id, null, JSON.stringify({ project_id: projectId, rule_type: ruleType, value }));
  return json({ ip_rule: { id, project_id: projectId, rule_type: ruleType, value, status: "active" } }, 201);
}

async function updateProjectIpRule(request: Request, env: Env, actor: string, ruleId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const previous = await env.DB.prepare("SELECT id, project_id, rule_type, value, note, status FROM project_ip_rules WHERE id = ?").bind(ruleId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "IP_RULE_NOT_FOUND", "Project IP rule not found.");
  const status = optionalEnum(body, "status", ["active", "disabled"], String(previous.status) as "active" | "disabled");
  await env.DB.prepare("UPDATE project_ip_rules SET note = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(optionalString(body, "note") ?? String(previous.note ?? ""), status, now(), ruleId).run();
  await audit(env, request, actor, "project_ip_rule.update", "project_ip_rule", ruleId, JSON.stringify(previous), JSON.stringify({ status, note: optionalString(body, "note") }));
  return json({ updated: true, status });
}

async function deleteProjectIpRule(request: Request, env: Env, actor: string, ruleId: string): Promise<Response> {
  const previous = await env.DB.prepare("SELECT id, project_id, rule_type, value, status FROM project_ip_rules WHERE id = ?").bind(ruleId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "IP_RULE_NOT_FOUND", "Project IP rule not found.");
  await env.DB.prepare("DELETE FROM project_ip_rules WHERE id = ?").bind(ruleId).run();
  await audit(env, request, actor, "project_ip_rule.delete", "project_ip_rule", ruleId, JSON.stringify(previous), null);
  return json({ deleted: true });
}

async function listProjectAdmins(env: Env, projectId: string): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT id, email, role, status, created_by, created_at, updated_at FROM project_admins WHERE project_id = ? ORDER BY email",
  ).bind(projectId).all();
  return json({ project_admins: result.results });
}

async function createProjectAdmin(request: Request, env: Env, actor: string, projectId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const email = requiredString(body, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new ApiError(400, "INVALID_REQUEST", "email must be a valid email address.");
  const id = crypto.randomUUID();
  const timestamp = now();
  try {
    await env.DB.prepare("INSERT INTO project_admins(id, project_id, email, role, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)")
      .bind(id, projectId, email, optionalEnum(body, "role", ["manager", "viewer"], "manager"), actor, timestamp, timestamp).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) throw new ApiError(409, "PROJECT_ADMIN_EXISTS", "This administrator is already assigned to the project.");
    throw error;
  }
  await audit(env, request, actor, "project_admin.create", "project_admin", id, null, JSON.stringify({ project_id: projectId, email }));
  return json({ project_admin: { id, email } }, 201);
}

async function updateProjectAdmin(request: Request, env: Env, actor: string, adminId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const previous = await env.DB.prepare("SELECT id, project_id, email, role, status FROM project_admins WHERE id = ?").bind(adminId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "PROJECT_ADMIN_NOT_FOUND", "Project administrator assignment not found.");
  const role = optionalEnum(body, "role", ["manager", "viewer"], String(previous.role) as "manager" | "viewer");
  const status = optionalEnum(body, "status", ["active", "disabled"], String(previous.status) as "active" | "disabled");
  await env.DB.prepare("UPDATE project_admins SET role = ?, status = ?, updated_at = ? WHERE id = ?").bind(role, status, now(), adminId).run();
  await audit(env, request, actor, "project_admin.update", "project_admin", adminId, JSON.stringify(previous), JSON.stringify({ role, status }));
  return json({ updated: true, role, status });
}

async function deleteProjectAdmin(request: Request, env: Env, actor: string, adminId: string): Promise<Response> {
  const previous = await env.DB.prepare("SELECT id, project_id, email, role, status FROM project_admins WHERE id = ?").bind(adminId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "PROJECT_ADMIN_NOT_FOUND", "Project administrator assignment not found.");
  await env.DB.prepare("DELETE FROM project_admins WHERE id = ?").bind(adminId).run();
  await audit(env, request, actor, "project_admin.delete", "project_admin", adminId, JSON.stringify(previous), null);
  return json({ deleted: true });
}

const webhookEventTypes = ["request.completed", "job.completed", "alert.created"] as const;

async function listProjectWebhooks(env: Env, projectId: string): Promise<Response> {
  const [webhooks, deliveries] = await Promise.all([
    env.DB.prepare("SELECT id, name, url, secret_last4, event_types, status, created_at, updated_at FROM project_webhooks WHERE project_id = ? ORDER BY created_at DESC").bind(projectId).all(),
    env.DB.prepare(`SELECT d.id, d.webhook_id, d.event_type, d.event_id, d.status, d.attempt_count, d.http_status, d.last_error, d.created_at, d.updated_at
      FROM webhook_deliveries d WHERE d.project_id = ? ORDER BY d.created_at DESC LIMIT 50`).bind(projectId).all(),
  ]);
  return json({ webhooks: webhooks.results, deliveries: deliveries.results });
}

async function createProjectWebhook(request: Request, env: Env, actor: string, projectId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const url = requiredUrl(body, "url");
  const events = normalizeWebhookEvents(body.event_types);
  const secret = `whsec_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const id = crypto.randomUUID();
  const timestamp = now();
  await env.DB.prepare("INSERT INTO project_webhooks(id, project_id, name, url, encrypted_secret, secret_last4, event_types, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)")
    .bind(id, projectId, requiredString(body, "name"), url, await encryptAdminSecret(secret, env), secret.slice(-4), events.join(","), actor, timestamp, timestamp).run();
  await audit(env, request, actor, "project_webhook.create", "project_webhook", id, null, JSON.stringify({ project_id: projectId, url, event_types: events }));
  return json({ webhook: { id, project_id: projectId, url, event_types: events }, signing_secret: secret, warning: "Copy this webhook signing secret now. It cannot be retrieved again." }, 201);
}

async function updateProjectWebhook(request: Request, env: Env, actor: string, webhookId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const previous = await env.DB.prepare("SELECT id, project_id, name, url, event_types, status FROM project_webhooks WHERE id = ?").bind(webhookId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "WEBHOOK_NOT_FOUND", "Project webhook not found.");
  const url = optionalString(body, "url");
  if (url) requiredUrl({ url }, "url");
  const events = Object.prototype.hasOwnProperty.call(body, "event_types") ? normalizeWebhookEvents(body.event_types) : String(previous.event_types).split(",");
  const next = {
    name: optionalString(body, "name") ?? String(previous.name),
    url: url?.replace(/\/$/, "") ?? String(previous.url),
    status: optionalEnum(body, "status", ["active", "disabled"], String(previous.status) as "active" | "disabled"),
  };
  await env.DB.prepare("UPDATE project_webhooks SET name = ?, url = ?, event_types = ?, status = ?, updated_at = ? WHERE id = ?")
    .bind(next.name, next.url, events.join(","), next.status, now(), webhookId).run();
  await audit(env, request, actor, "project_webhook.update", "project_webhook", webhookId, JSON.stringify(previous), JSON.stringify({ ...next, event_types: events }));
  return json({ updated: true, ...next, event_types: events });
}

async function deleteProjectWebhook(request: Request, env: Env, actor: string, webhookId: string): Promise<Response> {
  const previous = await env.DB.prepare("SELECT id, project_id, name, url, status FROM project_webhooks WHERE id = ?").bind(webhookId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "WEBHOOK_NOT_FOUND", "Project webhook not found.");
  await env.DB.prepare("DELETE FROM project_webhooks WHERE id = ?").bind(webhookId).run();
  await audit(env, request, actor, "project_webhook.delete", "project_webhook", webhookId, JSON.stringify(previous), null);
  return json({ deleted: true });
}

function normalizeWebhookEvents(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const events = [...new Set(values.filter((event): event is string => typeof event === "string").map((event) => event.trim()).filter((event) => (webhookEventTypes as readonly string[]).includes(event)))];
  if (!events.length) throw new ApiError(400, "INVALID_REQUEST", "Select at least one supported webhook event.");
  return events;
}

async function encryptAdminSecret(value: string, env: Env): Promise<string> {
  try {
    return await encryptSecret(value, env.CREDENTIAL_ENCRYPTION_KEY);
  } catch {
    throw new ApiError(
      503,
      "ENCRYPTION_NOT_CONFIGURED",
      "The credential encryption key is missing or invalid. Configure CREDENTIAL_ENCRYPTION_KEY and retry.",
    );
  }
}

async function updateProject(request: Request, env: Env, actor: string, projectId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const previous = await env.DB.prepare("SELECT id, name, slug FROM projects WHERE id = ?").bind(projectId).first();
  if (!previous) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const current = await env.DB.prepare(`SELECT p.*, l.rpm_limit, l.concurrency_limit, l.daily_request_limit, l.monthly_request_limit,
    l.daily_cost_limit_cents, l.monthly_cost_limit_cents FROM projects p JOIN project_limits l ON l.project_id = p.id WHERE p.id = ?`).bind(projectId).first<Record<string, unknown>>();
  const limits = body.limits && typeof body.limits === "object" ? body.limits as Record<string, unknown> : {};
  const updatedAt = now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE projects SET name = ?, description = ?, category = ?, environment = ?, contact_email = ?, log_policy = ?, ip_logging = ?, model_fallback_enabled = ?, updated_at = ? WHERE id = ?`)
      .bind(optionalString(body, "name") ?? String(current?.name ?? ""), optionalString(body, "description") ?? String(current?.description ?? ""), optionalEnum(body, "category", ["image_saas", "video_saas", "other_tools"], String(current?.category ?? "other_tools") as "image_saas" | "video_saas" | "other_tools"), optionalEnum(body, "environment", ["development", "staging", "production"], String(current?.environment ?? "production") as "development" | "staging" | "production"), optionalString(body, "contact_email") ?? current?.contact_email ?? null, optionalEnum(body, "log_policy", ["metadata", "request", "full"], String(current?.log_policy ?? "metadata") as "metadata" | "request" | "full"), optionalEnum(body, "ip_logging", ["full", "masked", "none"], String(current?.ip_logging ?? "masked") as "full" | "masked" | "none"), booleanInt(body, "model_fallback_enabled", Number(current?.model_fallback_enabled ?? 0)), updatedAt, projectId),
    env.DB.prepare(`UPDATE project_limits SET rpm_limit = ?, concurrency_limit = ?, daily_request_limit = ?, monthly_request_limit = ?, daily_cost_limit_cents = ?, monthly_cost_limit_cents = ?, updated_at = ? WHERE project_id = ?`)
      .bind(positiveInt(limits, "rpm_limit", Number(current?.rpm_limit ?? 60)), positiveInt(limits, "concurrency_limit", Number(current?.concurrency_limit ?? 5)), nullablePositiveIntOrCurrent(limits, "daily_request_limit", current?.daily_request_limit), nullablePositiveIntOrCurrent(limits, "monthly_request_limit", current?.monthly_request_limit), nullablePositiveIntOrCurrent(limits, "daily_cost_limit_cents", current?.daily_cost_limit_cents), nullablePositiveIntOrCurrent(limits, "monthly_cost_limit_cents", current?.monthly_cost_limit_cents), updatedAt, projectId),
  ]);
  if (Array.isArray(body.model_ids)) await replaceProjectModels(env, projectId, body.model_ids, updatedAt, body);
  await audit(env, request, actor, "project.update", "project", projectId, JSON.stringify(previous), JSON.stringify({ fields: Object.keys(body) }));
  return projectDetail(request, env, projectId);
}

async function replaceProjectModels(env: Env, projectId: string, rawModelIds: unknown[], timestamp: string, configuration: Record<string, unknown>): Promise<void> {
  if (!rawModelIds.every((value) => typeof value === "string")) throw new ApiError(400, "INVALID_REQUEST", "model_ids must be an array of model IDs.");
  const modelIds = [...new Set(rawModelIds as string[])];
  const existing = await env.DB.prepare("SELECT model_id, is_default, project_alias, fallback_priority, daily_cost_limit_cents, monthly_cost_limit_cents FROM project_models WHERE project_id = ? ORDER BY fallback_priority, model_id")
    .bind(projectId).all<Record<string, unknown>>();
  const existingAliases = Object.fromEntries(existing.results.filter((row) => typeof row.project_alias === "string").map((row) => [String(row.model_id), row.project_alias]));
  const existingLimits = Object.fromEntries(existing.results.map((row) => [String(row.model_id), {
    daily_cost_limit_cents: typeof row.daily_cost_limit_cents === "number" ? row.daily_cost_limit_cents : null,
    monthly_cost_limit_cents: typeof row.monthly_cost_limit_cents === "number" ? row.monthly_cost_limit_cents : null,
  }]));
  const existingFallback = existing.results.map((row) => String(row.model_id)).filter((id) => modelIds.includes(id));
  const existingDefault = existing.results.find((row) => Number(row.is_default) === 1)?.model_id;
  const routing = projectModelRouting(configuration, modelIds, {
    defaultModelId: typeof existingDefault === "string" ? existingDefault : null,
    aliases: existingAliases,
    fallbackOrder: existingFallback,
    limits: existingLimits,
  });
  if (modelIds.length) {
    const rows = await Promise.all(modelIds.map((id) => env.DB.prepare("SELECT id FROM models WHERE id = ? AND status = 'active'").bind(id).first()));
    if (rows.some((row) => !row)) throw new ApiError(400, "INVALID_REQUEST", "One or more selected models do not exist or are inactive.");
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM project_models WHERE project_id = ?").bind(projectId),
    ...modelIds.map((modelId, index) => {
      const limits = routing.limits[modelId] ?? {};
      return env.DB.prepare("INSERT INTO project_models(project_id, model_id, is_default, status, project_alias, fallback_priority, daily_cost_limit_cents, monthly_cost_limit_cents, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)")
        .bind(projectId, modelId, routing.defaultModelId === modelId ? 1 : 0, routing.aliases[modelId] ?? null, routing.priorities[modelId] ?? index, limits.daily_cost_limit_cents ?? null, limits.monthly_cost_limit_cents ?? null, timestamp, timestamp);
    }),
  ]);
}

async function setVirtualKeyStatus(request: Request, env: Env, actor: string, keyId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const status = optionalEnum(body, "status", ["active", "disabled", "revoked"], "disabled");
  if (status === "revoked") return revokeVirtualKey(request, env, actor, keyId);
  const previous = await env.DB.prepare("SELECT status FROM virtual_keys WHERE id = ?").bind(keyId).first();
  if (!previous) throw new ApiError(404, "VIRTUAL_KEY_NOT_FOUND", "Virtual key not found.");
  await env.DB.prepare("UPDATE virtual_keys SET status = ?, rotation_expires_at = CASE WHEN ? = 'active' THEN NULL ELSE rotation_expires_at END WHERE id = ?").bind(status, status, keyId).run();
  await audit(env, request, actor, "virtual_key.status", "virtual_key", keyId, JSON.stringify(previous), JSON.stringify({ status }));
  return json({ status });
}

async function rotateVirtualKey(request: Request, env: Env, actor: string, keyId: string): Promise<Response> {
  const previous = await env.DB.prepare("SELECT project_id, name, status FROM virtual_keys WHERE id = ?").bind(keyId).first<{ project_id: string; name: string; status: string }>();
  if (!previous) throw new ApiError(404, "VIRTUAL_KEY_NOT_FOUND", "Virtual key not found.");
  if (previous.status !== "active") throw new ApiError(400, "INVALID_REQUEST", "Only an active virtual key can be rotated.");
  const body = await readJsonBody(request, maxAdminBody);
  const defaultGrace = Number(await settingValue(env, "virtual_key_rotation_grace_minutes", "1440"));
  const graceMinutes = boundedPositiveInt(body, "grace_period_minutes", defaultGrace, 10_080);
  const rotationExpiresAt = new Date(Date.now() + graceMinutes * 60_000).toISOString();
  const key = generateVirtualKey();
  const identity = keyIdentity(key);
  const id = crypto.randomUUID();
  const createdAt = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE virtual_keys SET status = 'rotating', rotation_expires_at = ? WHERE id = ?").bind(rotationExpiresAt, keyId),
    env.DB.prepare("INSERT INTO virtual_keys(id, project_id, name, key_hash, key_prefix, key_last4, status, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)")
      .bind(id, previous.project_id, optionalString(body, "name") ?? `${previous.name} replacement`, await sha256(key), identity.prefix, identity.last4, optionalString(body, "new_key_expires_at") ?? optionalString(body, "expires_at"), actor, createdAt),
  ]);
  await audit(env, request, actor, "virtual_key.rotate", "virtual_key", keyId, JSON.stringify(previous), JSON.stringify({ replacement_key_id: id, prefix: identity.prefix, last4: identity.last4, rotation_expires_at: rotationExpiresAt }));
  return json({
    id,
    virtual_key: key,
    integration: await projectIntegrationInfo(request, env, previous.project_id),
    previous_key_active_until: rotationExpiresAt,
    warning: `Copy the replacement virtual key now. The former key remains valid until ${rotationExpiresAt} and will then be revoked automatically.`,
  }, 201);
}

async function listProviders(env: Env, url: URL): Promise<Response> {
  const { page, pageSize, offset } = paginationParams(url);
  const [result, count] = await Promise.all([
    env.DB.prepare(`SELECT p.id, p.name, p.slug, p.base_url, p.adapter_type, p.status, p.timeout_ms, p.retry_count, p.created_at,
    (SELECT COUNT(*) FROM provider_credentials c WHERE c.provider_id = p.id AND c.status = 'active' AND c.encrypted_secret <> 'erased') AS credential_count,
    (SELECT COUNT(*) FROM requests r WHERE r.provider_id = p.id AND r.started_at >= date('now')) AS today_requests,
    (SELECT COUNT(*) FROM requests r WHERE r.provider_id = p.id AND r.started_at >= date('now') AND r.status IN ('failed', 'rejected')) AS today_failures
    FROM providers p WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).bind(pageSize, offset).all(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM providers WHERE deleted_at IS NULL").first<{ total: number }>(),
  ]);
  return json({ providers: result.results, pagination: paginationMeta(page, pageSize, Number(count?.total ?? 0)) });
}

async function createProvider(request: Request, env: Env, actor: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const id = crypto.randomUUID();
  const name = requiredString(body, "name");
  const slug = requiredSlug(body, "slug");
  const baseUrl = requiredUrl(body, "base_url");
  const existingProvider = await env.DB.prepare("SELECT id, deleted_at FROM providers WHERE slug = ?").bind(slug).first<{ id: string; deleted_at: string | null }>();
  if (existingProvider) throw new ApiError(409, "PROVIDER_SLUG_EXISTS", existingProvider.deleted_at ? "An archived provider with this slug already exists. Restore it or choose a different slug." : "A provider with this slug already exists. Edit the existing provider or choose a different slug.");
  const [defaultTimeout, defaultRetries] = await Promise.all([settingValue(env, "default_timeout_ms", "60000"), settingValue(env, "default_retry_count", "1")]);
  await env.DB.prepare("INSERT INTO providers(id, name, slug, base_url, adapter_type, status, timeout_ms, retry_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)")
    .bind(id, name, slug, baseUrl, optionalEnum(body, "adapter_type", ["openai-compatible", "custom", "kie", "dewatermark"], "openai-compatible"), positiveInt(body, "timeout_ms", Number(defaultTimeout)), nonNegativeInt(body, "retry_count", Number(defaultRetries)), now(), now()).run();
  await audit(env, request, actor, "provider.create", "provider", id, null, JSON.stringify({ name, slug }));
  return json({ provider: { id, name, slug } }, 201);
}

async function createCredential(request: Request, env: Env, actor: string, providerId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const secret = requiredString(body, "secret");
  if (!env.CREDENTIAL_ENCRYPTION_KEY) throw new ApiError(500, "CONFIGURATION_ERROR", "Credential encryption has not been configured.");
  const provider = await env.DB.prepare("SELECT id FROM providers WHERE id = ?").bind(providerId).first();
  if (!provider) throw new ApiError(404, "PROVIDER_NOT_FOUND", "Provider not found.");
  const encrypted = await encryptAdminSecret(secret, env);
  const name = requiredString(body, "name");
  const last4 = secret.slice(-4);
  const timestamp = now();
  const existing = await env.DB.prepare(
    "SELECT id, name, secret_last4, status FROM provider_credentials WHERE provider_id = ? ORDER BY CASE WHEN encrypted_secret <> 'erased' THEN 0 ELSE 1 END, created_at ASC LIMIT 1",
  ).bind(providerId).first<{ id: string; name: string; secret_last4: string; status: string }>();
  if (existing) {
    await env.DB.batch([
      env.DB.prepare(`UPDATE provider_credentials SET name = ?, encrypted_secret = ?, secret_last4 = ?, status = 'active',
        weight = 1, priority = 100, rpm_limit = NULL, daily_request_limit = NULL, health_status = 'healthy',
        consecutive_failures = 0, circuit_open_until = NULL, last_error = NULL, updated_at = ? WHERE id = ?`)
        .bind(name, encrypted, last4, timestamp, existing.id),
      env.DB.prepare(`UPDATE provider_credentials SET encrypted_secret = 'erased', secret_last4 = 'ERASED', status = 'disabled',
        health_status = 'unhealthy', circuit_open_until = NULL, last_error = 'Superseded by a replacement credential.',
        updated_at = ? WHERE provider_id = ? AND id <> ?`)
        .bind(timestamp, providerId, existing.id),
    ]);
    await audit(env, request, actor, "credential.replace", "provider_credential", existing.id, JSON.stringify(existing), JSON.stringify({ provider_id: providerId, last4 }));
    return json({ credential: { id: existing.id, last4 }, replaced: true });
  }
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO provider_credentials(id, provider_id, name, encrypted_secret, secret_last4, status, weight, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', 1, 100, ?, ?)")
    .bind(id, providerId, name, encrypted, last4, timestamp, timestamp).run();
  await audit(env, request, actor, "credential.create", "provider_credential", id, null, JSON.stringify({ provider_id: providerId, last4 }));
  return json({ credential: { id, last4 }, replaced: false }, 201);
}

async function updateProvider(request: Request, env: Env, actor: string, providerId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const previous = await env.DB.prepare("SELECT name, base_url, adapter_type, status, timeout_ms, retry_count FROM providers WHERE id = ?").bind(providerId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "PROVIDER_NOT_FOUND", "Provider not found.");
  const baseUrl = optionalString(body, "base_url");
  if (baseUrl) requiredUrl({ base_url: baseUrl }, "base_url");
  const updatedAt = now();
  await env.DB.prepare(`UPDATE providers SET name = ?, base_url = ?, adapter_type = ?, status = ?, timeout_ms = ?, retry_count = ?, updated_at = ? WHERE id = ?`)
    .bind(optionalString(body, "name") ?? String(previous.name), baseUrl ?? String(previous.base_url), optionalEnum(body, "adapter_type", ["openai-compatible", "custom", "kie", "dewatermark"], String(previous.adapter_type) as "openai-compatible" | "custom" | "kie" | "dewatermark"), optionalEnum(body, "status", ["active", "disabled"], String(previous.status) as "active" | "disabled"), positiveInt(body, "timeout_ms", Number(previous.timeout_ms)), nonNegativeInt(body, "retry_count", Number(previous.retry_count)), updatedAt, providerId).run();
  await audit(env, request, actor, "provider.update", "provider", providerId, JSON.stringify(previous), JSON.stringify({ fields: Object.keys(body) }));
  return json({ updated: true });
}

async function archiveProvider(request: Request, env: Env, actor: string, providerId: string): Promise<Response> {
  const previous = await env.DB.prepare("SELECT name, slug, status FROM providers WHERE id = ? AND deleted_at IS NULL").bind(providerId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "PROVIDER_NOT_FOUND", "Provider not found.");
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE providers SET status = 'disabled', deleted_at = ?, updated_at = ? WHERE id = ?").bind(timestamp, timestamp, providerId),
    env.DB.prepare("UPDATE provider_credentials SET status = 'disabled', health_status = 'unhealthy', updated_at = ? WHERE provider_id = ?").bind(timestamp, providerId),
    env.DB.prepare("UPDATE models SET status = 'disabled', updated_at = ? WHERE provider_id = ?").bind(timestamp, providerId),
  ]);
  await audit(env, request, actor, "provider.archive", "provider", providerId, JSON.stringify(previous), JSON.stringify({ archived: true }));
  return json({ archived: true });
}

async function testProvider(env: Env, actor: string, request: Request, providerId: string): Promise<Response> {
  const provider = await env.DB.prepare("SELECT id, slug, base_url, adapter_type, timeout_ms FROM providers WHERE id = ?").bind(providerId).first<{ id: string; slug: string; base_url: string; adapter_type: string; timeout_ms: number }>();
  if (!provider) throw new ApiError(404, "PROVIDER_NOT_FOUND", "Provider not found.");
  if (!(["openai-compatible", "kie", "dewatermark"] as const).includes(provider.adapter_type as "openai-compatible" | "kie" | "dewatermark")) throw new ApiError(400, "UNSUPPORTED_ADAPTER", "Connection testing is not available for this provider adapter.");
  const credential = await env.DB.prepare("SELECT id, encrypted_secret FROM provider_credentials WHERE provider_id = ? AND status = 'active' ORDER BY priority ASC, created_at ASC LIMIT 1").bind(providerId).first<{ id: string; encrypted_secret: string }>();
  if (!credential) throw new ApiError(400, "CREDENTIAL_NOT_FOUND", "Add an active provider credential before testing its connection.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(provider.timeout_ms, 1_000), 90_000));
  try {
    const secret = await decryptSecret(credential.encrypted_secret, env.CREDENTIAL_ENCRYPTION_KEY);
    const headers = new Headers();
    if (provider.adapter_type === "dewatermark") headers.set("x-api-key", secret);
    else headers.set("authorization", `Bearer ${secret}`);
    const response = await fetch(
      provider.adapter_type === "dewatermark"
        ? `${provider.base_url.replace(/\/$/, "")}/api/creditInfo`
        : provider.adapter_type === "kie"
          ? `${provider.base_url.replace(/\/$/, "")}/api/v1/chat/credit`
          : providerModelsUrl(provider.slug, provider.base_url),
      { headers, signal: controller.signal },
    );
    const success = response.ok;
    if (success) {
      await env.DB.prepare(`UPDATE provider_credentials SET health_status = 'healthy', consecutive_failures = 0,
        circuit_open_until = NULL, last_error = NULL, updated_at = ? WHERE id = ?`)
        .bind(now(), credential.id).run();
    } else {
      await env.DB.prepare("UPDATE provider_credentials SET health_status = ?, last_error = ?, updated_at = ? WHERE id = ?")
        .bind(response.status === 401 ? "auth_failed" : response.status === 429 ? "rate_limited" : "unhealthy", `Connection test returned HTTP ${response.status}`, now(), credential.id).run();
    }
    await audit(env, request, actor, "provider.test", "provider", providerId, null, JSON.stringify({ credential_id: credential.id, http_status: response.status, success }));
    return json({ success, http_status: response.status });
  } catch (error) {
    await env.DB.prepare("UPDATE provider_credentials SET health_status = 'unhealthy', last_error = ?, updated_at = ? WHERE id = ?").bind("Connection test failed.", now(), credential.id).run();
    await audit(env, request, actor, "provider.test", "provider", providerId, null, JSON.stringify({ credential_id: credential.id, success: false }));
    return json({ success: false, http_status: null, message: error instanceof DOMException && error.name === "AbortError" ? "Connection test timed out." : "Connection test failed." }, 502);
  } finally { clearTimeout(timer); }
}

function providerModelsUrl(slug: string, baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");
  if (slug === "openai" && !/\/v1$/i.test(normalized)) return `${normalized}/v1/models`;
  return `${normalized}/models`;
}

async function listCredentials(env: Env, providerId: string): Promise<Response> {
  const provider = await env.DB.prepare("SELECT id FROM providers WHERE id = ?").bind(providerId).first();
  if (!provider) throw new ApiError(404, "PROVIDER_NOT_FOUND", "Provider not found.");
  const result = await env.DB.prepare(`SELECT id, name, secret_last4, status, weight, priority, rpm_limit, daily_request_limit,
    health_status, consecutive_failures, circuit_open_until, last_used_at, last_error, created_at, updated_at
    FROM provider_credentials WHERE provider_id = ? ORDER BY priority ASC, created_at ASC`).bind(providerId).all();
  return json({ credentials: result.results });
}

async function updateCredential(request: Request, env: Env, actor: string, credentialId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const previous = await env.DB.prepare("SELECT name, weight, priority, rpm_limit, daily_request_limit FROM provider_credentials WHERE id = ?").bind(credentialId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "CREDENTIAL_NOT_FOUND", "Provider credential not found.");
  await env.DB.prepare("UPDATE provider_credentials SET name = ?, weight = ?, priority = ?, rpm_limit = ?, daily_request_limit = ?, updated_at = ? WHERE id = ?")
    .bind(optionalString(body, "name") ?? String(previous.name), positiveInt(body, "weight", Number(previous.weight)), nonNegativeInt(body, "priority", Number(previous.priority)), nullablePositiveIntOrCurrent(body, "rpm_limit", previous.rpm_limit), nullablePositiveIntOrCurrent(body, "daily_request_limit", previous.daily_request_limit), now(), credentialId).run();
  await audit(env, request, actor, "credential.update", "provider_credential", credentialId, JSON.stringify(previous), JSON.stringify({ fields: Object.keys(body) }));
  return json({ updated: true });
}

async function eraseCredential(request: Request, env: Env, actor: string, credentialId: string): Promise<Response> {
  const previous = await env.DB.prepare("SELECT name, secret_last4, status FROM provider_credentials WHERE id = ?").bind(credentialId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "CREDENTIAL_NOT_FOUND", "Provider credential not found.");
  await env.DB.prepare("UPDATE provider_credentials SET encrypted_secret = 'erased', secret_last4 = 'ERASED', status = 'disabled', health_status = 'unhealthy', circuit_open_until = NULL, last_error = 'Credential material permanently erased by administrator.', updated_at = ? WHERE id = ?")
    .bind(now(), credentialId).run();
  await audit(env, request, actor, "credential.erase", "provider_credential", credentialId, JSON.stringify(previous), JSON.stringify({ erased: true }));
  return json({ erased: true });
}

async function setCredentialStatus(request: Request, env: Env, actor: string, credentialId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const status = optionalEnum(body, "status", ["active", "disabled"], "disabled");
  const previous = await env.DB.prepare("SELECT status, health_status, secret_last4 FROM provider_credentials WHERE id = ?").bind(credentialId).first<{ status: string; health_status: string; secret_last4: string }>();
  if (!previous) throw new ApiError(404, "CREDENTIAL_NOT_FOUND", "Provider credential not found.");
  if (status === "active" && previous.secret_last4 === "ERASED") throw new ApiError(400, "CREDENTIAL_ERASED", "An erased credential cannot be reactivated. Create a new credential instead.");
  await env.DB.prepare(`UPDATE provider_credentials SET status = ?, health_status = ?, consecutive_failures = ?,
    circuit_open_until = ?, last_error = ?, updated_at = ? WHERE id = ?`)
    .bind(status, status === "active" ? "healthy" : "unhealthy", 0, null, null, now(), credentialId).run();
  await audit(env, request, actor, "credential.status", "provider_credential", credentialId, JSON.stringify(previous), JSON.stringify({ status }));
  return json({ status });
}

async function listModels(env: Env, url: URL): Promise<Response> {
  const { page, pageSize, offset } = paginationParams(url);
  const [result, count] = await Promise.all([
    env.DB.prepare("SELECT m.id, m.name, m.alias, m.provider_model_id, m.request_type, m.status, m.fixed_cost_cents, m.input_cost_microunits, m.output_cost_microunits, m.billing_unit, m.unit_cost_microunits, m.price_version, m.pricing_note, p.name AS provider_name, p.slug AS provider_slug FROM models m JOIN providers p ON p.id = m.provider_id WHERE p.deleted_at IS NULL AND m.status = 'active' ORDER BY p.name, m.name LIMIT ? OFFSET ?").bind(pageSize, offset).all(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM models m JOIN providers p ON p.id = m.provider_id WHERE p.deleted_at IS NULL AND m.status = 'active'").first<{ total: number }>(),
  ]);
  return json({ models: result.results, pagination: paginationMeta(page, pageSize, Number(count?.total ?? 0)) });
}

async function createModel(request: Request, env: Env, actor: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const providerId = requiredString(body, "provider_id");
  const provider = await env.DB.prepare("SELECT id FROM providers WHERE id = ? AND deleted_at IS NULL").bind(providerId).first();
  if (!provider) throw new ApiError(404, "PROVIDER_NOT_FOUND", "Provider not found.");
  const alias = requiredSlug(body, "alias");
  const existing = await env.DB.prepare("SELECT id FROM models WHERE alias = ?").bind(alias).first();
  if (existing) throw new ApiError(409, "MODEL_ALIAS_EXISTS", "A model with this internal alias already exists. Edit the existing model or choose a new alias.");
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO models(id, provider_id, name, alias, provider_model_id, request_type, status, fixed_cost_cents, input_cost_microunits, output_cost_microunits, billing_unit, unit_cost_microunits, price_version, pricing_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, providerId, requiredString(body, "name"), alias, requiredString(body, "provider_model_id"), optionalString(body, "request_type") ?? "chat", nonNegativeInt(body, "fixed_cost_cents", 0), nonNegativeInt(body, "input_cost_microunits", 0), nonNegativeInt(body, "output_cost_microunits", 0), optionalEnum(body, "billing_unit", ["token", "request", "image", "second", "minute", "audio_minute"], "token"), nonNegativeInt(body, "unit_cost_microunits", 0), optionalString(body, "price_version") ?? "v1", optionalString(body, "pricing_note") ?? "", now(), now()).run();
  await audit(env, request, actor, "model.create", "model", id, null, JSON.stringify({ provider_id: providerId }));
  return json({ model: { id } }, 201);
}

async function updateModel(request: Request, env: Env, actor: string, modelId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const previous = await env.DB.prepare("SELECT name, provider_model_id, request_type, status, fixed_cost_cents, input_cost_microunits, output_cost_microunits, billing_unit, unit_cost_microunits, price_version, pricing_note FROM models WHERE id = ?").bind(modelId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "MODEL_NOT_FOUND", "Model not found.");
  await env.DB.prepare(`UPDATE models SET name = ?, provider_model_id = ?, request_type = ?, status = ?, fixed_cost_cents = ?, input_cost_microunits = ?, output_cost_microunits = ?, billing_unit = ?, unit_cost_microunits = ?, price_version = ?, pricing_note = ?, updated_at = ? WHERE id = ?`)
    .bind(optionalString(body, "name") ?? String(previous.name), optionalString(body, "provider_model_id") ?? String(previous.provider_model_id), optionalString(body, "request_type") ?? String(previous.request_type), optionalEnum(body, "status", ["active", "disabled"], String(previous.status) as "active" | "disabled"), nonNegativeInt(body, "fixed_cost_cents", Number(previous.fixed_cost_cents)), nonNegativeInt(body, "input_cost_microunits", Number(previous.input_cost_microunits)), nonNegativeInt(body, "output_cost_microunits", Number(previous.output_cost_microunits)), optionalEnum(body, "billing_unit", ["token", "request", "image", "second", "minute", "audio_minute"], String(previous.billing_unit) as "token" | "request" | "image" | "second" | "minute" | "audio_minute"), nonNegativeInt(body, "unit_cost_microunits", Number(previous.unit_cost_microunits)), optionalString(body, "price_version") ?? String(previous.price_version), optionalString(body, "pricing_note") ?? String(previous.pricing_note), now(), modelId).run();
  await audit(env, request, actor, "model.update", "model", modelId, JSON.stringify(previous), JSON.stringify({ fields: Object.keys(body) }));
  return json({ updated: true });
}

async function listModelEntries(env: Env): Promise<Response> {
  const entries = await env.DB.prepare(
    `SELECT e.id, e.name, e.slug, e.request_type, e.scope, e.status, e.created_at, e.updated_at,
      (SELECT COUNT(*) FROM model_entry_projects ep WHERE ep.entry_id = e.id) AS project_count
     FROM model_entries e ORDER BY e.created_at DESC`,
  ).all<Record<string, unknown>>();
  const routes = await env.DB.prepare(
    `SELECT er.entry_id, er.model_id, er.priority, m.name, m.alias, m.provider_model_id, p.name AS provider_name
     FROM model_entry_routes er JOIN models m ON m.id = er.model_id JOIN providers p ON p.id = m.provider_id
     ORDER BY er.entry_id, er.priority`,
  ).all<Record<string, unknown>>();
  const projects = await env.DB.prepare("SELECT id, name FROM projects WHERE status = 'active' ORDER BY name").all<Record<string, unknown>>();
  const assignments = await env.DB.prepare("SELECT entry_id, project_id FROM model_entry_projects").all<Record<string, unknown>>();
  return json({ entries: entries.results.map((entry) => ({
    ...entry,
    routes: routes.results.filter((route) => route.entry_id === entry.id),
    project_ids: assignments.results.filter((assignment) => assignment.entry_id === entry.id).map((assignment) => assignment.project_id),
  })), projects: projects.results });
}

async function createModelEntry(request: Request, env: Env, actor: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const id = crypto.randomUUID();
  const timestamp = now();
  const entry = modelEntryPayload(body);
  await ensureEntryModels(env, entry.modelIds, entry.requestType);
  await ensureEntryProjects(env, entry.scope, entry.projectIds);
  const existing = await env.DB.prepare("SELECT id FROM model_entries WHERE slug = ?").bind(entry.slug).first();
  if (existing) throw new ApiError(409, "MODEL_ENTRY_SLUG_EXISTS", "A model entry with this API name already exists.");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO model_entries(id, name, slug, request_type, scope, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)").bind(id, entry.name, entry.slug, entry.requestType, entry.scope, timestamp, timestamp),
    ...entry.modelIds.map((modelId, priority) => env.DB.prepare("INSERT INTO model_entry_routes(entry_id, model_id, priority) VALUES (?, ?, ?)").bind(id, modelId, priority)),
    ...entry.projectIds.map((projectId) => env.DB.prepare("INSERT INTO model_entry_projects(entry_id, project_id) VALUES (?, ?)").bind(id, projectId)),
  ]);
  await audit(env, request, actor, "model_entry.create", "model_entry", id, null, JSON.stringify({ name: entry.name, slug: entry.slug, scope: entry.scope }));
  return json({ entry: { id } }, 201);
}

async function updateModelEntry(request: Request, env: Env, actor: string, entryId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const previous = await env.DB.prepare("SELECT name, slug, request_type, scope, status FROM model_entries WHERE id = ?").bind(entryId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "MODEL_ENTRY_NOT_FOUND", "The model entry does not exist.");
  const entry = modelEntryPayload(body, previous);
  await ensureEntryModels(env, entry.modelIds, entry.requestType);
  await ensureEntryProjects(env, entry.scope, entry.projectIds);
  const conflict = await env.DB.prepare("SELECT id FROM model_entries WHERE slug = ? AND id <> ?").bind(entry.slug, entryId).first();
  if (conflict) throw new ApiError(409, "MODEL_ENTRY_SLUG_EXISTS", "A model entry with this API name already exists.");
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE model_entries SET name = ?, slug = ?, request_type = ?, scope = ?, status = ?, updated_at = ? WHERE id = ?").bind(entry.name, entry.slug, entry.requestType, entry.scope, entry.status, timestamp, entryId),
    env.DB.prepare("DELETE FROM model_entry_routes WHERE entry_id = ?").bind(entryId),
    env.DB.prepare("DELETE FROM model_entry_projects WHERE entry_id = ?").bind(entryId),
    ...entry.modelIds.map((modelId, priority) => env.DB.prepare("INSERT INTO model_entry_routes(entry_id, model_id, priority) VALUES (?, ?, ?)").bind(entryId, modelId, priority)),
    ...entry.projectIds.map((projectId) => env.DB.prepare("INSERT INTO model_entry_projects(entry_id, project_id) VALUES (?, ?)").bind(entryId, projectId)),
  ]);
  await audit(env, request, actor, "model_entry.update", "model_entry", entryId, JSON.stringify(previous), JSON.stringify({ name: entry.name, slug: entry.slug, scope: entry.scope }));
  return json({ updated: true });
}

async function deleteModelEntry(request: Request, env: Env, actor: string, entryId: string): Promise<Response> {
  const previous = await env.DB.prepare("SELECT name, slug FROM model_entries WHERE id = ?").bind(entryId).first<Record<string, unknown>>();
  if (!previous) throw new ApiError(404, "MODEL_ENTRY_NOT_FOUND", "The model entry does not exist.");
  await env.DB.prepare("DELETE FROM model_entries WHERE id = ?").bind(entryId).run();
  await audit(env, request, actor, "model_entry.delete", "model_entry", entryId, JSON.stringify(previous), null);
  return json({ deleted: true });
}

function modelEntryPayload(body: Record<string, unknown>, previous: Record<string, unknown> = {}): { name: string; slug: string; requestType: string; scope: "all" | "selected"; status: "active" | "disabled"; modelIds: string[]; projectIds: string[] } {
  const name = optionalString(body, "name") ?? String(previous.name ?? "");
  const slug = optionalString(body, "slug") ?? String(previous.slug ?? "");
  if (!name) throw new ApiError(400, "NAME_REQUIRED", "name is required.");
  if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(slug)) throw new ApiError(400, "INVALID_MODEL_ENTRY_SLUG", "Model entry API names may contain lowercase letters, numbers, dots, colons, underscores, and hyphens.");
  const modelIds = Array.isArray(body.model_ids) && body.model_ids.every((item) => typeof item === "string") ? [...new Set(body.model_ids as string[])] : [];
  if (!modelIds.length) throw new ApiError(400, "MODEL_ENTRY_MODEL_REQUIRED", "Select a primary model.");
  const scope = optionalEnum(body, "scope", ["all", "selected"] as const, String(previous.scope ?? "all") as "all" | "selected");
  const projectIds = Array.isArray(body.project_ids) && body.project_ids.every((item) => typeof item === "string") ? [...new Set(body.project_ids as string[])] : [];
  return { name, slug, requestType: optionalString(body, "request_type") ?? String(previous.request_type ?? "chat"), scope, status: optionalEnum(body, "status", ["active", "disabled"] as const, String(previous.status ?? "active") as "active" | "disabled"), modelIds, projectIds: scope === "selected" ? projectIds : [] };
}

async function ensureEntryModels(env: Env, modelIds: string[], requestType: string): Promise<void> {
  const rows = await Promise.all(modelIds.map((id) => env.DB.prepare("SELECT id FROM models WHERE id = ? AND status = 'active' AND request_type = ?").bind(id, requestType).first()));
  if (rows.some((row) => !row)) throw new ApiError(400, "INVALID_MODEL_ENTRY_MODEL", "One or more selected models are inactive or missing.");
}

async function ensureEntryProjects(env: Env, scope: "all" | "selected", projectIds: string[]): Promise<void> {
  if (scope === "selected" && !projectIds.length) throw new ApiError(400, "MODEL_ENTRY_PROJECT_REQUIRED", "Select at least one project for a selected-project entry.");
  const rows = await Promise.all(projectIds.map((id) => env.DB.prepare("SELECT id FROM projects WHERE id = ? AND status = 'active'").bind(id).first()));
  if (rows.some((row) => !row)) throw new ApiError(400, "INVALID_MODEL_ENTRY_PROJECT", "One or more selected projects are inactive or missing.");
}

async function listRequests(env: Env, url: URL, allowedProjectIds: string[] | null = null): Promise<Response> {
  const { page, pageSize, offset } = paginationParams(url);
  const projectId = url.searchParams.get("project_id");
  const status = url.searchParams.get("status");
  const requestId = url.searchParams.get("request_id");
  const virtualKeyId = url.searchParams.get("virtual_key_id");
  const conditions: string[] = [];
  const sourceIp = url.searchParams.get("source_ip");
  const providerId = url.searchParams.get("provider_id");
  const modelId = url.searchParams.get("model_id");
  const httpStatus = url.searchParams.get("http_status");
  const errorCode = url.searchParams.get("error_code");
  const minCost = positiveQueryInt(url, "min_cost_cents");
  const maxCost = positiveQueryInt(url, "max_cost_cents");
  const startedAfter = validDateQuery(url, "started_after");
  const startedBefore = validDateQuery(url, "started_before");
  const values: string[] = [];
  if (allowedProjectIds) {
    conditions.push(`r.project_id IN (${allowedProjectIds.map(() => "?").join(",")})`);
    values.push(...allowedProjectIds);
  }
  if (requestId) { conditions.push("r.id LIKE ?"); values.push(`${requestId}%`); }
  if (projectId) { conditions.push("r.project_id = ?"); values.push(projectId); }
  if (virtualKeyId) { conditions.push("r.virtual_key_id = ?"); values.push(virtualKeyId); }
  if (status) { conditions.push("r.status = ?"); values.push(status); }
  if (sourceIp) { conditions.push("r.source_ip LIKE ?"); values.push(`%${sourceIp}%`); }
  if (providerId) { conditions.push("r.provider_id = ?"); values.push(providerId); }
  if (modelId) { conditions.push("r.model_id = ?"); values.push(modelId); }
  if (httpStatus) { conditions.push("r.http_status = ?"); values.push(httpStatus); }
  if (errorCode) { conditions.push("r.error_code = ?"); values.push(errorCode); }
  if (minCost !== null) { conditions.push("r.estimated_cost_cents >= ?"); values.push(String(minCost)); }
  if (maxCost !== null) { conditions.push("r.estimated_cost_cents <= ?"); values.push(String(maxCost)); }
  if (startedAfter) { conditions.push("r.started_at >= ?"); values.push(startedAfter); }
  if (startedBefore) { conditions.push("r.started_at <= ?"); values.push(startedBefore); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [result, count] = await Promise.all([
    env.DB.prepare(`SELECT r.id, r.endpoint, r.status, r.http_status, r.source_ip, r.started_at, r.duration_ms, r.estimated_cost_cents, r.error_code, r.error_message, p.name AS project_name, m.alias AS model_alias, pr.name AS provider_name FROM requests r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN models m ON m.id = r.model_id LEFT JOIN providers pr ON pr.id = r.provider_id ${where} ORDER BY r.started_at DESC LIMIT ? OFFSET ?`).bind(...values, pageSize, offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM requests r ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  return json({ requests: result.results, pagination: paginationMeta(page, pageSize, Number(count?.total ?? 0)) });
}

async function requestDetail(env: Env, request: Request, actor: string, requestId: string): Promise<Response> {
  const [row, attempts] = await Promise.all([
    env.DB.prepare(`SELECT r.*, p.name AS project_name, vk.name AS virtual_key_name, vk.key_prefix, vk.key_last4,
    m.name AS model_name, m.alias AS model_alias, pr.name AS provider_name, pc.name AS credential_name, pc.secret_last4 AS credential_last4
    FROM requests r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN virtual_keys vk ON vk.id = r.virtual_key_id
    LEFT JOIN models m ON m.id = r.model_id LEFT JOIN providers pr ON pr.id = r.provider_id
    LEFT JOIN provider_credentials pc ON pc.id = r.provider_credential_id WHERE r.id = ?`).bind(requestId).first(),
    env.DB.prepare(`SELECT ra.id, ra.attempt_number, ra.status, ra.http_status, ra.duration_ms, ra.error_code, ra.error_message,
      ra.started_at, ra.completed_at, m.name AS model_name, m.alias AS model_alias, p.name AS provider_name,
      pc.name AS credential_name, pc.secret_last4 AS credential_last4
      FROM request_attempts ra LEFT JOIN models m ON m.id = ra.model_id
      LEFT JOIN providers p ON p.id = ra.provider_id
      LEFT JOIN provider_credentials pc ON pc.id = ra.provider_credential_id
      WHERE ra.request_id = ? ORDER BY ra.attempt_number`).bind(requestId).all(),
  ]);
  if (!row) throw new ApiError(404, "REQUEST_NOT_FOUND", "Request not found.");
  const hasSensitiveContent = Boolean(row.request_metadata && !String(row.request_metadata).includes('"parameter_keys"')) || Boolean(row.response_metadata);
  await audit(env, request, actor, hasSensitiveContent ? "request.view_sensitive" : "request.view", "request", requestId, null, JSON.stringify({ sensitive_content: hasSensitiveContent }));
  return json({ request: row, attempts: attempts.results });
}

async function exportRequests(env: Env, actor: string, request: Request, url: URL, allowedProjectIds: string[] | null = null): Promise<Response> {
  const projectId = url.searchParams.get("project_id");
  const status = url.searchParams.get("status");
  const conditions: string[] = [];
  const values: string[] = [];
  if (allowedProjectIds) {
    conditions.push(`r.project_id IN (${allowedProjectIds.map(() => "?").join(",")})`);
    values.push(...allowedProjectIds);
  }
  if (projectId) { conditions.push("r.project_id = ?"); values.push(projectId); }
  if (status) { conditions.push("r.status = ?"); values.push(status); }
  const requestId = url.searchParams.get("request_id");
  const sourceIp = url.searchParams.get("source_ip");
  const providerId = url.searchParams.get("provider_id");
  const modelId = url.searchParams.get("model_id");
  if (requestId) { conditions.push("r.id LIKE ?"); values.push(`${requestId}%`); }
  if (sourceIp) { conditions.push("r.source_ip LIKE ?"); values.push(`%${sourceIp}%`); }
  if (providerId) { conditions.push("r.provider_id = ?"); values.push(providerId); }
  if (modelId) { conditions.push("r.model_id = ?"); values.push(modelId); }
  const result = await env.DB.prepare(`SELECT r.id AS request_id, p.name AS project, m.alias AS model, pr.name AS provider, r.endpoint, r.status,
    r.http_status, r.source_ip, r.source_country, r.started_at, r.completed_at, r.duration_ms, r.estimated_cost_cents, r.error_code
    FROM requests r LEFT JOIN projects p ON p.id = r.project_id LEFT JOIN models m ON m.id = r.model_id
    LEFT JOIN providers pr ON pr.id = r.provider_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY r.started_at DESC LIMIT 10_000`).bind(...values).all<Record<string, unknown>>();
  const header = ["request_id", "project", "model", "provider", "endpoint", "status", "http_status", "source_ip", "source_country", "started_at", "completed_at", "duration_ms", "estimated_cost_cents", "error_code"];
  const csv = [header, ...result.results.map((row) => header.map((field) => csvCell(row[field])))].map((line) => line.join(",")).join("\r\n");
  await audit(env, request, actor, "request.export", "request", "filtered", null, JSON.stringify({ count: result.results.length, project_id: projectId, status }));
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="openpass-requests-${now().slice(0, 10)}.csv"` } });
}

async function listJobs(env: Env, url: URL, allowedProjectIds: string[] | null = null): Promise<Response> {
  const { page, pageSize, offset } = paginationParams(url);
  const projectId = url.searchParams.get("project_id");
  const status = url.searchParams.get("status");
  const conditions: string[] = [];
  const values: string[] = [];
  if (allowedProjectIds) {
    conditions.push(`j.project_id IN (${allowedProjectIds.map(() => "?").join(",")})`);
    values.push(...allowedProjectIds);
  }
  if (projectId) { conditions.push("j.project_id = ?"); values.push(projectId); }
  if (status) { conditions.push("j.status = ?"); values.push(status); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [result, count] = await Promise.all([
    env.DB.prepare(`SELECT j.id, j.type, j.status, j.provider_job_id, j.created_at, j.updated_at,
      p.name AS project_name, m.alias AS model_alias FROM jobs j
      LEFT JOIN projects p ON p.id = j.project_id LEFT JOIN models m ON m.id = j.model_id
      ${where} ORDER BY j.updated_at DESC LIMIT ? OFFSET ?`).bind(...values, pageSize, offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM jobs j ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  return json({ jobs: result.results, pagination: paginationMeta(page, pageSize, Number(count?.total ?? 0)) });
}

async function listAlerts(env: Env, url: URL, allowedProjectIds: string[] | null = null): Promise<Response> {
  const { page, pageSize, offset } = paginationParams(url);
  const status = url.searchParams.get("status");
  const severity = url.searchParams.get("severity");
  const projectId = url.searchParams.get("project_id");
  const query = url.searchParams.get("query")?.trim().toLowerCase();
  const conditions: string[] = [];
  const values: string[] = [];
  if (allowedProjectIds) {
    if (!allowedProjectIds.length) {
      return json({ alerts: [], summary: { total: 0, open: 0, acknowledged: 0, resolved: 0, critical: 0, warning: 0 }, pagination: paginationMeta(page, pageSize, 0) });
    }
    conditions.push(`a.project_id IN (${allowedProjectIds.map(() => "?").join(",")})`);
    values.push(...allowedProjectIds);
  }
  if (status && ["open", "acknowledged", "resolved"].includes(status)) {
    conditions.push("a.status = ?");
    values.push(status);
  }
  if (severity && ["info", "warning", "critical"].includes(severity)) {
    conditions.push("a.severity = ?");
    values.push(severity);
  }
  if (projectId) {
    conditions.push("a.project_id = ?");
    values.push(projectId);
  }
  if (query) {
    conditions.push("LOWER(a.type || ' ' || a.message || ' ' || COALESCE(p.name, '')) LIKE ?");
    values.push(`%${query}%`);
  }
  const scopeConditions: string[] = [];
  const scopeValues: string[] = [];
  if (allowedProjectIds) {
    scopeConditions.push(`project_id IN (${allowedProjectIds.map(() => "?").join(",")})`);
    scopeValues.push(...allowedProjectIds);
  }
  const summaryRows = await env.DB.prepare(
    `SELECT status, severity, COUNT(*) AS count FROM alerts ${scopeConditions.length ? `WHERE ${scopeConditions.join(" AND ")}` : ""} GROUP BY status, severity`,
  ).bind(...scopeValues).all<{ status: string; severity: string; count: number }>();
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [result, count] = await Promise.all([
    env.DB.prepare(`SELECT a.*, p.name AS project_name FROM alerts a LEFT JOIN projects p ON p.id = a.project_id ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).bind(...values, pageSize, offset).all(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM alerts a LEFT JOIN projects p ON p.id = a.project_id ${where}`).bind(...values).first<{ total: number }>(),
  ]);
  const summary = { total: 0, open: 0, acknowledged: 0, resolved: 0, critical: 0, warning: 0 };
  for (const row of summaryRows.results) {
    const count = Number(row.count || 0);
    summary.total += count;
    if (row.status === "open" || row.status === "acknowledged" || row.status === "resolved") summary[row.status] += count;
    if (row.severity === "critical" || row.severity === "warning") summary[row.severity] += count;
  }
  return json({ alerts: result.results, summary, pagination: paginationMeta(page, pageSize, Number(count?.total ?? 0)) });
}

async function setAlertStatus(request: Request, env: Env, actor: string, alertId: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const status = optionalEnum(body, "status", ["open", "acknowledged", "resolved"], "acknowledged");
  const previous = await env.DB.prepare("SELECT status FROM alerts WHERE id = ?").bind(alertId).first();
  if (!previous) throw new ApiError(404, "ALERT_NOT_FOUND", "Alert not found.");
  await env.DB.prepare("UPDATE alerts SET status = ?, resolved_at = ? WHERE id = ?").bind(status, status === "resolved" ? now() : null, alertId).run();
  await audit(env, request, actor, "alert.status", "alert", alertId, JSON.stringify(previous), JSON.stringify({ status }));
  return json({ status });
}

const settingsSchema = {
  default_log_policy: ["metadata", "request", "full"],
  default_ip_logging: ["masked", "full", "none"],
  default_timeout_ms: "positive_integer",
  default_retry_count: "nonnegative_integer",
  request_metadata_retention_days: "positive_integer",
  raw_ip_retention_days: "positive_integer",
  alert_threshold_warning: "percentage",
  alert_threshold_critical: "percentage",
  virtual_key_rotation_grace_minutes: "positive_integer",
  quota_failure_policy: ["deny", "allow"],
  error_rate_alert_percent: "percentage",
  error_rate_min_requests: "positive_integer",
  request_spike_multiplier: "positive_integer",
  ip_request_alert_threshold: "positive_integer",
  custom_redaction_fields: "text",
  credential_health_check_enabled: ["true", "false"],
} as const;

async function listSettings(env: Env): Promise<Response> {
  const rows = await env.DB.prepare("SELECT setting_key, setting_value, updated_at FROM system_settings ORDER BY setting_key").all<{ setting_key: string; setting_value: string; updated_at: string }>();
  return json({ settings: Object.fromEntries(rows.results.map((row) => [row.setting_key, row.setting_value])), updated_at: Object.fromEntries(rows.results.map((row) => [row.setting_key, row.updated_at])) });
}

async function updateSettings(request: Request, env: Env, actor: string): Promise<Response> {
  const body = await readJsonBody(request, maxAdminBody);
  const changes = Object.entries(body).filter(([key]) => Object.prototype.hasOwnProperty.call(settingsSchema, key));
  if (!changes.length) throw new ApiError(400, "INVALID_REQUEST", "No supported settings were provided.");
  const timestamp = now();
  const statements = changes.map(([key, value]) => {
    const rule = settingsSchema[key as keyof typeof settingsSchema];
    const text = String(value);
    const valid = Array.isArray(rule) ? rule.includes(text)
      : rule === "positive_integer" ? /^[1-9]\d*$/.test(text)
      : rule === "nonnegative_integer" ? /^\d+$/.test(text)
      : rule === "text" ? text.length <= 2_000 && text.split(/[\n,]/).every((field) => !field.trim() || /^[A-Za-z0-9_.-]{1,64}$/.test(field.trim()))
      : /^([1-9]\d?|100)$/.test(text);
    if (!valid) throw new ApiError(400, "INVALID_REQUEST", `Invalid value for ${key}.`);
    return env.DB.prepare("INSERT INTO system_settings(setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at").bind(key, text, timestamp);
  });
  await env.DB.batch(statements);
  await audit(env, request, actor, "settings.update", "system_settings", "global", null, JSON.stringify(Object.fromEntries(changes)));
  return listSettings(env);
}

async function listAuditLogs(env: Env, url: URL): Promise<Response> {
  const { page, pageSize, offset } = paginationParams(url);
  const [result, count] = await Promise.all([
    env.DB.prepare(`SELECT a.id, a.actor_email, a.action, a.object_type, a.object_id, a.source_ip, a.result, a.created_at,
      CASE a.object_type
        WHEN 'project' THEN (SELECT name FROM projects WHERE id = a.object_id)
        WHEN 'virtual_key' THEN (SELECT name FROM virtual_keys WHERE id = a.object_id)
        WHEN 'provider' THEN (SELECT name FROM providers WHERE id = a.object_id)
        WHEN 'provider_credential' THEN (SELECT name FROM provider_credentials WHERE id = a.object_id)
        WHEN 'model' THEN (SELECT name FROM models WHERE id = a.object_id)
        WHEN 'project_ip_rule' THEN (SELECT value FROM project_ip_rules WHERE id = a.object_id)
        WHEN 'project_admin' THEN (SELECT email FROM project_admins WHERE id = a.object_id)
        WHEN 'project_webhook' THEN (SELECT name FROM project_webhooks WHERE id = a.object_id)
        WHEN 'alert' THEN (SELECT message FROM alerts WHERE id = a.object_id)
        WHEN 'request' THEN (SELECT endpoint FROM requests WHERE id = a.object_id)
        WHEN 'system_settings' THEN '全局系统设置'
        ELSE NULL
      END AS object_name
      FROM audit_logs a ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).bind(pageSize, offset).all(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM audit_logs").first<{ total: number }>(),
  ]);
  const total = Number(count?.total ?? 0);
  return json({ audit_logs: result.results, pagination: paginationMeta(page, pageSize, total) });
}

function paginationParams(url: URL): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("page_size") ?? "10", 10) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
function paginationMeta(page: number, pageSize: number, total: number): { page: number; page_size: number; total: number; total_pages: number } {
  return { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) };
}

function segment(path: string, index: number): string { return path.split("/")[index] ?? ""; }
function requiredString(body: Record<string, unknown>, field: string): string { const value = optionalString(body, field); if (!value) throw new ApiError(400, "INVALID_REQUEST", `${field} is required.`); return value; }
function optionalString(body: Record<string, unknown>, field: string): string | null { const value = body[field]; return typeof value === "string" && value.trim() ? value.trim() : null; }
function requiredSlug(body: Record<string, unknown>, field: string): string { const value = requiredString(body, field); if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(value)) throw new ApiError(400, "INVALID_REQUEST", `${field} must contain lowercase letters, digits, hyphens, or underscores.`); return value; }
function requiredUrl(body: Record<string, unknown>, field: string): string { const value = requiredString(body, field); try { const url = new URL(value); if (url.protocol !== "https:") throw new Error(); return value.replace(/\/$/, ""); } catch { throw new ApiError(400, "INVALID_REQUEST", `${field} must be an HTTPS URL.`); } }
function positiveInt(source: Record<string, unknown>, field: string, fallback: number): number { const value = source[field]; return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback; }
function nonNegativeInt(source: Record<string, unknown>, field: string, fallback: number): number { const value = source[field]; return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback; }
function booleanInt(source: Record<string, unknown>, field: string, fallback: number): number {
  const value = source[field];
  if (value === true || value === 1 || value === "1" || value === "true" || value === "on") return 1;
  if (value === false || value === 0 || value === "0" || value === "false" || value === "") return 0;
  return fallback ? 1 : 0;
}
function boundedPositiveInt(source: Record<string, unknown>, field: string, fallback: number, maximum: number): number {
  const value = source[field];
  if (value === undefined || value === null || value === "") return Number.isInteger(fallback) && fallback > 0 && fallback <= maximum ? fallback : 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw new ApiError(400, "INVALID_REQUEST", `${field} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}
function nullablePositiveInt(source: Record<string, unknown>, field: string): number | null { const value = source[field]; return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null; }
function nullablePositiveIntOrCurrent(source: Record<string, unknown>, field: string, current: unknown): number | null { return Object.prototype.hasOwnProperty.call(source, field) ? nullablePositiveInt(source, field) : (typeof current === "number" ? current : null); }
function emptyUsage(): Record<string, number> { return { request_count: 0, success_count: 0, failure_count: 0, estimated_cost_cents: 0 }; }
function csvCell(value: unknown): string { const text = String(value ?? ""); return `"${text.replace(/"/g, '""')}"`; }
function positiveQueryInt(url: URL, key: string): number | null { const raw = url.searchParams.get(key); if (raw === null || raw === "") return null; const value = Number(raw); return Number.isInteger(value) && value >= 0 ? value : null; }
function validDateQuery(url: URL, key: string): string | null { const value = url.searchParams.get(key); return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null; }
async function settingValue(env: Env, key: string, fallback: string): Promise<string> { const row = await env.DB.prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?").bind(key).first<{ setting_value: string }>(); return row?.setting_value ?? fallback; }
function optionalEnum<T extends string>(source: Record<string, unknown>, field: string, allowed: readonly T[], fallback: T): T { const value = source[field]; return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback; }

async function projectIntegrationInfo(request: Request, env: Env, projectId: string): Promise<{
  base_url: string;
  url: string;
  endpoint: string;
  model: string;
  request_type: string;
  prompt: string;
} | null> {
  const model = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(pm.project_alias, ''), m.alias) AS public_model, m.request_type
     FROM project_models pm
     JOIN models m ON m.id = pm.model_id
     JOIN providers p ON p.id = m.provider_id
     WHERE pm.project_id = ? AND pm.status = 'active' AND m.status = 'active'
       AND p.status = 'active' AND p.deleted_at IS NULL
     ORDER BY pm.is_default DESC, pm.fallback_priority ASC, m.alias ASC
     LIMIT 1`,
  ).bind(projectId).first<{ public_model: string; request_type: string }>();
  if (!model) return null;
  const endpoint = integrationEndpoint(model.request_type);
  const origin = integrationOrigin(request, env);
  return {
    base_url: `${origin}/v1`,
    url: `${origin}${endpoint}`,
    endpoint,
    model: model.public_model,
    request_type: model.request_type,
    prompt: integrationPrompt(model.request_type),
  };
}

function integrationOrigin(request: Request, env: Env): string {
  const requestUrl = new URL(request.url);
  if (env.ENVIRONMENT !== "development") return requestUrl.origin;
  for (const candidate of [request.headers.get("origin"), request.headers.get("referer")]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
    } catch { /* Ignore malformed browser metadata and use a safe fallback. */ }
  }
  return requestUrl.origin;
}

function integrationEndpoint(requestType: string): string {
  if (requestType === "image") return "/v1/images/generations";
  if (requestType === "embedding") return "/v1/embeddings";
  if (requestType === "chat") return "/v1/chat/completions";
  return "/v1/responses";
}

function integrationPrompt(requestType: string): string {
  if (requestType === "image") return "A cinematic landscape at golden hour.";
  if (requestType === "video") return "A cinematic product reveal with smooth camera movement.";
  if (requestType === "embedding") return "Text to embed for semantic search.";
  return "Hello! Please introduce yourself briefly.";
}

type ProjectModelRouting = {
  defaultModelId: string;
  aliases: Record<string, string>;
  priorities: Record<string, number>;
  limits: Record<string, { daily_cost_limit_cents: number | null; monthly_cost_limit_cents: number | null }>;
};

function projectModelRouting(
  source: Record<string, unknown>,
  modelIds: string[],
  existing: {
    defaultModelId: string | null;
    aliases: Record<string, unknown>;
    fallbackOrder: string[];
    limits: Record<string, { daily_cost_limit_cents: number | null; monthly_cost_limit_cents: number | null }>;
  } = { defaultModelId: null, aliases: {}, fallbackOrder: [], limits: {} },
): ProjectModelRouting {
  if (!modelIds.length) throw new ApiError(400, "MODEL_REQUIRED", "Select at least one active model for the project.");
  const requestedDefault = optionalString(source, "default_model_id");
  const defaultModelId = requestedDefault ?? (existing.defaultModelId && modelIds.includes(existing.defaultModelId) ? existing.defaultModelId : modelIds[0]);
  if (!modelIds.includes(defaultModelId)) throw new ApiError(400, "INVALID_DEFAULT_MODEL", "The default model must be one of the project's allowed models.");

  const aliasSource = source.model_aliases && typeof source.model_aliases === "object" && !Array.isArray(source.model_aliases)
    ? source.model_aliases as Record<string, unknown>
    : existing.aliases;
  const aliases: Record<string, string> = {};
  const seenAliases = new Set<string>();
  for (const modelId of modelIds) {
    const alias = typeof aliasSource[modelId] === "string" ? String(aliasSource[modelId]).trim() : "";
    if (!alias) continue;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(alias)) {
      throw new ApiError(400, "INVALID_MODEL_ALIAS", "Project model aliases may contain letters, numbers, dots, colons, underscores, and hyphens.");
    }
    const normalized = alias.toLowerCase();
    if (seenAliases.has(normalized)) throw new ApiError(409, "PROJECT_MODEL_ALIAS_EXISTS", "Project model aliases must be unique within a project.");
    seenAliases.add(normalized);
    aliases[modelId] = alias;
  }

  const requestedOrder = Array.isArray(source.fallback_order) ? source.fallback_order : existing.fallbackOrder;
  if (!requestedOrder.every((value) => typeof value === "string")) throw new ApiError(400, "INVALID_FALLBACK_ORDER", "fallback_order must be an array of model IDs.");
  const order = [...new Set((requestedOrder as string[]).filter((id) => modelIds.includes(id))), ...modelIds.filter((id) => !(requestedOrder as string[]).includes(id))];
  const priorities = Object.fromEntries(order.map((modelId, index) => [modelId, index]));

  const limitSource = source.model_limits && typeof source.model_limits === "object" && !Array.isArray(source.model_limits)
    ? source.model_limits as Record<string, unknown>
    : {};
  const limits = Object.fromEntries(modelIds.map((modelId) => {
    const configured = limitSource[modelId] && typeof limitSource[modelId] === "object" && !Array.isArray(limitSource[modelId])
      ? limitSource[modelId] as Record<string, unknown>
      : null;
    return [modelId, configured ? {
      daily_cost_limit_cents: nullablePositiveInt(configured, "daily_cost_limit_cents"),
      monthly_cost_limit_cents: nullablePositiveInt(configured, "monthly_cost_limit_cents"),
    } : existing.limits[modelId] ?? { daily_cost_limit_cents: null, monthly_cost_limit_cents: null }];
  }));
  return { defaultModelId, aliases, priorities, limits };
}
