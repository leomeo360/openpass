import { handleAdmin } from "./admin";
import { authMode, handleAdminAuth, oauthSessionUser, passwordSessionUser } from "./auth";
import { ProjectLimiter } from "./durable-objects/project-limiter";
import { handleGateway } from "./gateway";
import { decryptSecret } from "./lib/crypto";
import { ApiError, apiError, json, requestId } from "./lib/http";
import type { Env } from "./types";
import { queueProjectWebhook, retryPendingWebhooks } from "./webhooks";

export { ProjectLimiter };

const worker: ExportedHandler<Env> = {
  async fetch(request, env, ctx): Promise<Response> {
    const id = requestId();
    const url = new URL(request.url);
    try {
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/") {
        return Response.redirect(new URL("/admin/", request.url), 302);
      }
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/health") {
        if (request.method === "HEAD") {
          return new Response(null, { status: 200, headers: { "cache-control": "no-store", "x-request-id": id } });
        }
        return json({ status: "ok", service: "openpass", request_id: id }, 200, { "x-request-id": id });
      }
      if (url.pathname === "/api/auth/callback/google") return await handleAdminAuth(request, env);
      if (url.pathname.startsWith("/admin/auth/")) return await handleAdminAuth(request, env);
      if (url.pathname.startsWith("/admin/api/")) return await handleAdmin(request, env);
      if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/admin") {
        return Response.redirect(new URL("/admin/", request.url), 302);
      }
      if (url.pathname === "/admin/") {
        const mode = authMode(env);
        if (mode === "password" && !await passwordSessionUser(request, env)) {
          return Response.redirect(new URL("/admin/login.html", request.url), 302);
        }
        if (mode === "oauth" && !await oauthSessionUser(request, env)) {
          return Response.redirect(new URL("/admin/login.html", request.url), 302);
        }
        if (mode === "hybrid"
          && !await passwordSessionUser(request, env)
          && !await oauthSessionUser(request, env)) {
          return Response.redirect(new URL("/admin/login.html", request.url), 302);
        }
        const response = await env.ASSETS.fetch(new Request(new URL("/admin/index.html", request.url), request));
        const headers = new Headers(response.headers);
        // The shell selects versioned JS/CSS assets. Keep the shell fresh so a
        // deployment takes effect immediately instead of leaving stale bundles open.
        headers.set("cache-control", "no-store");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
      if (url.pathname.startsWith("/admin/")) return await env.ASSETS.fetch(request);
      if (url.pathname.startsWith("/v1/")) return await handleGateway(request, env, ctx, id);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof ApiError) return apiError(error, id);
      console.error(JSON.stringify({
        event: "unhandled_error",
        request_id: id,
        path: url.pathname,
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }));
      return apiError(new ApiError(500, "INTERNAL_ERROR", "An unexpected gateway error occurred."), id);
    }
  },
  async scheduled(event, env, ctx): Promise<void> {
    ctx.waitUntil(runOperationalAlertChecks(env, ctx));
    ctx.waitUntil(runCredentialHealthChecks(env));
    ctx.waitUntil(retryPendingWebhooks(env));
    const scheduledAt = new Date(event.scheduledTime);
    const dailyCleanupWindow = event.cron === "*/5 * * * *"
      && scheduledAt.getUTCHours() === 3
      && scheduledAt.getUTCMinutes() === 15;
    if (!event.cron || event.cron === "17 3 * * *" || dailyCleanupWindow) ctx.waitUntil(runRetentionCleanup(env));
  },
};

