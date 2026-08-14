import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { callWorker, createProjectFixture, firstActiveModel, jsonRequest } from "./helpers";

describe("admin access and standard responses", () => {
  it("serves the built-in API guide from the lower navigation", async () => {
    const page = await callWorker("/admin/");
    expect(page.response.status).toBe(200);
    const html = await page.response.text();
    expect(html).toContain('href="#docs"');
    expect(html).toContain('data-view="docs"');

    const script = await callWorker("/admin/app.js");
    expect(script.response.status).toBe(200);
    const source = await script.response.text();
    expect(source).toContain("async function docs()");
    expect(source).toContain("/v1/chat/completions");
    expect(source).toContain("/v1/images/generations");
    expect(source).toContain("/v1/videos/generations");
  });

  it("serves health and rejects an unauthorised administrator with a request id", async () => {
    const health = await jsonRequest<{ status: string; request_id: string }>("/health", "GET", undefined, { admin: false });
    expect(health.response.status).toBe(200);
    expect(health.data.status).toBe("ok");
    expect(health.response.headers.get("x-request-id")).toBe(health.data.request_id);

    const denied = await jsonRequest<{ error: { code: string; request_id: string } }>("/admin/api/projects", "GET", undefined, { admin: false });
    expect(denied.response.status).toBe(403);
    expect(denied.data.error.code).toBe("ADMIN_FORBIDDEN");
    expect(denied.response.headers.get("x-request-id")).toBe(denied.data.error.request_id);
  });

  it("supports HEAD checks on public redirect and health endpoints", async () => {
    const root = await callWorker("/", { method: "HEAD", admin: false });
    expect(root.response.status).toBe(302);
    expect(root.response.headers.get("location")).toBe("https://openpass.test/admin/");

    const health = await callWorker("/health", { method: "HEAD", admin: false });
    expect(health.response.status).toBe(200);
    expect(health.response.headers.get("x-request-id")).toBeTruthy();
    expect(await health.response.text()).toBe("");
  });

  it("validates JSON bodies, required fields, slugs and HTTPS URLs", async () => {
    const missingBody = await callWorker("/admin/api/providers", { method: "POST" });
    expect(missingBody.response.status).toBe(400);

    const badJson = await callWorker("/admin/api/providers", { method: "POST", body: "{" });
    expect((await badJson.response.json() as { error: { code: string } }).error.code).toBe("INVALID_REQUEST");

    const badSlug = await jsonRequest<{ error: { code: string } }>("/admin/api/providers", "POST", {
      name: "Bad", slug: "Bad Slug", base_url: "http://example.com",
    });
    expect(badSlug.response.status).toBe(400);
    expect(badSlug.data.error.code).toBe("INVALID_REQUEST");
  });

  it("scopes project administrators and enforces viewer versus manager roles", async () => {
    const assigned = await createProjectFixture({ name: "Assigned Project" });
    const other = await createProjectFixture({ name: "Other Project" });
    const viewerEmail = `viewer-${crypto.randomUUID().slice(0, 6)}@example.test`;
    const managerEmail = `manager-${crypto.randomUUID().slice(0, 6)}@example.test`;
    const viewer = await jsonRequest<{ project_admin: { id: string } }>(
      `/admin/api/projects/${assigned.id}/admins`,
      "POST",
      { email: viewerEmail, role: "viewer" },
    );
    expect(viewer.response.status).toBe(201);
    const manager = await jsonRequest<{ project_admin: { id: string } }>(
      `/admin/api/projects/${assigned.id}/admins`,
      "POST",
      { email: managerEmail, role: "manager" },
    );
    expect(manager.response.status).toBe(201);

    const viewerHeaders = { "cf-access-authenticated-user-email": viewerEmail };
    const session = await jsonRequest<{ role: string; projects: Array<{ project_id: string; role: string }> }>(
      "/admin/api/session",
      "GET",
      undefined,
      { admin: false, headers: viewerHeaders },
    );
    expect(session.data).toMatchObject({
      role: "project",
      projects: [{ project_id: assigned.id, role: "viewer" }],
    });
    const visible = await jsonRequest<{ projects: Array<{ id: string }> }>(
      "/admin/api/projects",
      "GET",
      undefined,
      { admin: false, headers: viewerHeaders },
    );
    expect(visible.data.projects.map((project) => project.id)).toContain(assigned.id);
    expect(visible.data.projects.map((project) => project.id)).not.toContain(other.id);

    const globalResource = await jsonRequest<{ error: { code: string } }>(
      "/admin/api/providers",
      "GET",
      undefined,
      { admin: false, headers: viewerHeaders },
    );
    expect(globalResource.response.status).toBe(403);
    expect(globalResource.data.error.code).toBe("ADMIN_SCOPE_FORBIDDEN");
    const viewerWrite = await jsonRequest<{ error: { code: string } }>(
      `/admin/api/projects/${assigned.id}`,
      "PATCH",
      { name: "Viewer Must Not Change This" },
      { admin: false, headers: viewerHeaders },
    );
    expect(viewerWrite.response.status).toBe(403);
    expect(viewerWrite.data.error.code).toBe("ADMIN_SCOPE_FORBIDDEN");

    const managerWrite = await jsonRequest<{ project: { name: string } }>(
      `/admin/api/projects/${assigned.id}`,
      "PATCH",
      { name: "Manager Updated Project" },
      { admin: false, headers: { "cf-access-authenticated-user-email": managerEmail } },
    );
    expect(managerWrite.response.status).toBe(200);
    expect(managerWrite.data.project.name).toBe("Manager Updated Project");

    const managerDelete = await jsonRequest<{ deleted: boolean }>(
      `/admin/api/projects/${assigned.id}`,
      "DELETE",
      undefined,
      { admin: false, headers: { "cf-access-authenticated-user-email": managerEmail } },
    );
    expect(managerDelete.response.status).toBe(200);
    expect(managerDelete.data.deleted).toBe(true);
  });
});

