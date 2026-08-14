import { decryptSecret } from "./lib/crypto";
import type { Env } from "./types";

type WebhookEvent = "request.completed" | "job.completed" | "alert.created";

export async function queueProjectWebhook(
  env: Env,
  ctx: ExecutionContext,
  projectId: string,
  eventType: WebhookEvent,
  eventId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const webhooks = await env.DB.prepare(
    `SELECT id FROM project_webhooks
     WHERE project_id = ? AND status = 'active' AND ',' || event_types || ',' LIKE ?`,
  ).bind(projectId, `%,${eventType},%`).all<{ id: string }>();
  if (!webhooks.results.length) return;
  const timestamp = new Date().toISOString();
  const payload = JSON.stringify({
    id: `evt_${crypto.randomUUID().replaceAll("-", "")}`,
    type: eventType,
    created_at: timestamp,
    project_id: projectId,
    data,
  });
  const deliveries = webhooks.results.map((webhook) => ({
    id: crypto.randomUUID(),
    webhookId: webhook.id,
  }));
  await env.DB.batch(deliveries.map((delivery) => env.DB.prepare(
    `INSERT OR IGNORE INTO webhook_deliveries(id, webhook_id, project_id, event_type, event_id, payload, status, attempt_count, next_attempt_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
  ).bind(delivery.id, delivery.webhookId, projectId, eventType, eventId, payload, timestamp, timestamp, timestamp)));
  for (const delivery of deliveries) ctx.waitUntil(deliverWebhook(env, delivery.id));
}

export async function retryPendingWebhooks(env: Env): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT id FROM webhook_deliveries WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at LIMIT 20",
  ).bind(new Date().toISOString()).all<{ id: string }>();
  await Promise.all(rows.results.map((row) => deliverWebhook(env, row.id)));
}

async function deliverWebhook(env: Env, deliveryId: string): Promise<void> {
  const delivery = await env.DB.prepare(
    `SELECT d.id, d.payload, d.attempt_count, w.url, w.encrypted_secret, w.status AS webhook_status
     FROM webhook_deliveries d JOIN project_webhooks w ON w.id = d.webhook_id
     WHERE d.id = ? AND d.status = 'pending'`,
  ).bind(deliveryId).first<{ id: string; payload: string; attempt_count: number; url: string; encrypted_secret: string; webhook_status: string }>();
  if (!delivery || delivery.webhook_status !== "active") return;
  const timestampSeconds = Math.floor(Date.now() / 1_000).toString();
  const secret = await decryptSecret(delivery.encrypted_secret, env.CREDENTIAL_ENCRYPTION_KEY);
  const signature = await hmacHex(secret, `${timestampSeconds}.${delivery.payload}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  try {
    const response = await fetch(delivery.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "OpenPass-Webhook/1.0",
        "x-openpass-delivery": delivery.id,
        "x-openpass-timestamp": timestampSeconds,
        "x-openpass-signature": `v1=${signature}`,
        // Retain the legacy headers during the rename so existing consumers
        // can migrate without missing deliveries.
        "x-apihub-delivery": delivery.id,
        "x-apihub-timestamp": timestampSeconds,
        "x-apihub-signature": `v1=${signature}`,
      },
      body: delivery.payload,
      signal: controller.signal,
    });
    httpStatus = response.status;
    if (!response.ok) errorMessage = `Webhook endpoint returned HTTP ${response.status}.`;
    await response.body?.cancel();
  } catch (error) {
    errorMessage = error instanceof DOMException && error.name === "AbortError" ? "Webhook delivery timed out." : "Webhook delivery failed.";
  } finally {
    clearTimeout(timeout);
  }
  const attemptCount = delivery.attempt_count + 1;
  const delivered = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
  const terminal = delivered || attemptCount >= 5;
  const delayMinutes = Math.min(60, 2 ** attemptCount);
  await env.DB.prepare(
    `UPDATE webhook_deliveries SET status = ?, attempt_count = ?, next_attempt_at = ?,
     http_status = ?, last_error = ?, updated_at = ? WHERE id = ?`,
  ).bind(
    delivered ? "delivered" : terminal ? "failed" : "pending",
    attemptCount,
    delivered || terminal ? null : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    httpStatus,
    errorMessage,
    new Date().toISOString(),
    delivery.id,
  ).run();
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