async function runCredentialHealthChecks(env: Env): Promise<void> {
  const enabled = await env.DB.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'credential_health_check_enabled'")
    .first<{ setting_value: string }>();
  if (enabled?.setting_value === "false") return;
  const credentials = await env.DB.prepare(
    `SELECT c.id, c.encrypted_secret, c.health_status, p.name AS provider_name, p.base_url, p.timeout_ms
     FROM provider_credentials c JOIN providers p ON p.id = c.provider_id
     WHERE c.status = 'active' AND c.encrypted_secret <> 'erased' AND p.status = 'active'
       AND p.adapter_type = 'openai-compatible'
       AND (
         c.updated_at <= datetime('now', '-24 hours')
         OR (c.health_status <> 'healthy' AND (c.circuit_open_until IS NULL OR c.circuit_open_until <= ?))
       )
     ORDER BY CASE WHEN c.health_status = 'healthy' THEN 1 ELSE 0 END, c.updated_at ASC
     LIMIT 5`,
  ).bind(new Date().toISOString()).all<{ id: string; encrypted_secret: string; health_status: string; provider_name: string; base_url: string; timeout_ms: number }>();
  for (const credential of credentials.results) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(credential.timeout_ms, 1_000), 30_000));
    let status = 0;
    let health = "unhealthy";
    let message = "Automatic health check failed.";
    try {
      const secret = await decryptSecret(credential.encrypted_secret, env.CREDENTIAL_ENCRYPTION_KEY);
      const response = await fetch(`${credential.base_url.replace(/\/$/, "")}/models`, {
        headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
        signal: controller.signal,
      });
      status = response.status;
      health = response.ok ? "healthy" : response.status === 401 ? "auth_failed" : response.status === 429 ? "rate_limited" : "unhealthy";
      message = response.ok ? "" : `Automatic health check returned HTTP ${response.status}.`;
    } catch (error) {
      message = error instanceof DOMException && error.name === "AbortError" ? "Automatic health check timed out." : "Automatic health check failed.";
    } finally {
      clearTimeout(timeout);
    }
    const timestamp = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE provider_credentials SET health_status = ?, consecutive_failures = CASE WHEN ? = 'healthy' THEN 0 ELSE consecutive_failures + 1 END,
       circuit_open_until = CASE WHEN ? = 'healthy' THEN NULL ELSE datetime('now', '+15 minutes') END,
       last_error = ?, updated_at = ? WHERE id = ?`,
    ).bind(health, health, health, message || null, timestamp, credential.id).run();
    if (health !== "healthy") {
      await env.DB.prepare(
        `INSERT INTO alerts(id, project_id, type, severity, message, status, created_at)
         SELECT ?, NULL, ?, 'warning', ?, 'open', ?
         WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE project_id IS NULL AND type = ? AND status = 'open' AND created_at >= datetime('now', '-1 hour'))`,
      ).bind(crypto.randomUUID(), `credential_health:${credential.id}`, `${credential.provider_name} credential health check failed${status ? ` (HTTP ${status})` : ""}.`, timestamp, `credential_health:${credential.id}`).run();
    }
  }
}

async function runRetentionCleanup(env: Env): Promise<void> {
  const rows = await env.DB.prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('request_metadata_retention_days', 'raw_ip_retention_days')").all<{ setting_key: string; setting_value: string }>();
  const settings = Object.fromEntries(rows.results.map((row) => [row.setting_key, Number(row.setting_value)]));
  const metadataDays = settings.request_metadata_retention_days ?? 180;
  const rawIpDays = settings.raw_ip_retention_days ?? 30;
  if (!Number.isInteger(metadataDays) || metadataDays < 1 || metadataDays > 3_650 || !Number.isInteger(rawIpDays) || rawIpDays < 1 || rawIpDays > 3_650) return;
  await env.DB.batch([
    env.DB.prepare("UPDATE virtual_keys SET status = 'revoked', revoked_at = ?, rotation_expires_at = NULL WHERE status = 'rotating' AND rotation_expires_at IS NOT NULL AND rotation_expires_at <= ?").bind(new Date().toISOString(), new Date().toISOString()),
    env.DB.prepare("UPDATE requests SET source_ip = NULL WHERE source_ip_policy = 'full' AND source_ip IS NOT NULL AND started_at < datetime('now', ?)").bind(`-${rawIpDays} days`),
    env.DB.prepare("DELETE FROM requests WHERE started_at < datetime('now', ?)").bind(`-${metadataDays} days`),
  ]);
}

async function runOperationalAlertChecks(env: Env, ctx: ExecutionContext): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN (
      'error_rate_alert_percent', 'error_rate_min_requests', 'request_spike_multiplier', 'ip_request_alert_threshold'
    )`,
  ).all<{ setting_key: string; setting_value: string }>();
  const settings = Object.fromEntries(rows.results.map((row) => [row.setting_key, Number(row.setting_value)]));
  const errorPercent = boundedSetting(settings.error_rate_alert_percent, 20, 1, 100);
  const minimumRequests = boundedSetting(settings.error_rate_min_requests, 10, 1, 100_000);
  const spikeMultiplier = boundedSetting(settings.request_spike_multiplier, 3, 2, 100);
  const ipThreshold = boundedSetting(settings.ip_request_alert_threshold, 50, 1, 1_000_000);
  const [errorRates, spikes, sources] = await Promise.all([
    env.DB.prepare(
      `SELECT project_id, COUNT(*) AS total,
        SUM(CASE WHEN status IN ('failed', 'rejected') THEN 1 ELSE 0 END) AS failures
       FROM requests WHERE project_id IS NOT NULL AND started_at >= datetime('now', '-15 minutes')
       GROUP BY project_id
       HAVING total >= ? AND failures * 100 >= total * ?`,
    ).bind(minimumRequests, errorPercent).all<{ project_id: string; total: number; failures: number }>(),
    env.DB.prepare(
      `SELECT project_id,
        SUM(CASE WHEN started_at >= datetime('now', '-5 minutes') THEN 1 ELSE 0 END) AS current_count,
        SUM(CASE WHEN started_at < datetime('now', '-5 minutes') THEN 1 ELSE 0 END) AS previous_count
       FROM requests
       WHERE project_id IS NOT NULL AND started_at >= datetime('now', '-10 minutes')
       GROUP BY project_id
       HAVING current_count >= ? AND current_count >= MAX(1, previous_count) * ?`,
    ).bind(Math.max(10, minimumRequests), spikeMultiplier).all<{ project_id: string; current_count: number; previous_count: number }>(),
    env.DB.prepare(
      `SELECT project_id, source_ip, COUNT(*) AS request_count FROM requests
       WHERE project_id IS NOT NULL AND source_ip IS NOT NULL AND started_at >= datetime('now', '-5 minutes')
       GROUP BY project_id, source_ip HAVING request_count >= ?`,
    ).bind(ipThreshold).all<{ project_id: string; source_ip: string; request_count: number }>(),
  ]);
  const timestamp = new Date().toISOString();
  const alerts = [
    ...errorRates.results.map((row) => ({
      projectId: row.project_id,
      type: "project_error_rate_high",
      severity: "critical",
      message: `Project error rate is ${Math.round(row.failures / row.total * 100)}% (${row.failures}/${row.total}) in the last 15 minutes.`,
    })),
    ...spikes.results.map((row) => ({
      projectId: row.project_id,
      type: "project_request_spike",
      severity: "warning",
      message: `Project request volume increased to ${row.current_count} in 5 minutes (previous window: ${row.previous_count}).`,
    })),
    ...sources.results.map((row) => ({
      projectId: row.project_id,
      type: `source_ip_spike:${row.source_ip}`,
      severity: "warning",
      message: `Source IP ${row.source_ip} sent ${row.request_count} requests in the last 5 minutes.`,
    })),
  ];
  if (!alerts.length) return;
  const candidates = alerts.map((alert) => ({ ...alert, id: crypto.randomUUID() }));
  const results = await env.DB.batch(candidates.map((alert) => env.DB.prepare(
    `INSERT INTO alerts(id, project_id, type, severity, message, status, created_at)
     SELECT ?, ?, ?, ?, ?, 'open', ?
     WHERE NOT EXISTS (
       SELECT 1 FROM alerts WHERE project_id = ? AND type = ? AND status = 'open' AND created_at >= datetime('now', '-1 hour')
     )`,
  ).bind(alert.id, alert.projectId, alert.type, alert.severity, alert.message, timestamp, alert.projectId, alert.type)));
  for (let index = 0; index < candidates.length; index += 1) {
    const alert = candidates[index];
    if (results[index].meta.changes > 0) {
      await queueProjectWebhook(env, ctx, alert.projectId, "alert.created", alert.id, {
        alert_id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
      }).catch((error) => {
        console.error(JSON.stringify({ event: "alert_webhook_queue_failed", project_id: alert.projectId, alert_id: alert.id, error: String(error) }));
      });
    }
  }
}

function boundedSetting(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Number.isInteger(value) && value! >= minimum && value! <= maximum ? value! : fallback;
}

export default worker;
