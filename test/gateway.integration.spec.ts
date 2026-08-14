import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env, waitOnExecutionContext } from "cloudflare:test";
import { encryptSecret } from "../src/lib/crypto";
import { bearer, callWorker, createProjectFixture, jsonRequest } from "./helpers";

type ProjectFixture = Awaited<ReturnType<typeof createProjectFixture>>;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM requests"),
    env.DB.prepare("DELETE FROM projects"),
    env.DB.prepare("DELETE FROM provider_credentials"),
  ]);
});

async function addCredential(fixture: ProjectFixture, apiKey = "sk-test-provider", priority = 0) {
  const { response, data } = await jsonRequest<{ credential: { id: string } }>(
    `/admin/api/providers/${fixture.model.provider_id}/credentials`,
    "POST",
    { name: `test-${crypto.randomUUID()}`, secret: apiKey, priority },
  );
  expect(response.status).toBe(201);
  return data.credential;
}

async function gatewayRequest(fixture: ProjectFixture, body?: Record<string, unknown>) {
  const result = await callWorker("/v1/chat/completions", {
    method: "POST",
    headers: {
      ...bearer(fixture.key),
      "cf-connecting-ip": "203.0.113.42",
    },
    body: JSON.stringify(
      body ?? {
        model: fixture.model.alias,
        messages: [{ role: "user", content: "hello" }],
      },
    ),
  });
  const responseBody = await result.response.text();
  await waitOnExecutionContext(result.context);
  return new Response(responseBody, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers: result.response.headers,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gateway integration", () => {
  it("lists only the models available to the authenticated project", async () => {
    const fixture = await createProjectFixture();
    await env.DB.prepare("UPDATE project_models SET project_alias = 'project-chat' WHERE project_id = ? AND model_id = ?")
      .bind(fixture.id, fixture.model.id)
      .run();

    const listed = await callWorker("/v1/models", {
      headers: bearer(fixture.key),
    });
    expect(listed.response.status).toBe(200);
    expect(listed.response.headers.get("x-request-id")).toBeTruthy();
    const payload = await listed.response.json<{
      object: string;
      data: Array<{ id: string; object: string; owned_by: string; request_type: string }>;
    }>();
    expect(payload.object).toBe("list");
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({
      id: "project-chat",
      object: "model",
    });
    expect(payload.data[0].owned_by).toBeTruthy();
    expect(payload.data[0].request_type).toBeTruthy();

    const denied = await callWorker("/v1/models");
    expect(denied.response.status).toBe(401);
  });

  it("authenticates a virtual key, forwards the mapped model, and records usage", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture, "sk-real-secret");
    await env.DB.prepare(
      `UPDATE models
       SET fixed_cost_cents = 2, input_cost_microunits = 1000000,
           output_cost_microunits = 2000000
       WHERE id = ?`,
    )
      .bind(fixture.model.id)
      .run();
    const model = await env.DB.prepare("SELECT provider_model_id FROM models WHERE id = ?")
      .bind(fixture.model.id)
      .first<{ provider_model_id: string }>();

    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk-real-secret");
      const payload = JSON.parse(String(init?.body));
      expect(payload.model).toBe(model?.provider_model_id);
      return new Response(
        JSON.stringify({
          id: "upstream-response",
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", upstream);

    const response = await gatewayRequest(fixture);
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();

    const requestRow = await env.DB.prepare(
      `SELECT status, input_tokens, output_tokens, estimated_cost_cents,
              source_ip, request_metadata
       FROM requests WHERE project_id = ? ORDER BY started_at DESC LIMIT 1`,
    )
      .bind(fixture.id)
      .first<{
        status: string;
        input_tokens: number;
        output_tokens: number;
        estimated_cost_cents: number;
        source_ip: string;
        request_metadata: string;
      }>();
    expect(requestRow).toMatchObject({
      status: "succeeded",
      input_tokens: 3,
      output_tokens: 2,
      estimated_cost_cents: 9,
      source_ip: "203.0.113.0/24",
    });
    expect(requestRow?.request_metadata).not.toContain("sk-real-secret");

    const daily = await env.DB.prepare(
      "SELECT request_count, estimated_cost_cents FROM usage_daily WHERE project_id = ?",
    )
      .bind(fixture.id)
      .first<{ request_count: number; estimated_cost_cents: number }>();
    expect(daily).toEqual({ request_count: 1, estimated_cost_cents: 9 });

    const key = await env.DB.prepare("SELECT last_used_at FROM virtual_keys WHERE project_id = ?")
      .bind(fixture.id)
      .first<{ last_used_at: string | null }>();
    expect(key?.last_used_at).toBeTruthy();

    const detail = await jsonRequest<{
      keys: Array<{
        request_count: number;
        success_count: number;
        input_tokens: number;
        output_tokens: number;
        estimated_cost_cents: number;
        average_duration_ms: number;
      }>;
    }>(`/admin/api/projects/${fixture.id}`);
    expect(detail.data.keys[0]).toMatchObject({
      request_count: 1,
      success_count: 1,
      input_tokens: 3,
      output_tokens: 2,
      estimated_cost_cents: 9,
    });
    expect(detail.data.keys[0].average_duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("creates and polls KIE asynchronous image tasks through the standard gateway", async () => {
    const kieModel = await env.DB.prepare(
      "SELECT id, provider_id, alias FROM models WHERE id = 'model_kie_seedream_v4'",
    ).first<{ id: string; provider_id: string; alias: string }>();
    expect(kieModel).toBeTruthy();
    const project = await jsonRequest<{ project: { id: string }; virtual_key: string }>("/admin/api/projects", "POST", {
      name: "KIE Project",
      slug: `kie-${crypto.randomUUID().slice(0, 8)}`,
      model_ids: [kieModel!.id],
      limits: { rpm_limit: 60, concurrency_limit: 5 },
    });
    const credential = await jsonRequest<{ credential: { id: string } }>(
      `/admin/api/providers/${kieModel!.provider_id}/credentials`, "POST", { name: "kie", secret: "kie-test-secret" },
    );
    expect(credential.response.status).toBe(201);

    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer kie-test-secret");
      if (url.endsWith("/api/v1/jobs/createTask")) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          model: "bytedance/seedream-v4-text-to-image",
          input: { prompt: "a mountain", image_size: "square_hd", max_images: 2 },
        });
        return new Response(JSON.stringify({ code: 200, msg: "success", data: { taskId: "task_kie_1" } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      expect(url).toBe("https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_kie_1");
      return new Response(JSON.stringify({ code: 200, data: { state: "success", resultJson: '{"resultUrls":["https://cdn.example.test/result.png"]}' } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", upstream);

    const created = await callWorker("/v1/images/generations", {
      method: "POST",
      admin: false,
      headers: bearer(project.data.virtual_key),
      body: JSON.stringify({ model: kieModel!.alias, prompt: "a mountain", size: "square_hd", n: 2 }),
    });
    expect(created.response.status).toBe(202);
    const job = await created.response.json<{ id: string; provider_job_id: string }>();
    expect(job.provider_job_id).toBe("task_kie_1");
    await waitOnExecutionContext(created.context);

    const status = await callWorker(`/v1/jobs/${job.id}`, { admin: false, headers: bearer(project.data.virtual_key) });
    expect(status.response.status).toBe(200);
    expect(await status.response.json()).toMatchObject({ status: "succeeded", result_url: "https://cdn.example.test/result.png" });
    await waitOnExecutionContext(status.context);
  });

  it("maps OpenPass video requests to the required Kling 2.6 KIE inputs", async () => {
    const models = await env.DB.prepare("SELECT id, provider_id, alias FROM models WHERE id IN ('model_kie_kling_26_text', 'model_kie_kling_26_image') ORDER BY id")
      .all<{ id: string; provider_id: string; alias: string }>();
    expect(models.results).toHaveLength(2);
    const project = await jsonRequest<{ project: { id: string }; virtual_key: string }>("/admin/api/projects", "POST", {
      name: "Kling Project", slug: `kling-${crypto.randomUUID().slice(0, 8)}`,
      model_ids: models.results.map((model) => model.id), limits: { rpm_limit: 60, concurrency_limit: 5 },
    });
    await jsonRequest(`/admin/api/providers/${models.results[0].provider_id}/credentials`, "POST", { name: "kie", secret: "kie-test-secret" });
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(
      JSON.stringify({ code: 200, data: { taskId: "task_kling_1" } }), { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", upstream);

    const textModel = models.results.find((model) => model.alias.includes("text"))!;
    const text = await callWorker("/v1/videos/generations", { method: "POST", admin: false, headers: bearer(project.data.virtual_key), body: JSON.stringify({ model: textModel.alias, prompt: "a paper boat", size: "16:9", duration: 5 }) });
    expect(text.response.status).toBe(202);
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toMatchObject({ model: "kling-2.6/text-to-video", input: { prompt: "a paper boat", sound: false, aspect_ratio: "16:9", duration: "5" } });

    const imageModel = models.results.find((model) => model.alias.includes("image"))!;
    const image = await callWorker("/v1/videos/generations", { method: "POST", admin: false, headers: bearer(project.data.virtual_key), body: JSON.stringify({ model: imageModel.alias, prompt: "gentle motion", duration: 10, image_url: "https://cdn.example.test/source.png" }) });
    expect(image.response.status).toBe(202);
    expect(JSON.parse(String(upstream.mock.calls[1][1]?.body))).toMatchObject({ model: "kling-2.6/image-to-video", input: { prompt: "gentle motion", sound: false, duration: "10", image_urls: ["https://cdn.example.test/source.png"] } });
  });

  it("forwards authorized JPEG watermark-removal uploads without exposing the provider key", async () => {
    const model = await env.DB.prepare("SELECT id, provider_id, alias FROM models WHERE id = 'model_dewatermark_image_v3'")
      .first<{ id: string; provider_id: string; alias: string }>();
    expect(model).toBeTruthy();
    const project = await jsonRequest<{ project: { id: string }; virtual_key: string }>("/admin/api/projects", "POST", {
      name: "Watermark Project", slug: `watermark-${crypto.randomUUID().slice(0, 8)}`, model_ids: [model!.id], limits: { rpm_limit: 60, concurrency_limit: 5 },
    });
    await jsonRequest(`/admin/api/providers/${model!.provider_id}/credentials`, "POST", { name: "dewatermark", secret: "dewatermark-test-secret" });
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://platform.dewatermark.ai/api/object_removal/v3/erase_watermark");
      expect(new Headers(init?.headers).get("x-api-key")).toBe("dewatermark-test-secret");
      expect(init?.body).toBeInstanceOf(FormData);
      const body = init?.body as FormData;
      expect(body.get("remove_text")).toBe("true");
      expect(body.get("original_preview_image")).toBeInstanceOf(File);
      return new Response(JSON.stringify({ edited_image: { image: "result-base64", watermark_mask: "mask-base64" }, session_id: "session-1" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", upstream);
    const form = new FormData();
    form.set("model", model!.alias);
    form.set("image", new File([new Uint8Array([0xff, 0xd8, 0xff])], "input.jpg", { type: "image/jpeg" }));
    form.set("remove_text", "true");
    const result = await callWorker("/v1/images/watermark-removals", { method: "POST", admin: false, headers: { authorization: `Bearer ${project.data.virtual_key}` }, body: form });
    expect(result.response.status).toBe(200);
    expect(await result.response.json()).toMatchObject({ data: [{ b64_json: "result-base64" }], session_id: "session-1", watermark_mask: "mask-base64" });
    expect(JSON.stringify(await env.DB.prepare("SELECT encrypted_secret FROM provider_credentials WHERE provider_id = ?").bind(model!.provider_id).first())).not.toContain("dewatermark-test-secret");
  });

  it("creates project-scoped Dewatermark video upload sessions and jobs", async () => {
    const model = await env.DB.prepare("SELECT id, provider_id, alias FROM models WHERE id = 'model_dewatermark_video'")
      .first<{ id: string; provider_id: string; alias: string }>();
    expect(model).toBeTruthy();
    const project = await jsonRequest<{ project: { id: string }; virtual_key: string }>("/admin/api/projects", "POST", {
      name: "Video Watermark Project", slug: `video-watermark-${crypto.randomUUID().slice(0, 8)}`, model_ids: [model!.id], limits: { rpm_limit: 60, concurrency_limit: 5 },
    });
    await jsonRequest(`/admin/api/providers/${model!.provider_id}/credentials`, "POST", { name: "dewatermark-video", secret: "dewatermark-video-secret" });
    const upstream = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(new Headers(init?.headers).get("x-api-key")).toBe("dewatermark-video-secret");
      if (url.endsWith("/api/video/v1/upload")) {
        return new Response(JSON.stringify({ task_id: "dw-video-1", upload_signed_url: "https://storage.example.test/signed-upload", file_path: "uploads/dw-video-1" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.endsWith("/api/video/v1/tasks")) {
        expect(init?.body).toBeInstanceOf(FormData);
        expect((init?.body as FormData).get("task_id")).toBe("dw-video-1");
        return new Response("{}", { status: 200 });
      }
      expect(url).toBe("https://platform.dewatermark.ai/api/video/v1/tasks/dw-video-1");
      return new Response(JSON.stringify({ status: "COMPLETED", download_signed_url: "https://storage.example.test/result.mp4" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", upstream);
    const upload = await callWorker("/v1/uploads", { method: "POST", admin: false, headers: bearer(project.data.virtual_key), body: JSON.stringify({ model: model!.alias, media_type: "video" }) });
    expect(upload.response.status).toBe(201);
    const uploadData = await upload.response.json<{ id: string; upload_url: string; upload_method: string }>();
    expect(uploadData).toMatchObject({ upload_url: "https://storage.example.test/signed-upload", upload_method: "PUT" });

    const submitted = await callWorker("/v1/videos/watermark-removals", { method: "POST", admin: false, headers: bearer(project.data.virtual_key), body: JSON.stringify({ upload_id: uploadData.id }) });
    expect(submitted.response.status).toBe(202);
    const job = await submitted.response.json<{ id: string; provider_job_id: string }>();
    expect(job.provider_job_id).toBe("dw-video-1");
    const jobStatus = await callWorker(`/v1/jobs/${job.id}`, { admin: false, headers: bearer(project.data.virtual_key) });
    expect(jobStatus.response.status).toBe(200);
    expect(await jobStatus.response.json()).toMatchObject({ status: "succeeded", result_url: "https://storage.example.test/result.mp4" });
    expect(upstream.mock.calls.some(([url]) => String(url) === "https://storage.example.test/signed-upload")).toBe(false);
  });

  it("applies custom log redaction and flexible per-unit pricing", async () => {
    const fixture = await createProjectFixture({ log_policy: "full" });
    await addCredential(fixture);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE system_settings SET setting_value = 'customer_email' WHERE setting_key = 'custom_redaction_fields'",
      ),
      env.DB.prepare(
        `UPDATE models SET fixed_cost_cents = 0, input_cost_microunits = 0,
         output_cost_microunits = 0, billing_unit = 'image', unit_cost_microunits = 2000000
         WHERE id = ?`,
      ).bind(fixture.model.id),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({
        data: [{ url: "https://cdn.example.test/1.png" }, { url: "https://cdn.example.test/2.png" }],
        customer_email: "response@example.test",
      }), { status: 200, headers: { "content-type": "application/json" } })),
    );

    const response = await gatewayRequest(fixture, {
      model: fixture.model.alias,
      messages: [{ role: "user", content: "hello", customer_email: "nested@example.test" }],
      customer_email: "request@example.test",
      n: 2,
    });
    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT estimated_cost_cents, request_metadata, response_metadata FROM requests WHERE project_id = ? ORDER BY started_at DESC LIMIT 1",
    ).bind(fixture.id).first<{ estimated_cost_cents: number; request_metadata: string; response_metadata: string }>();
    expect(row?.estimated_cost_cents).toBe(4);
    expect(JSON.parse(row!.request_metadata)).toMatchObject({
      customer_email: "[redacted]",
      messages: [{ customer_email: "[redacted]" }],
    });
    expect(JSON.parse(row!.response_metadata)).toMatchObject({
      customer_email: "[redacted]",
    });
  });

  it("signs and records project webhook deliveries without exposing the signing secret", async () => {
    const fixture = await createProjectFixture();
    const webhook = await jsonRequest<{ signing_secret: string; webhook: { id: string } }>(
      `/admin/api/projects/${fixture.id}/webhooks`,
      "POST",
      {
        name: "Project events",
        url: "https://hooks.example.test/openpass",
        event_types: ["request.completed"],
      },
    );
    expect(webhook.response.status).toBe(201);
    expect(webhook.data.signing_secret).toMatch(/^whsec_/);
    const delivery = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://hooks.example.test/openpass");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-openpass-signature")).toMatch(/^v1=[a-f0-9]{64}$/);
      expect(headers.get("x-openpass-timestamp")).toMatch(/^\d+$/);
      expect(headers.get("x-apihub-signature")).toMatch(/^v1=[a-f0-9]{64}$/);
      expect(headers.get("x-apihub-timestamp")).toMatch(/^\d+$/);
      const payload = JSON.parse(String(init?.body)) as { type: string; project_id: string; data: { status: string } };
      expect(payload).toMatchObject({
        type: "request.completed",
        project_id: fixture.id,
        data: { status: "failed" },
      });
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", delivery);

    const response = await gatewayRequest(fixture);
    expect(response.status).toBe(503);
    expect(delivery).toHaveBeenCalledOnce();
    const stored = await env.DB.prepare(
      `SELECT d.status, d.attempt_count, d.http_status, w.encrypted_secret
       FROM webhook_deliveries d JOIN project_webhooks w ON w.id = d.webhook_id
       WHERE d.project_id = ?`,
    ).bind(fixture.id).first<{ status: string; attempt_count: number; http_status: number; encrypted_secret: string }>();
    expect(stored).toMatchObject({ status: "delivered", attempt_count: 1, http_status: 204 });
    expect(stored?.encrypted_secret).not.toContain(webhook.data.signing_secret);
  });

  it("emits alert.created webhooks when a project crosses usage thresholds", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture);
    await env.DB.prepare("UPDATE project_limits SET daily_request_limit = 1 WHERE project_id = ?")
      .bind(fixture.id)
      .run();
    await jsonRequest(
      `/admin/api/projects/${fixture.id}/webhooks`,
      "POST",
      {
        name: "Alert events",
        url: "https://hooks.example.test/alerts",
        event_types: ["alert.created"],
      },
    );
    const deliveredAlerts: Array<{ type: string; data: { type: string } }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "https://hooks.example.test/alerts") {
        deliveredAlerts.push(JSON.parse(String(init?.body)) as { type: string; data: { type: string } });
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ usage: { prompt_tokens: 1, completion_tokens: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    expect((await gatewayRequest(fixture)).status).toBe(200);
    expect(deliveredAlerts).toHaveLength(2);
    expect(deliveredAlerts.every((event) => event.type === "alert.created")).toBe(true);
    expect(deliveredAlerts.map((event) => event.data.type)).toEqual(expect.arrayContaining([
      "usage_daily_request_warning",
      "usage_daily_request_critical",
    ]));
    const deliveries = await env.DB.prepare(
      "SELECT status, attempt_count FROM webhook_deliveries WHERE project_id = ? AND event_type = 'alert.created'",
    ).bind(fixture.id).all<{ status: string; attempt_count: number }>();
    expect(deliveries.results).toHaveLength(2);
    expect(deliveries.results.every((delivery) => delivery.status === "delivered" && delivery.attempt_count === 1)).toBe(true);
  });

  it("returns explicit errors for missing, expired, paused, and unauthorized access", async () => {
    const fixture = await createProjectFixture();

    const missing = await callWorker("/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: fixture.model.alias, messages: [] }),
      headers: { "content-type": "application/json" },
    });
    expect(missing.response.status).toBe(401);
    expect(await missing.response.json<{ error: { code: string } }>()).toMatchObject({
      error: { code: "INVALID_API_KEY" },
    });

    await env.DB.prepare("UPDATE virtual_keys SET expires_at = datetime('now', '-1 hour') WHERE project_id = ?")
      .bind(fixture.id)
      .run();
    const expired = await gatewayRequest(fixture);
    expect(expired.status).toBe(401);
    expect(await expired.json<{ error: { code: string } }>()).toMatchObject({
      error: { code: "API_KEY_EXPIRED" },
    });

    await env.DB.prepare("UPDATE virtual_keys SET expires_at = NULL WHERE project_id = ?").bind(fixture.id).run();
    await env.DB.prepare("UPDATE projects SET status = 'paused' WHERE id = ?").bind(fixture.id).run();
    expect((await gatewayRequest(fixture)).status).toBe(403);

    await env.DB.prepare("UPDATE projects SET status = 'active' WHERE id = ?").bind(fixture.id).run();
    const otherModel = await env.DB.prepare("SELECT alias FROM models WHERE id != ? AND status = 'active' LIMIT 1")
      .bind(fixture.model.id)
      .first<{ alias: string }>();
    if (otherModel) {
      const forbidden = await gatewayRequest(fixture, { model: otherModel.alias, messages: [] });
      expect(forbidden.status).toBe(403);
      expect(await forbidden.json<{ error: { code: string } }>()).toMatchObject({
        error: { code: "MODEL_NOT_ALLOWED" },
      });
    }
  });

  it("uses the project default model, degrades to the next compatible model, and exposes each attempt", async () => {
    const models = await env.DB.prepare(
      `SELECT m.id, m.provider_id, m.alias, m.provider_model_id, m.request_type
       FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE m.status = 'active' AND p.status = 'active' AND p.deleted_at IS NULL AND m.request_type = 'chat'
       ORDER BY m.provider_id, m.id`,
    ).all<{ id: string; provider_id: string; alias: string; provider_model_id: string; request_type: string }>();
    const primary = models.results[0];
    const fallback = models.results.find((model) => model.provider_id !== primary.provider_id);
    expect(primary).toBeTruthy();
    expect(fallback).toBeTruthy();

    const created = await jsonRequest<{ project: { id: string }; virtual_key: string }>("/admin/api/projects", "POST", {
      name: "Fallback Project",
      slug: `fallback-${crypto.randomUUID().slice(0, 8)}`,
      model_ids: [primary.id, fallback!.id],
      default_model_id: primary.id,
      model_fallback_enabled: true,
      model_aliases: { [primary.id]: "preferred", [fallback!.id]: "economy" },
      fallback_order: [primary.id, fallback!.id],
      limits: { rpm_limit: 60, concurrency_limit: 5 },
    });
    const fixture = { id: created.data.project.id, key: created.data.virtual_key, model: primary };
    await jsonRequest(`/admin/api/providers/${fallback!.provider_id}/credentials`, "POST", {
      name: "Fallback credential",
      secret: "sk-fallback",
      priority: 0,
    });
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).model).toBe(fallback!.provider_model_id);
      return new Response('{"usage":{"prompt_tokens":1,"completion_tokens":1}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", upstream);

    const response = await gatewayRequest(fixture, { messages: [{ role: "user", content: "hello" }] });
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    const requestRow = await env.DB.prepare(
      "SELECT id, model_id, provider_id, failover_attempts FROM requests WHERE project_id = ? ORDER BY started_at DESC LIMIT 1",
    ).bind(fixture.id).first<{ id: string; model_id: string; provider_id: string; failover_attempts: number }>();
    expect(requestRow).toMatchObject({
      model_id: fallback!.id,
      provider_id: fallback!.provider_id,
      failover_attempts: 1,
    });
    const detail = await jsonRequest<{ attempts: Array<{ attempt_number: number; status: string; model_alias: string }> }>(
      `/admin/api/requests/${requestRow!.id}`,
    );
    expect(detail.data.attempts).toEqual([
      expect.objectContaining({ attempt_number: 1, status: "failed", model_alias: primary.alias }),
      expect.objectContaining({ attempt_number: 2, status: "succeeded", model_alias: fallback!.alias }),
    ]);
  });

  it("keeps the previous virtual key valid during rotation grace and rejects it after the deadline", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"usage":{"prompt_tokens":1,"completion_tokens":1}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      })),
    );
    const original = await env.DB.prepare("SELECT id FROM virtual_keys WHERE project_id = ? ORDER BY created_at LIMIT 1")
      .bind(fixture.id).first<{ id: string }>();
    await jsonRequest(`/admin/api/virtual-keys/${original!.id}/rotate`, "POST", { grace_period_minutes: 10 });

    expect((await gatewayRequest(fixture)).status).toBe(200);
    await env.DB.prepare("UPDATE virtual_keys SET rotation_expires_at = datetime('now', '-1 minute') WHERE id = ?")
      .bind(original!.id).run();
    const expired = await gatewayRequest(fixture);
    expect(expired.status).toBe(403);
    expect(await expired.json<{ error: { code: string } }>()).toMatchObject({
      error: { code: "API_KEY_ROTATION_EXPIRED" },
    });
  });

  it("enforces project IP block and allow rules before contacting a provider", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture);
    const blocked = await jsonRequest<{ ip_rule: { id: string } }>(
      `/admin/api/projects/${fixture.id}/ip-rules`,
      "POST",
      { rule_type: "block", value: "203.0.113.0/24" },
    );
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const denied = await gatewayRequest(fixture);
    expect(denied.status).toBe(403);
    expect(await denied.json<{ error: { code: string } }>()).toMatchObject({ error: { code: "IP_BLOCKED" } });
    expect(upstream).not.toHaveBeenCalled();
    expect(await env.DB.prepare("SELECT status, error_code FROM requests WHERE project_id = ? ORDER BY started_at DESC LIMIT 1")
      .bind(fixture.id).first()).toEqual({ status: "rejected", error_code: "IP_BLOCKED" });

    await jsonRequest(`/admin/api/ip-rules/${blocked.data.ip_rule.id}`, "DELETE");
    await jsonRequest(`/admin/api/projects/${fixture.id}/ip-rules`, "POST", {
      rule_type: "allow",
      value: "198.51.100.0/24",
    });
    const notAllowed = await gatewayRequest(fixture);
    expect(notAllowed.status).toBe(403);
    expect(await notAllowed.json<{ error: { code: string } }>()).toMatchObject({ error: { code: "IP_NOT_ALLOWED" } });
  });

  it("marks requests failed when no credential is available", async () => {
    const fixture = await createProjectFixture();
    const result = await callWorker("/v1/chat/completions", {
      method: "POST",
      headers: bearer(fixture.key),
      body: JSON.stringify({ model: fixture.model.alias, messages: [] }),
    });
    expect(result.response.status).toBe(503);
    await result.response.text();

    const row = await env.DB.prepare(
      "SELECT status, error_code FROM requests WHERE project_id = ? ORDER BY started_at DESC LIMIT 1",
    )
      .bind(fixture.id)
      .first<{ status: string; error_code: string }>();
    expect(row).toEqual({ status: "failed", error_code: "PROVIDER_UNAVAILABLE" });
  });

  it("fails over to the next credential and records the attempt", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture, "sk-second", 1);

    // New provider configuration allows only one usable key. Keep this gateway
    // regression test for installations that still contain a legacy second row.
    const first = { id: crypto.randomUUID() };
    const timestamp = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO provider_credentials
       (id, provider_id, name, encrypted_secret, secret_last4, status, weight, priority,
        health_status, consecutive_failures, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 1, 0, 'healthy', 0, ?, ?)`,
    )
      .bind(
        first.id,
        fixture.model.provider_id,
        "legacy-failover-key",
        await encryptSecret("sk-first", env.CREDENTIAL_ENCRYPTION_KEY),
        "irst",
        timestamp,
        timestamp,
      )
      .run();

    const upstream = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"bad key"}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response('{"usage":{"prompt_tokens":1,"completion_tokens":1}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", upstream);

    expect((await gatewayRequest(fixture)).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(
      upstream.mock.calls.map((call) => new Headers(call[1]?.headers).get("authorization")),
    ).toEqual(["Bearer sk-first", "Bearer sk-second"]);

    const requestRow = await env.DB.prepare(
      "SELECT status, failover_attempts FROM requests WHERE project_id = ? ORDER BY started_at DESC LIMIT 1",
    )
      .bind(fixture.id)
      .first<{ status: string; failover_attempts: number }>();
    expect(requestRow).toEqual({ status: "succeeded", failover_attempts: 1 });

    const firstCredential = await env.DB.prepare("SELECT health_status FROM provider_credentials WHERE id = ?")
      .bind(first.id)
      .first<{ health_status: string }>();
    expect(firstCredential?.health_status).toBe("auth_failed");
  });

  it("surfaces a sanitized provider quota error and records the credential state", async () => {
    const fixture = await createProjectFixture();
    const credential = await addCredential(fixture, "sk-quota-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({
          error: {
            code: "insufficient_quota",
            type: "insufficient_quota",
            message: "Quota exhausted for sk-sensitive-material-123456789.",
          },
        }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await gatewayRequest(fixture);
    expect(response.status).toBe(429);
    expect(await response.json<{ error: { code: string; message: string } }>()).toMatchObject({
      error: {
        code: "PROVIDER_QUOTA_EXCEEDED",
        message: "Provider returned HTTP 429: Quota exhausted for [REDACTED].",
      },
    });
    const state = await env.DB.prepare(
      "SELECT health_status, consecutive_failures, circuit_open_until, last_error FROM provider_credentials WHERE id = ?",
    ).bind(credential.id).first<{
      health_status: string;
      consecutive_failures: number;
      circuit_open_until: string | null;
      last_error: string | null;
    }>();
    expect(state?.health_status).toBe("out_of_credit");
    expect(state?.consecutive_failures).toBe(1);
    expect(state?.circuit_open_until).toBeTruthy();
    expect(state?.last_error).not.toContain("sk-sensitive-material");
  });

  it("enforces the daily request quota and writes a rejected request", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture);
    await env.DB.prepare("UPDATE project_limits SET daily_request_limit = 1 WHERE project_id = ?")
      .bind(fixture.id)
      .run();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response('{"usage":{"prompt_tokens":1,"completion_tokens":1}}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    expect((await gatewayRequest(fixture)).status).toBe(200);
    const rejected = await gatewayRequest(fixture);
    expect(rejected.status).toBe(429);
    expect(await rejected.json<{ error: { code: string } }>()).toMatchObject({
      error: { code: "DAILY_LIMIT_EXCEEDED" },
    });

    const statuses = await env.DB.prepare(
      "SELECT status FROM requests WHERE project_id = ? ORDER BY started_at",
    )
      .bind(fixture.id)
      .all<{ status: string }>();
    expect(statuses.results.map((row) => row.status)).toEqual(["succeeded", "rejected"]);
  });

  it("creates and refreshes an asynchronous job", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture);
    await env.DB.prepare("UPDATE models SET request_type = 'image' WHERE id = ?").bind(fixture.model.id).run();
    const provider = await env.DB.prepare("SELECT base_url FROM providers WHERE id = ?")
      .bind(fixture.model.provider_id)
      .first<{ base_url: string }>();
    const origin = new URL(provider!.base_url).origin;

    const upstream = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "provider-job-1",
            status_url: `${origin}/jobs/provider-job-1`,
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "completed", result_url: "https://cdn.example.test/result.png" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", upstream);

    const create = await callWorker("/v1/images/generations", {
      method: "POST",
      headers: bearer(fixture.key),
      body: JSON.stringify({ model: fixture.model.alias, prompt: "a lighthouse" }),
    });
    expect(create.response.status).toBe(202);
    const created = await create.response.json<{ id: string }>();
    await waitOnExecutionContext(create.context);

    const refresh = await callWorker(`/v1/jobs/${created.id}`, {
      headers: bearer(fixture.key),
    });
    expect(refresh.response.status).toBe(200);
    expect(await refresh.response.json<{ status: string; result_url: string }>()).toMatchObject({
      status: "succeeded",
      result_url: "https://cdn.example.test/result.png",
    });
  });

  it("normalizes a synchronous video task response into an asynchronous job", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture);
    await env.DB.prepare("UPDATE models SET request_type = 'video' WHERE id = ?").bind(fixture.model.id).run();

    const upstream = vi
      .fn()
      .mockImplementationOnce(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/contents/generations/tasks");
        return new Response(JSON.stringify({ id: "cgt-video-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          id: "cgt-video-1",
          status: "succeeded",
          content: { video_url: "https://cdn.example.test/video.mp4" },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", upstream);

    const create = await callWorker("/v1/videos/generations", {
      method: "POST",
      headers: bearer(fixture.key),
      body: JSON.stringify({
        model: fixture.model.alias,
        content: [{ type: "text", text: "a paper boat" }],
        duration: 5,
      }),
    });
    expect(create.response.status).toBe(202);
    const created = await create.response.json<{ id: string; provider_job_id: string }>();
    expect(created.provider_job_id).toBe("cgt-video-1");
    await waitOnExecutionContext(create.context);

    const refresh = await callWorker(`/v1/jobs/${created.id}`, {
      headers: bearer(fixture.key),
    });
    expect(refresh.response.status).toBe(200);
    expect(await refresh.response.json<{ status: string; result_url: string }>()).toMatchObject({
      status: "succeeded",
      result_url: "https://cdn.example.test/video.mp4",
    });
  });

  it("records native provider video task proxy calls as asynchronous jobs", async () => {
    const fixture = await createProjectFixture();
    await addCredential(fixture);
    await env.DB.prepare("UPDATE models SET request_type = 'video' WHERE id = ?").bind(fixture.model.id).run();

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/contents/generations/tasks");
      return new Response(JSON.stringify({ id: "proxy-video-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));

    const create = await callWorker("/v1/proxy/openai/contents/generations/tasks", {
      method: "POST",
      headers: bearer(fixture.key),
      body: JSON.stringify({
        model: fixture.model.alias,
        content: [{ type: "text", text: "a paper boat" }],
      }),
    });

    expect(create.response.status).toBe(202);
    expect(await create.response.json<{ provider_job_id: string }>()).toMatchObject({
      provider_job_id: "proxy-video-1",
    });
    const job = await env.DB.prepare("SELECT type, provider_job_id, status FROM jobs WHERE provider_job_id = ?")
      .bind("proxy-video-1")
      .first<{ type: string; provider_job_id: string; status: string }>();
    expect(job).toMatchObject({
      type: "video_generation",
      provider_job_id: "proxy-video-1",
      status: "processing",
    });
  });
});
