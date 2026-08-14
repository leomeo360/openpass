import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import worker from "../src/index";
import type { Env as AppEnv } from "../src/types";
import { createProjectFixture } from "./helpers";

async function insertRequest(
  id: string,
  startedAt: string,
  sourceIp: string | null,
  sourceIpPolicy: "full" | "masked" | "none",
) {
  await env.DB.prepare(
    `INSERT INTO requests(
       id, endpoint, method, status, source_ip, source_ip_policy, started_at
     ) VALUES (?, '/v1/chat/completions', 'POST', 'succeeded', ?, ?, ?)`,
  )
    .bind(id, sourceIp, sourceIpPolicy, startedAt)
    .run();
}

describe("scheduled retention cleanup", () => {
  it("deletes expired metadata and removes old raw IPs without touching masked IPs", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE system_settings SET setting_value = '30' WHERE setting_key = 'request_metadata_retention_days'",
      ),
      env.DB.prepare(
        "UPDATE system_settings SET setting_value = '10' WHERE setting_key = 'raw_ip_retention_days'",
      ),
    ]);
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    await insertRequest("expired-metadata", daysAgo(31), "198.51.100.1", "full");
    await insertRequest("old-raw-ip", daysAgo(11), "198.51.100.2", "full");
    await insertRequest("masked-ip", daysAgo(11), "198.51.100.0/24", "masked");
    await insertRequest("recent-raw-ip", daysAgo(2), "198.51.100.3", "full");
    const fixture = await createProjectFixture();
    await env.DB.prepare("UPDATE virtual_keys SET status = 'rotating', rotation_expires_at = datetime('now', '-1 minute') WHERE project_id = ?")
      .bind(fixture.id).run();
    await env.DB.batch([
      env.DB.prepare("UPDATE system_settings SET setting_value = '50' WHERE setting_key = 'error_rate_alert_percent'"),
      env.DB.prepare("UPDATE system_settings SET setting_value = '3' WHERE setting_key = 'error_rate_min_requests'"),
      ...[1, 2, 3].map((index) => env.DB.prepare(
        "INSERT INTO requests(id, project_id, endpoint, method, status, started_at, completed_at, http_status, error_code) VALUES (?, ?, '/v1/chat/completions', 'POST', 'failed', ?, ?, 502, 'UPSTREAM_ERROR')",
      ).bind(`alert-failure-${index}`, fixture.id, new Date().toISOString(), new Date().toISOString())),
    ]);

    const context = createExecutionContext();
    await worker.scheduled!(createScheduledController(), env as unknown as AppEnv, context);
    await waitOnExecutionContext(context);

    const rows = await env.DB.prepare(
      "SELECT id, source_ip FROM requests WHERE id IN (?, ?, ?, ?) ORDER BY id",
    )
      .bind("expired-metadata", "old-raw-ip", "masked-ip", "recent-raw-ip")
      .all<{ id: string; source_ip: string | null }>();
    expect(rows.results).toEqual([
      { id: "masked-ip", source_ip: "198.51.100.0/24" },
      { id: "old-raw-ip", source_ip: null },
      { id: "recent-raw-ip", source_ip: "198.51.100.3" },
    ]);
    expect(await env.DB.prepare("SELECT status, rotation_expires_at FROM virtual_keys WHERE project_id = ?")
      .bind(fixture.id).first()).toEqual({ status: "revoked", rotation_expires_at: null });
    expect(await env.DB.prepare("SELECT type, severity FROM alerts WHERE project_id = ? AND type = 'project_error_rate_high'")
      .bind(fixture.id).first()).toEqual({ type: "project_error_rate_high", severity: "critical" });
  });
});