describe("project and virtual-key lifecycle", () => {
  it("creates a stable model entry without changing existing project model assignments", async () => {
    const fixture = await createProjectFixture({ name: "Model Entry Fixture" });
    const configuredModel = await env.DB.prepare("SELECT request_type FROM models WHERE id = ?").bind(fixture.model.id).first<{ request_type: string }>();
    const slug = `chat-default-${crypto.randomUUID().slice(0, 8)}`;
    const created = await jsonRequest<{ entry: { id: string } }>("/admin/api/model-entries", "POST", {
      name: "Default Chat",
      slug,
      request_type: configuredModel?.request_type,
      scope: "selected",
      model_ids: [fixture.model.id],
      project_ids: [fixture.id],
    });
    expect(created.response.status).toBe(201);

    const listed = await jsonRequest<{ entries: Array<{ id: string; slug: string; project_ids: string[]; routes: Array<{ model_id: string }> }> }>("/admin/api/model-entries");
    const entry = listed.data.entries.find((item) => item.id === created.data.entry.id);
    expect(entry).toMatchObject({ slug, project_ids: [fixture.id] });
    expect(entry?.routes[0]?.model_id).toBe(fixture.model.id);

    const detail = await jsonRequest<{ models: Array<{ id: string }> }>(`/admin/api/projects/${fixture.id}`);
    expect(detail.data.models.map((model) => model.id)).toEqual([fixture.model.id]);

    const entryOnlyForOtherProject = await createProjectFixture({ name: "Unassigned Entry Fixture" });
    const unassignedModels = await jsonRequest<{ object: string; data: Array<{ id: string }> }>("/v1/models", "GET", undefined, { admin: false, headers: { authorization: `Bearer ${entryOnlyForOtherProject.key}` } });
    expect(unassignedModels.data.data.map((model) => model.id)).not.toContain(slug);
  });

  it("requires a model and manages project settings, keys, rotation and status", async () => {
    const noModel = await jsonRequest<{ error: { code: string } }>("/admin/api/projects", "POST", {
      name: "No Model", slug: `no-model-${crypto.randomUUID().slice(0, 6)}`, model_ids: [],
    });
    expect(noModel.response.status).toBe(400);
    expect(noModel.data.error.code).toBe("MODEL_REQUIRED");

    const fixture = await createProjectFixture({
      name: "Image SaaS",
      category: "image_saas",
      limits: { rpm_limit: 17, concurrency_limit: 3, daily_request_limit: 20, monthly_cost_limit_cents: 900 },
    });
    expect(fixture.key).toMatch(/^pk_live_/);

    const storedKey = await env.DB.prepare(
      "SELECT key_hash, key_prefix, key_last4 FROM virtual_keys WHERE project_id = ? ORDER BY created_at LIMIT 1",
    ).bind(fixture.id).first<{ key_hash: string; key_prefix: string; key_last4: string }>();
    expect(storedKey?.key_hash).not.toContain(fixture.key);
    expect(JSON.stringify(storedKey)).not.toContain(fixture.key);

    const detail = await jsonRequest<{
      project: { name: string; category: string; rpm_limit: number };
      keys: Array<{ id: string; status: string }>;
      models: Array<{ id: string }>;
      integration: { base_url: string; url: string; model: string };
    }>(`/admin/api/projects/${fixture.id}`);
    expect(detail.data.project).toMatchObject({ name: "Image SaaS", category: "image_saas", rpm_limit: 17 });
    expect(detail.data.models.map((model) => model.id)).toContain(fixture.model.id);
    expect(detail.data.integration).toMatchObject({
      base_url: "https://openpass.test/v1",
      url: "https://openpass.test/v1/chat/completions",
      model: fixture.model.alias,
    });

    const projects = await jsonRequest<{
      projects: Array<{
        id: string;
        virtual_key_id: string | null;
        virtual_key_prefix: string | null;
        virtual_key_last4: string | null;
        integration: { url: string; model: string } | null;
      }>;
    }>("/admin/api/projects");
    const listed = projects.data.projects.find((project) => project.id === fixture.id);
    expect(listed).toMatchObject({
      virtual_key_prefix: storedKey?.key_prefix,
      virtual_key_last4: storedKey?.key_last4,
      integration: {
        url: "https://openpass.test/v1/chat/completions",
        model: fixture.model.alias,
      },
    });
    expect(listed?.virtual_key_id).toBeTruthy();

    const duplicate = await jsonRequest<{ error: { code: string } }>("/admin/api/projects", "POST", {
      name: "Duplicate", slug: (await env.DB.prepare("SELECT slug FROM projects WHERE id = ?").bind(fixture.id).first<{ slug: string }>())?.slug,
      model_ids: [fixture.model.id],
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.data.error.code).toBe("PROJECT_SLUG_EXISTS");

    const updated = await jsonRequest<{ project: { name: string }; models: Array<{ daily_cost_limit_cents: number | null }> }>(
      `/admin/api/projects/${fixture.id}`,
      "PATCH",
      {
        name: "Updated Project",
        model_ids: [fixture.model.id],
        model_limits: { [fixture.model.id]: { daily_cost_limit_cents: 55 } },
        limits: { rpm_limit: 22, concurrency_limit: 4 },
      },
    );
    expect(updated.data.project.name).toBe("Updated Project");
    expect(updated.data.models[0].daily_cost_limit_cents).toBe(55);

    const createdKey = await jsonRequest<{
      id: string;
      virtual_key: string;
      integration: { url: string; model: string };
    }>(
      `/admin/api/projects/${fixture.id}/keys`,
      "POST",
      { name: "Staging", expires_at: new Date(Date.now() + 86_400_000).toISOString() },
    );
    expect(createdKey.response.status).toBe(201);
    expect(createdKey.data.virtual_key).toMatch(/^pk_live_/);
    expect(createdKey.data.integration).toMatchObject({
      url: "https://openpass.test/v1/chat/completions",
      model: fixture.model.alias,
    });

    const rotated = await jsonRequest<{
      id: string;
      virtual_key: string;
      previous_key_active_until: string;
      integration: { url: string; model: string };
    }>(
      `/admin/api/virtual-keys/${createdKey.data.id}/rotate`,
      "POST",
      { grace_period_minutes: 60 },
    );
    expect(rotated.response.status).toBe(201);
    expect(rotated.data.virtual_key).not.toBe(createdKey.data.virtual_key);
    expect(rotated.data.integration).toEqual(expect.objectContaining(createdKey.data.integration));
    expect(Date.parse(rotated.data.previous_key_active_until)).toBeGreaterThan(Date.now());
    expect((await env.DB.prepare("SELECT status, rotation_expires_at FROM virtual_keys WHERE id = ?").bind(createdKey.data.id).first<{ status: string; rotation_expires_at: string }>())).toMatchObject({
      status: "rotating",
      rotation_expires_at: rotated.data.previous_key_active_until,
    });

    const disabled = await jsonRequest<{ status: string }>(
      `/admin/api/virtual-keys/${rotated.data.id}/status`,
      "POST",
      { status: "disabled" },
    );
    expect(disabled.data.status).toBe("disabled");

    const revoked = await jsonRequest<{ revoked: boolean }>(
      `/admin/api/virtual-keys/${rotated.data.id}/revoke`,
      "POST",
      {},
    );
    expect(revoked.data.revoked).toBe(true);

    const paused = await jsonRequest<{ status: string }>(
      `/admin/api/projects/${fixture.id}/status`,
      "POST",
      { status: "paused" },
    );
    expect(paused.data.status).toBe("paused");

    const keys = await jsonRequest<{ virtual_keys: Array<{ id: string; status: string }> }>(`/admin/api/projects/${fixture.id}/keys`);
    expect(keys.data.virtual_keys.length).toBeGreaterThanOrEqual(3);
    expect(keys.data.virtual_keys.find((key) => key.id === rotated.data.id)?.status).toBe("revoked");
  });

  it("deletes a project and its operational data while retaining the audit record", async () => {
    const fixture = await createProjectFixture({ name: "Delete Project Fixture" });
    const virtualKey = await env.DB.prepare("SELECT id FROM virtual_keys WHERE project_id = ? LIMIT 1")
      .bind(fixture.id)
      .first<{ id: string }>();
    const requestId = crypto.randomUUID();
    const alertId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO requests(id, project_id, virtual_key_id, endpoint, method, status, started_at, estimated_cost_cents)
         VALUES (?, ?, ?, '/v1/chat/completions', 'POST', 'succeeded', ?, 1)`,
      ).bind(requestId, fixture.id, virtualKey!.id, new Date().toISOString()),
      env.DB.prepare(
        `INSERT INTO alerts(id, project_id, type, severity, message, status, created_at)
         VALUES (?, ?, 'quota', 'warning', 'Delete fixture alert', 'open', ?)`,
      ).bind(alertId, fixture.id, new Date().toISOString()),
    ]);

    const deleted = await jsonRequest<{ deleted: boolean; project: { id: string; name: string } }>(
      `/admin/api/projects/${fixture.id}/delete`,
      "POST",
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.data).toMatchObject({
      deleted: true,
      project: { id: fixture.id, name: "Delete Project Fixture" },
    });

    expect(await env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(fixture.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM requests WHERE project_id = ?").bind(fixture.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM virtual_keys WHERE project_id = ?").bind(fixture.id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM alerts WHERE id = ?").bind(alertId).first()).toBeNull();
    expect(await env.DB.prepare(
      "SELECT id FROM audit_logs WHERE action = 'project.delete' AND object_id = ?",
    ).bind(fixture.id).first()).toBeTruthy();

    const missing = await jsonRequest<{ error: { code: string } }>(`/admin/api/projects/${fixture.id}`);
    expect(missing.response.status).toBe(404);
    expect(missing.data.error.code).toBe("PROJECT_NOT_FOUND");
  });

  it("configures a default model, project aliases, fallback order, alerts, and IP access rules", async () => {
    const fixture = await createProjectFixture();
    const fallback = await env.DB.prepare(
      `SELECT m.id FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE m.id <> ? AND m.status = 'active' AND p.status = 'active' AND m.request_type = 'chat'
       LIMIT 1`,
    ).bind(fixture.model.id).first<{ id: string }>();
    expect(fallback).toBeTruthy();

    const updated = await jsonRequest<{
      models: Array<{ id: string; is_default: number; project_alias: string | null; fallback_priority: number }>;
      ip_rules: unknown[];
      alerts: unknown[];
    }>(`/admin/api/projects/${fixture.id}`, "PATCH", {
      model_ids: [fixture.model.id, fallback!.id],
      default_model_id: fallback!.id,
      model_aliases: {
        [fixture.model.id]: "primary-chat",
        [fallback!.id]: "backup-chat",
      },
      fallback_order: [fallback!.id, fixture.model.id],
    });
    expect(updated.response.status).toBe(200);
    expect(updated.data.models.find((model) => model.id === fallback!.id)).toMatchObject({
      is_default: 1,
      project_alias: "backup-chat",
      fallback_priority: 0,
    });
    expect(updated.data.models.find((model) => model.id === fixture.model.id)).toMatchObject({
      is_default: 0,
      project_alias: "primary-chat",
      fallback_priority: 1,
    });
    expect(updated.data.ip_rules).toEqual([]);
    expect(updated.data.alerts).toEqual([]);

    const created = await jsonRequest<{ ip_rule: { id: string; value: string; rule_type: string } }>(
      `/admin/api/projects/${fixture.id}/ip-rules`,
      "POST",
      { rule_type: "block", value: "203.0.113.9/24", note: "test network" },
    );
    expect(created.response.status).toBe(201);
    expect(created.data.ip_rule).toMatchObject({ value: "203.0.113.9/24", rule_type: "block" });

    const duplicate = await jsonRequest<{ error: { code: string } }>(
      `/admin/api/projects/${fixture.id}/ip-rules`,
      "POST",
      { rule_type: "block", value: "203.0.113.9/24" },
    );
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.data.error.code).toBe("IP_RULE_EXISTS");

    const disabled = await jsonRequest<{ status: string }>(
      `/admin/api/ip-rules/${created.data.ip_rule.id}`,
      "PATCH",
      { status: "disabled" },
    );
    expect(disabled.data.status).toBe("disabled");
    const listed = await jsonRequest<{ ip_rules: Array<{ id: string; status: string }> }>(
      `/admin/api/projects/${fixture.id}/ip-rules`,
    );
    expect(listed.data.ip_rules).toContainEqual(expect.objectContaining({ id: created.data.ip_rule.id, status: "disabled" }));

    const removed = await jsonRequest<{ deleted: boolean }>(`/admin/api/ip-rules/${created.data.ip_rule.id}`, "DELETE");
    expect(removed.data.deleted).toBe(true);
  });
});

describe("provider, credential and model lifecycle", () => {
  it("encrypts credentials, tests connections, edits models and archives related records", async () => {
    const slug = `provider-${crypto.randomUUID().slice(0, 8)}`;
    const provider = await jsonRequest<{ provider: { id: string } }>("/admin/api/providers", "POST", {
      name: "Test Provider",
      slug,
      base_url: "https://provider.test/v1/",
      adapter_type: "openai-compatible",
      timeout_ms: 5_000,
      retry_count: 2,
    });
    expect(provider.response.status).toBe(201);

    const duplicate = await jsonRequest<{ error: { code: string } }>("/admin/api/providers", "POST", {
      name: "Duplicate",
      slug,
      base_url: "https://provider.test/v1",
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.data.error.code).toBe("PROVIDER_SLUG_EXISTS");

    const secret = "sk-test-super-secret";
    const credential = await jsonRequest<{ credential: { id: string; last4: string } }>(
      `/admin/api/providers/${provider.data.provider.id}/credentials`,
      "POST",
      { name: "Primary", secret, priority: 0, weight: 3 },
    );
    expect(credential.data.credential.last4).toBe("cret");
    const stored = await env.DB.prepare(
      "SELECT encrypted_secret, secret_last4 FROM provider_credentials WHERE id = ?",
    ).bind(credential.data.credential.id).first<{ encrypted_secret: string; secret_last4: string }>();
    expect(stored?.encrypted_secret).not.toContain(secret);

    const listed = await jsonRequest<{ credentials: Array<Record<string, unknown>> }>(
      `/admin/api/providers/${provider.data.provider.id}/credentials`,
    );
    expect(listed.data.credentials[0]).not.toHaveProperty("encrypted_secret");

    const replacementSecret = "sk-test-replacement-NEW2";
    const replacement = await jsonRequest<{ credential: { id: string; last4: string }; replaced: boolean }>(
      `/admin/api/providers/${provider.data.provider.id}/credentials`,
      "POST",
      { name: "Replacement", secret: replacementSecret },
    );
    expect(replacement.response.status).toBe(200);
    expect(replacement.data).toMatchObject({
      credential: { id: credential.data.credential.id, last4: "NEW2" },
      replaced: true,
    });
    const credentialState = await env.DB.prepare(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'active' AND encrypted_secret <> 'erased' THEN 1 ELSE 0 END) AS usable FROM provider_credentials WHERE provider_id = ?",
    ).bind(provider.data.provider.id).first<{ total: number; usable: number }>();
    expect(credentialState).toEqual({ total: 1, usable: 1 });

    await jsonRequest(`/admin/api/credentials/${credential.data.credential.id}`, "PATCH", {
      name: "Primary Updated", priority: 1, weight: 5, rpm_limit: 100, daily_request_limit: 1_000,
    });
    const disabled = await jsonRequest<{ status: string }>(
      `/admin/api/credentials/${credential.data.credential.id}/status`,
      "POST",
      { status: "disabled" },
    );
    expect(disabled.data.status).toBe("disabled");
    await jsonRequest(`/admin/api/credentials/${credential.data.credential.id}/status`, "POST", { status: "active" });

    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    await env.DB.prepare(`UPDATE provider_credentials SET health_status = 'rate_limited', consecutive_failures = 2,
      circuit_open_until = datetime('now', '+5 minutes'), last_error = 'Previous HTTP 429' WHERE id = ?`)
      .bind(credential.data.credential.id).run();
    vi.stubGlobal("fetch", fetchSpy);
    const connection = await jsonRequest<{ success: boolean; http_status: number }>(
      `/admin/api/providers/${provider.data.provider.id}/test`,
      "POST",
      {},
    );
    expect(connection.data).toMatchObject({ success: true, http_status: 200 });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe("https://provider.test/v1/models");
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get("authorization")).toBe(`Bearer ${replacementSecret}`);
    expect(await env.DB.prepare(
      "SELECT health_status, consecutive_failures, circuit_open_until, last_error FROM provider_credentials WHERE id = ?",
    ).bind(credential.data.credential.id).first()).toEqual({
      health_status: "healthy",
      consecutive_failures: 0,
      circuit_open_until: null,
      last_error: null,
    });
    vi.unstubAllGlobals();

    const modelAlias = `model-${crypto.randomUUID().slice(0, 8)}`;
    const model = await jsonRequest<{ model: { id: string } }>("/admin/api/models", "POST", {
      provider_id: provider.data.provider.id,
      name: "Test Model",
      alias: modelAlias,
      provider_model_id: "provider-model-v1",
      request_type: "chat",
      input_cost_microunits: 10,
      output_cost_microunits: 20,
    });
    expect(model.response.status).toBe(201);
    const duplicateModel = await jsonRequest<{ error: { code: string } }>("/admin/api/models", "POST", {
      provider_id: provider.data.provider.id,
      name: "Duplicate",
      alias: modelAlias,
      provider_model_id: "duplicate",
    });
    expect(duplicateModel.data.error.code).toBe("MODEL_ALIAS_EXISTS");

    await jsonRequest(`/admin/api/models/${model.data.model.id}`, "PATCH", {
      name: "Test Model Updated",
      request_type: "video",
      fixed_cost_cents: 12,
      pricing_note: "Per generated clip",
    });
    const models = await jsonRequest<{ models: Array<{ id: string; name: string; request_type: string }> }>("/admin/api/models?page_size=100");
    expect(models.data.models.find((item) => item.id === model.data.model.id)).toMatchObject({
      name: "Test Model Updated",
      request_type: "video",
    });

    const archived = await jsonRequest<{ archived: boolean }>(`/admin/api/providers/${provider.data.provider.id}/archive`, "POST", {});
    expect(archived.data.archived).toBe(true);
    expect((await env.DB.prepare("SELECT status FROM models WHERE id = ?").bind(model.data.model.id).first<{ status: string }>())?.status).toBe("disabled");
    expect((await env.DB.prepare("SELECT status FROM provider_credentials WHERE id = ?").bind(credential.data.credential.id).first<{ status: string }>())?.status).toBe("disabled");
  });

  it("tests Dewatermark credentials through its credit endpoint", async () => {
    const provider = await jsonRequest<{ provider: { id: string } }>("/admin/api/providers", "POST", {
      name: "Dewatermark Test", slug: `dewatermark-test-${crypto.randomUUID().slice(0, 8)}`, base_url: "https://platform.dewatermark.ai", adapter_type: "dewatermark",
    });
    await jsonRequest(`/admin/api/providers/${provider.data.provider.id}/credentials`, "POST", { name: "Dewatermark key", secret: "dewatermark-test-key" });
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://platform.dewatermark.ai/api/creditInfo");
      expect(new Headers(init?.headers).get("x-api-key")).toBe("dewatermark-test-key");
      return new Response(JSON.stringify({ credits: 10 }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", upstream);
    const result = await jsonRequest<{ success: boolean; http_status: number }>(`/admin/api/providers/${provider.data.provider.id}/test`, "POST", {});
    expect(result.data).toEqual({ success: true, http_status: 200 });
  });

  it("tests KIE credentials through its remaining-credit endpoint", async () => {
    const provider = await jsonRequest<{ provider: { id: string } }>("/admin/api/providers", "POST", {
      name: "KIE Test", slug: `kie-test-${crypto.randomUUID().slice(0, 8)}`, base_url: "https://api.kie.ai", adapter_type: "kie",
    });
    await jsonRequest(`/admin/api/providers/${provider.data.provider.id}/credentials`, "POST", { name: "KIE key", secret: "kie-test-key" });
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.kie.ai/api/v1/chat/credit");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer kie-test-key");
      return new Response(JSON.stringify({ code: 200, data: { credits: 10 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", upstream);
    const result = await jsonRequest<{ success: boolean; http_status: number }>(`/admin/api/providers/${provider.data.provider.id}/test`, "POST", {});
    expect(result.data).toEqual({ success: true, http_status: 200 });
  });

  it("tests legacy OpenAI configurations against the versioned models endpoint", async () => {
    await env.DB.prepare("UPDATE providers SET base_url = 'https://api.openai.com' WHERE id = 'provider_openai'").run();
    await jsonRequest("/admin/api/providers/provider_openai/credentials", "POST", {
      name: "OpenAI test key",
      secret: "sk-openai-test-placeholder",
    });
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const connection = await jsonRequest<{ success: boolean; http_status: number }>(
      "/admin/api/providers/provider_openai/test",
      "POST",
      {},
    );

    expect(connection.data).toMatchObject({ success: true, http_status: 200 });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
    vi.unstubAllGlobals();
  });

  it("permanently erases credential material and refuses reactivation", async () => {
    const provider = await env.DB.prepare("SELECT id FROM providers WHERE deleted_at IS NULL LIMIT 1").first<{ id: string }>();
    expect(provider).toBeTruthy();
    const credential = await jsonRequest<{ credential: { id: string } }>(
      `/admin/api/providers/${provider!.id}/credentials`,
      "POST",
      { name: "Disposable", secret: "secret-to-erase" },
    );
    const erased = await jsonRequest<{ erased: boolean }>(`/admin/api/credentials/${credential.data.credential.id}`, "DELETE");
    expect(erased.data.erased).toBe(true);
    const row = await env.DB.prepare("SELECT encrypted_secret, secret_last4, status FROM provider_credentials WHERE id = ?")
      .bind(credential.data.credential.id).first<{ encrypted_secret: string; secret_last4: string; status: string }>();
    expect(row).toEqual({ encrypted_secret: "erased", secret_last4: "ERASED", status: "disabled" });
    const restore = await jsonRequest<{ error: { code: string } }>(
      `/admin/api/credentials/${credential.data.credential.id}/status`,
      "POST",
      { status: "active" },
    );
    expect(restore.response.status).toBe(400);
    expect(restore.data.error.code).toBe("CREDENTIAL_ERASED");
  });
});

describe("dashboard, logs, alerts, settings and audit", () => {
  it("filters request logs, exports CSV, updates alerts/settings and audits sensitive actions", async () => {
    const fixture = await createProjectFixture();
    const requestId = `req_${crypto.randomUUID().replaceAll("-", "")}`;
    const timestamp = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO requests(id, project_id, virtual_key_id, provider_id, model_id, endpoint, method, status, source_ip, source_ip_policy, started_at, completed_at, duration_ms, http_status, estimated_cost_cents, price_version, error_code, request_metadata)
       SELECT ?, ?, vk.id, ?, ?, '/v1/chat/completions', 'POST', 'failed', '203.0.113.9', 'full', ?, ?, 45, 502, 7, 'test-v1', 'UPSTREAM_ERROR', '{"prompt":"redacted test"}'
       FROM virtual_keys vk WHERE vk.project_id = ? LIMIT 1`,
    ).bind(requestId, fixture.id, fixture.model.provider_id, fixture.model.id, timestamp, timestamp, fixture.id).run();
    await env.DB.prepare(
      "INSERT INTO alerts(id, project_id, type, severity, message, status, created_at) VALUES (?, ?, 'test_alert', 'warning', 'Test alert', 'open', ?)",
    ).bind("alert-test", fixture.id, timestamp).run();
    await env.DB.prepare(
      "INSERT INTO jobs(id, project_id, request_id, provider_id, model_id, type, status, provider_job_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'image', 'processing', 'provider-job', ?, ?)",
    ).bind("job-test", fixture.id, requestId, fixture.model.provider_id, fixture.model.id, timestamp, timestamp).run();

    const dashboard = await jsonRequest<{ summary: { requests: number; failures: number }; month: { requests: number }; daily_usage: Array<{ usage_date: string; requests: number; cost_cents: number }>; service_status: Array<{ usage_date: string; requests: number; failures: number }> }>(
      `/admin/api/dashboard?period=today&project_id=${fixture.id}`,
    );
    expect(Number(dashboard.data.summary.requests)).toBe(1);
    expect(Number(dashboard.data.summary.failures)).toBe(1);
    expect(Number(dashboard.data.month.requests)).toBe(1);
    expect(dashboard.data.daily_usage).toHaveLength(1);
    expect(Number(dashboard.data.daily_usage[0].requests)).toBe(1);
    expect(Number(dashboard.data.daily_usage[0].cost_cents)).toBe(7);
    expect(dashboard.data.service_status).toHaveLength(1);
    expect(Number(dashboard.data.service_status[0].failures)).toBe(1);

    const logs = await jsonRequest<{ requests: Array<{ id: string }> }>(
      `/admin/api/requests?project_id=${fixture.id}&status=failed&source_ip=203.0.113&min_cost_cents=7&max_cost_cents=7`,
    );
    expect(logs.data.requests.map((request) => request.id)).toContain(requestId);

    const detail = await jsonRequest<{ request: { id: string; request_metadata: string } }>(`/admin/api/requests/${requestId}`);
    expect(detail.data.request.id).toBe(requestId);
    expect(detail.data.request.request_metadata).toContain("redacted test");

    const exported = await callWorker(`/admin/api/requests/export?project_id=${fixture.id}&status=failed`);
    expect(exported.response.status).toBe(200);
    expect(exported.response.headers.get("content-type")).toContain("text/csv");
    expect(await exported.response.text()).toContain(requestId);

    const jobs = await jsonRequest<{ jobs: Array<{ id: string }> }>(`/admin/api/jobs?project_id=${fixture.id}&status=processing`);
    expect(jobs.data.jobs.map((job) => job.id)).toContain("job-test");

    const alerts = await jsonRequest<{
      alerts: Array<{ id: string }>;
      summary: { total: number; open: number; warning: number };
    }>("/admin/api/alerts?status=open&severity=warning&query=test");
    expect(alerts.data.alerts.map((alert) => alert.id)).toContain("alert-test");
    expect(alerts.data.summary.total).toBeGreaterThanOrEqual(1);
    expect(alerts.data.summary.open).toBeGreaterThanOrEqual(1);
    expect(alerts.data.summary.warning).toBeGreaterThanOrEqual(1);
    const resolved = await jsonRequest<{ status: string }>("/admin/api/alerts/alert-test/status", "POST", { status: "resolved" });
    expect(resolved.data.status).toBe("resolved");

    const settings = await jsonRequest<{ settings: Record<string, string> }>("/admin/api/settings", "PATCH", {
      default_timeout_ms: "45000",
      default_retry_count: "2",
      alert_threshold_warning: "75",
      alert_threshold_critical: "95",
      quota_failure_policy: "allow",
      error_rate_alert_percent: "30",
      error_rate_min_requests: "5",
      request_spike_multiplier: "4",
      ip_request_alert_threshold: "25",
      virtual_key_rotation_grace_minutes: "120",
    });
    expect(settings.data.settings).toMatchObject({
      default_timeout_ms: "45000",
      default_retry_count: "2",
      alert_threshold_warning: "75",
      alert_threshold_critical: "95",
      quota_failure_policy: "allow",
      error_rate_alert_percent: "30",
      error_rate_min_requests: "5",
      request_spike_multiplier: "4",
      ip_request_alert_threshold: "25",
      virtual_key_rotation_grace_minutes: "120",
    });
    const invalidSettings = await jsonRequest<{ error: { code: string } }>("/admin/api/settings", "PATCH", {
      alert_threshold_warning: "0",
    });
    expect(invalidSettings.response.status).toBe(400);

    const audit = await jsonRequest<{ audit_logs: Array<{ action: string; object_name: string | null }>; pagination: { page: number; page_size: number; total: number; total_pages: number } }>("/admin/api/audit-logs");
    const actions = audit.data.audit_logs.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(["project.create", "request.view_sensitive", "request.export", "alert.status", "settings.update"]));
    expect(audit.data.audit_logs.find((row) => row.action === "settings.update")?.object_name).toBe("全局系统设置");
    expect(audit.data.pagination.page).toBe(1);
    expect(audit.data.pagination.page_size).toBe(10);
    expect(audit.data.pagination.total).toBeGreaterThanOrEqual(audit.data.audit_logs.length);

    const secondAuditPage = await jsonRequest<{ audit_logs: Array<{ action: string }>; pagination: { page: number; page_size: number } }>("/admin/api/audit-logs?page=2&page_size=2");
    expect(secondAuditPage.data.pagination).toMatchObject({ page: 2, page_size: 2 });
    expect(secondAuditPage.data.audit_logs.length).toBeLessThanOrEqual(2);
  });
});
