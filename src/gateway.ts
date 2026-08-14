import { decryptSecret } from "./lib/crypto";
import { ApiError, json } from "./lib/http";
import { authenticateProject, credentialsFor, enforceProjectIpRules, fallbackModels, now, recordedIp, resolveModel, resolveModelEntry } from "./services";
import type { AuthenticatedProject, CredentialRoute, Env, LimitDecision, ModelRoute } from "./types";
import { queueProjectWebhook } from "./webhooks";

const openAiEndpoints = new Set(["/v1/chat/completions", "/v1/responses", "/v1/images/generations", "/v1/videos/generations", "/v1/embeddings"]);
const maxLogMetadataBytes = 64_000;

async function safeQueueProjectWebhook(
  env: Env,
  ctx: ExecutionContext,
  projectId: string,
  eventType: "request.completed" | "job.completed" | "alert.created",
  eventId: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await queueProjectWebhook(env, ctx, projectId, eventType, eventId, data);
  } catch (error) {
    console.error(JSON.stringify({
      event: "webhook_queue_failed",
      project_id: projectId,
      event_type: eventType,
      event_id: eventId,
      error: String(error),
    }));
  }
}

export async function handleGateway(request: Request, env: Env, ctx: ExecutionContext, id: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/v1/models") return listProjectModels(request, env, id);
  if (request.method === "GET" && /^\/v1\/jobs\/[^/]+$/.test(url.pathname)) return jobStatus(request, env, ctx, id, url.pathname.split("/").at(-1) ?? "");
  if (request.method === "POST" && url.pathname === "/v1/images/watermark-removals") return removeImageWatermark(request, env, id);
  if (request.method === "POST" && url.pathname === "/v1/uploads") return createDewatermarkUpload(request, env, id);
  if (request.method === "POST" && (url.pathname === "/v1/videos/watermark-removals" || url.pathname === "/v1/documents/watermark-removals")) return submitDewatermarkUpload(request, env, ctx, id);
  const proxy = proxyTarget(url.pathname);
  if (request.method !== "POST" || (!openAiEndpoints.has(url.pathname) && !proxy)) throw new ApiError(404, "NOT_FOUND", "The requested gateway endpoint does not exist.");

  const maxBytes = safeMaxBodyBytes(env.MAX_REQUEST_BODY_BYTES);
  const { readJsonBody } = await import("./lib/http");
  const payload = await readJsonBody(request, maxBytes);
  const requestedModel = typeof payload.model === "string" ? payload.model : "";

  const project = await authenticateProject(request, env);
  const redactionFields = project.log_policy === "full" ? await customRedactionFields(env) : new Set<string>();
  try {
    await enforceProjectIpRules(env, project.project_id, request);
  } catch (error) {
    if (error instanceof ApiError) {
      await recordAccessRejected(env, id, request, project, error.code, error.status);
      await safeQueueProjectWebhook(env, ctx, project.project_id, "request.completed", id, { request_id: id, status: "rejected", http_status: error.status, error_code: error.code });
    }
    throw error;
  }
  const entryCandidates = proxy ? null : await resolveModelEntry(env, project.project_id, requestedModel);
  const model = entryCandidates?.[0] ?? await resolveModel(env, project.project_id, requestedModel);
  if (proxy && proxy.providerSlug !== model.provider_slug) throw new ApiError(403, "MODEL_NOT_ALLOWED", "The selected model does not belong to the requested provider.");
  enforceEndpointModelType(url.pathname, proxy?.endpoint, model);
  const modelCandidates = proxy ? [model] : entryCandidates ?? [model, ...await fallbackModels(env, project.project_id, model)];
  const limiter = env.PROJECT_LIMITER.getByName(project.project_id) as unknown as {
    reserve(input: { requestId: string; estimatedCostCents: number; limits: AuthenticatedProject; modelId: string; modelDailyCostLimitCents: number | null; modelMonthlyCostLimitCents: number | null }): Promise<LimitDecision>;
    complete(requestId: string, chargedCostCents: number, modelId: string): Promise<void>;
  };
  const reservedCost = Math.max(...modelCandidates.map((candidate) => defaultUsageCost(candidate, payload).costCents));
  let decision: LimitDecision;
  try {
    decision = await limiter.reserve({ requestId: id, estimatedCostCents: reservedCost, limits: project, modelId: model.model_id, modelDailyCostLimitCents: model.project_daily_cost_limit_cents, modelMonthlyCostLimitCents: model.project_monthly_cost_limit_cents });
  } catch (error) {
    console.error(JSON.stringify({ event: "quota_check_failed", request_id: id, project_id: project.project_id, error: String(error) }));
    const policy = await quotaFailurePolicy(env).catch((settingError) => {
      console.error(JSON.stringify({ event: "quota_policy_read_failed", request_id: id, project_id: project.project_id, error: String(settingError) }));
      return "deny" as const;
    });
    await recordQuotaSystemAlert(env, ctx, project.project_id, policy).catch((alertError) => {
      console.error(JSON.stringify({ event: "quota_alert_write_failed", request_id: id, project_id: project.project_id, error: String(alertError) }));
    });
    if (policy !== "allow") {
      await recordSystemRejected(env, id, request, project, model, 503, "QUOTA_CHECK_UNAVAILABLE", "The project quota service is temporarily unavailable.");
      await safeQueueProjectWebhook(env, ctx, project.project_id, "request.completed", id, { request_id: id, status: "rejected", http_status: 503, error_code: "QUOTA_CHECK_UNAVAILABLE" });
      throw new ApiError(503, "QUOTA_CHECK_UNAVAILABLE", "The project quota service is temporarily unavailable.");
    }
    decision = { allowed: true };
  }
  if (!decision.allowed) {
    await recordRejected(env, id, request, project, model, decision.code ?? "RATE_LIMIT_EXCEEDED");
    await safeQueueProjectWebhook(env, ctx, project.project_id, "request.completed", id, { request_id: id, status: "rejected", http_status: 429, error_code: decision.code ?? "RATE_LIMIT_EXCEEDED" });
    throw new ApiError(429, decision.code ?? "RATE_LIMIT_EXCEEDED", limitMessage(decision.code));
  }

  const startedAt = now();
  const startMs = Date.now();
  await env.DB.prepare(
    `INSERT INTO requests(id, project_id, virtual_key_id, provider_id, model_id, endpoint, method, status, source_ip, source_ip_policy, source_country, user_agent, started_at, estimated_cost_cents, price_version, request_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, project.project_id, project.virtual_key_id, model.provider_id, model.model_id, url.pathname, request.method,
    recordedIp(request, project.ip_logging), project.ip_logging, request.cf?.country ?? null, request.headers.get("user-agent")?.slice(0, 500) ?? null,
    startedAt, reservedCost, model.price_version, metadataJson(requestMetadata({ ...payload, model: requestedModel || model.project_alias || model.model_alias }, project.log_policy, redactionFields)),
  ).run();

  let upstream: Response | undefined;
  let selected: CredentialRoute | undefined;
  let selectedModel: ModelRoute | undefined;
  let lastFailure: { status: number; message: string; code: string } | undefined;
  let attemptNumber = 0;
  for (const candidate of modelCandidates) {
    const credentials = await credentialsFor(env, candidate.provider_id);
    if (!credentials.length) {
      attemptNumber += 1;
      lastFailure = { status: 503, code: "PROVIDER_UNAVAILABLE", message: `No healthy credential is available for ${candidate.provider_name}.` };
      await recordAttempt(env, id, attemptNumber, candidate, null, "failed", 503, 0, lastFailure.code, lastFailure.message, now(), now());
      continue;
    }
    const maxAttempts = Math.min(credentials.length, Math.max(1, candidate.retry_count + 1));
    for (const credential of credentials.slice(0, maxAttempts)) {
      attemptNumber += 1;
      const attemptStartedAt = now();
      const attemptStartedMs = Date.now();
      const credentialLimiter = env.PROJECT_LIMITER.getByName(`credential:${credential.id}`) as unknown as { reserve(input: { requestId: string; estimatedCostCents: number; limits: AuthenticatedProject; modelId: string; modelDailyCostLimitCents: number | null; modelMonthlyCostLimitCents: number | null }): Promise<LimitDecision>; complete(requestId: string, chargedCostCents: number, modelId: string): Promise<void> };
      const credentialLimitId = `${id}:${credential.id}`;
      const credentialDecision = await credentialLimiter.reserve({ requestId: credentialLimitId, estimatedCostCents: 0, modelId: credential.id, modelDailyCostLimitCents: null, modelMonthlyCostLimitCents: null, limits: { ...project, rpm_limit: credential.rpm_limit ?? 1_000_000, concurrency_limit: 1_000_000, daily_request_limit: credential.daily_request_limit, monthly_request_limit: null, daily_cost_limit_cents: null, monthly_cost_limit_cents: null } });
      if (!credentialDecision.allowed) {
        lastFailure = { status: 429, code: "CREDENTIAL_RATE_LIMIT_EXCEEDED", message: "This provider credential has reached its internal request limit." };
        await recordAttempt(env, id, attemptNumber, candidate, credential, "rejected", 429, Date.now() - attemptStartedMs, lastFailure.code, lastFailure.message, attemptStartedAt, now());
        continue;
      }
      const result = await forwardToProvider(request, env, candidate, credential, payload, proxy ? `${proxy.endpoint}${url.search}` : undefined);
      await credentialLimiter.complete(credentialLimitId, 0, credential.id);
      if (result.ok) {
        await recordAttempt(env, id, attemptNumber, candidate, credential, "succeeded", result.response.status, Date.now() - attemptStartedMs, null, null, attemptStartedAt, now());
        upstream = result.response;
        selected = credential;
        selectedModel = candidate;
        break;
      }
      lastFailure = result.failure;
      await recordAttempt(env, id, attemptNumber, candidate, credential, "failed", result.failure.status, Date.now() - attemptStartedMs, result.failure.code, result.failure.message, attemptStartedAt, now());
      await markCredentialFailure(env, credential.id, result.failure.code, result.failure.message, result.failure.status);
    }
    if (upstream) break;
  }

  if (!upstream || !selected || !selectedModel) {
    const failure = lastFailure ?? { status: 503, code: "PROVIDER_UNAVAILABLE", message: "All provider credentials failed." };
    await settle(env, ctx, limiter, id, project, model, null, failure.status, startMs, failure.code, failure.message, Math.max(0, attemptNumber - 1), defaultUsageCost(model, payload));
    await safeQueueProjectWebhook(env, ctx, project.project_id, "request.completed", id, { request_id: id, status: "failed", http_status: failure.status, error_code: failure.code, model: model.model_alias });
    throw new ApiError(failure.status === 429 ? 429 : failure.status >= 500 ? 503 : 502, failure.code, failure.message);
  }

  ctx.waitUntil(markCredentialSuccess(env, selected.id));
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set("x-request-id", id);
  responseHeaders.delete("set-cookie");
  const usageCost = payload.stream === true ? Promise.resolve(defaultUsageCost(selectedModel, payload)) : usageCostFromResponse(upstream.clone(), selectedModel, payload);
  const responseMetadata = payload.stream === true ? Promise.resolve(null) : responseMetadataFromResponse(upstream.clone(), project.log_policy, redactionFields);
  const finish = async (status: number, errorCode: string | null, errorMessage: string | null): Promise<void> => {
    await settle(env, ctx, limiter, id, project, selectedModel!, selected?.id ?? null, status, startMs, errorCode, errorMessage, Math.max(0, attemptNumber - 1), await usageCost, await responseMetadata);
    await safeQueueProjectWebhook(env, ctx, project.project_id, "request.completed", id, {
      request_id: id,
      status: status >= 200 && status < 400 ? "succeeded" : "failed",
      http_status: status,
      error_code: errorCode,
      model: selectedModel!.model_alias,
    });
  };

  const upstreamEndpoint = proxy?.endpoint ?? url.pathname;
  if (upstream.status === 202 || isAsyncGenerationEndpoint(upstreamEndpoint, selectedModel.request_type, selectedModel.adapter_type)) {
    const job = await createAsyncJob(env, id, project, selectedModel, selected, upstreamEndpoint, upstream);
    await finish(202, null, null);
    return json({ id: job.id, object: "job", status: "processing", provider_job_id: job.providerJobId }, 202, { "x-request-id": id, "x-job-id": job.id });
  }

  if (!upstream.body) {
    await finish(upstream.status, upstream.ok ? null : "UPSTREAM_ERROR", upstream.statusText || null);
    return new Response(null, { status: upstream.status, headers: responseHeaders });
  }
  const { readable, writable } = new TransformStream();
  const pipeline = upstream.body.pipeTo(writable)
    .then(() => finish(upstream!.status, upstream!.ok ? null : "UPSTREAM_ERROR", upstream!.ok ? null : upstream!.statusText))
    .catch(async (error) => {
      await finish(502, "UPSTREAM_STREAM_ERROR", String(error).slice(0, 500));
    });
  ctx.waitUntil(pipeline);
  return new Response(readable, { status: upstream.status, headers: responseHeaders });
}

async function listProjectModels(request: Request, env: Env, id: string): Promise<Response> {
  const project = await authenticateProject(request, env);
  await enforceProjectIpRules(env, project.project_id, request);
  const models = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(pm.project_alias, ''), m.alias) AS public_model,
            m.name, m.request_type, m.created_at, p.name AS provider_name, p.slug AS provider_slug
     FROM project_models pm
     JOIN models m ON m.id = pm.model_id
     JOIN providers p ON p.id = m.provider_id
     WHERE pm.project_id = ? AND pm.status = 'active' AND m.status = 'active'
       AND p.status = 'active' AND p.deleted_at IS NULL
     ORDER BY pm.is_default DESC, pm.fallback_priority ASC, public_model ASC`,
  ).bind(project.project_id).all<{
    public_model: string;
    name: string;
    request_type: string;
    created_at: string;
    provider_name: string;
    provider_slug: string;
  }>();
  const entries = await env.DB.prepare(
    `SELECT e.slug AS public_model, e.name, e.request_type, e.created_at
     FROM model_entries e
     WHERE e.status = 'active'
       AND (e.scope = 'all' OR EXISTS (SELECT 1 FROM model_entry_projects ep WHERE ep.entry_id = e.id AND ep.project_id = ?))
       AND EXISTS (SELECT 1 FROM model_entry_routes er JOIN models m ON m.id = er.model_id JOIN providers p ON p.id = m.provider_id WHERE er.entry_id = e.id AND m.status = 'active' AND p.status = 'active')
     ORDER BY e.slug`,
  ).bind(project.project_id).all<{ public_model: string; name: string; request_type: string; created_at: string }>();
  return json({
    object: "list",
    data: [...models.results.map((model) => ({
      id: model.public_model,
      object: "model",
      created: Math.floor(Date.parse(model.created_at) / 1_000) || 0,
      owned_by: model.provider_slug,
      name: model.name,
      request_type: model.request_type,
      provider: model.provider_name,
    })), ...entries.results.map((entry) => ({
      id: entry.public_model,
      object: "model",
      created: Math.floor(Date.parse(entry.created_at) / 1_000) || 0,
      owned_by: "openpass",
      name: entry.name,
      request_type: entry.request_type,
      provider: "OpenPass model entry",
    }))],
  }, 200, { "x-request-id": id });
}

async function forwardToProvider(
  original: Request,
  env: Env,
  model: ModelRoute,
  credential: CredentialRoute,
  payload: Record<string, unknown>,
  endpoint?: string,
): Promise<{ ok: true; response: Response } | { ok: false; failure: { status: number; code: string; message: string } }> {
  try {
    if (model.adapter_type === "kie") return forwardToKie(env, model, credential, payload);
    if (model.adapter_type !== "openai-compatible" && model.adapter_type !== "custom") {
      return { ok: false, failure: { status: 503, code: "PROVIDER_CONFIGURATION_ERROR", message: "This provider adapter is not implemented." } };
    }
    const secret = await decryptSecret(credential.encrypted_secret, env.CREDENTIAL_ENCRYPTION_KEY);
    const headers = new Headers();
    headers.set("authorization", `Bearer ${secret}`);
    headers.set("content-type", "application/json");
    headers.set("accept", original.headers.get("accept") ?? "application/json");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), model.timeout_ms);
    try {
      const gatewayPath = endpoint ?? new URL(original.url).pathname;
      const response = await fetch(`${model.base_url.replace(/\/$/, "")}${providerPath(model.base_url, gatewayPath)}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, model: model.provider_model_id }),
        signal: controller.signal,
      });
      if (response.ok || (response.status < 500 && response.status !== 401 && response.status !== 429)) return { ok: true, response };
      return { ok: false, failure: await providerFailure(response) };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return { ok: false, failure: { status: timedOut ? 504 : 503, code: timedOut ? "REQUEST_TIMEOUT" : "PROVIDER_UNAVAILABLE", message: timedOut ? "The provider request timed out." : "The provider request failed." } };
  }
}

async function createDewatermarkUpload(request: Request, env: Env, id: string): Promise<Response> {
  const { readJsonBody } = await import("./lib/http");
  const body = await readJsonBody(request, safeMaxBodyBytes(env.MAX_REQUEST_BODY_BYTES));
  const mediaType = body.media_type === "video" || body.media_type === "pdf" ? body.media_type : null;
  const modelName = typeof body.model === "string" ? body.model : "";
  if (!mediaType || !modelName) throw new ApiError(400, "INVALID_REQUEST", "model and media_type (video or pdf) are required.");
  const project = await authenticateProject(request, env);
  await enforceProjectIpRules(env, project.project_id, request);
  const model = await resolveModel(env, project.project_id, modelName);
  if (model.adapter_type !== "dewatermark" || (mediaType === "video" ? model.request_type !== "video" : model.request_type !== "document")) throw new ApiError(403, "MODEL_NOT_ALLOWED", "The selected model does not support this upload type.");
  const credential = (await credentialsFor(env, model.provider_id))[0];
  if (!credential) throw new ApiError(503, "PROVIDER_UNAVAILABLE", `No healthy credential is available for ${model.provider_name}.`);
  const secret = await decryptSecret(credential.encrypted_secret, env.CREDENTIAL_ENCRYPTION_KEY);
  const upstream = await fetch(`${model.base_url.replace(/\/$/, "")}/api/${mediaType}/v1/upload`, { method: "POST", headers: { "x-api-key": secret, accept: "application/json" } });
  if (!upstream.ok) throw new ApiError(503, "PROVIDER_UNAVAILABLE", "The upload provider request failed.");
  const payload = await upstream.json().catch(() => null) as Record<string, unknown> | null;
  const taskId = typeof payload?.task_id === "string" ? payload.task_id : null;
  const uploadUrl = typeof payload?.upload_signed_url === "string" && isHttpsUrl(payload.upload_signed_url) ? payload.upload_signed_url : null;
  const filePath = typeof payload?.file_path === "string" ? payload.file_path : null;
  if (!taskId || !uploadUrl || !filePath) throw new ApiError(502, "PROVIDER_INVALID_RESPONSE", "The upload provider did not return an upload session.");
  const uploadId = `upl_${crypto.randomUUID().replaceAll("-", "")}`;
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  await env.DB.prepare("INSERT INTO upload_sessions(id, project_id, model_id, provider_id, provider_credential_id, provider_task_id, provider_file_path, upload_url, media_type, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uploadId, project.project_id, model.model_id, model.provider_id, credential.id, taskId, filePath, uploadUrl, mediaType, expiresAt, createdAt).run();
  return json({ id: uploadId, object: "upload", media_type: mediaType, upload_url: uploadUrl, upload_method: "PUT", upload_content_type: "application/octet-stream", expires_at: expiresAt }, 201, { "x-request-id": id });
}

async function submitDewatermarkUpload(request: Request, env: Env, ctx: ExecutionContext, id: string): Promise<Response> {
  const { readJsonBody } = await import("./lib/http");
  const body = await readJsonBody(request, safeMaxBodyBytes(env.MAX_REQUEST_BODY_BYTES));
  const uploadId = typeof body.upload_id === "string" ? body.upload_id : "";
  if (!uploadId) throw new ApiError(400, "INVALID_REQUEST", "upload_id is required.");
  const project = await authenticateProject(request, env);
  const expectedType = new URL(request.url).pathname.includes("videos") ? "video" : "pdf";
  const session = await env.DB.prepare("SELECT s.*, p.base_url, pc.encrypted_secret FROM upload_sessions s JOIN providers p ON p.id = s.provider_id JOIN provider_credentials pc ON pc.id = s.provider_credential_id WHERE s.id = ? AND s.project_id = ? AND s.status = 'created' AND s.expires_at > ?")
    .bind(uploadId, project.project_id, now()).first<Record<string, unknown>>();
  if (!session || session.media_type !== expectedType) throw new ApiError(404, "UPLOAD_NOT_FOUND", "Upload session not found, expired, or already submitted.");
  const secret = await decryptSecret(String(session.encrypted_secret), env.CREDENTIAL_ENCRYPTION_KEY);
  const form = new FormData(); form.set("task_id", String(session.provider_task_id));
  const upstream = await fetch(`${String(session.base_url).replace(/\/$/, "")}/api/${expectedType}/v1/tasks`, { method: "POST", headers: { "x-api-key": secret, accept: "application/json" }, body: form });
  if (!upstream.ok) throw new ApiError(503, "PROVIDER_UNAVAILABLE", "The watermark-removal task could not be started.");
  const timestamp = now(), jobId = `job_${crypto.randomUUID().replaceAll("-", "")}`;
  const statusUrl = `${String(session.base_url).replace(/\/$/, "")}/api/${expectedType}/v1/tasks/${encodeURIComponent(String(session.provider_task_id))}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO requests(id, project_id, virtual_key_id, provider_id, provider_credential_id, model_id, endpoint, method, status, source_ip, source_ip_policy, source_country, user_agent, started_at, completed_at, http_status, estimated_cost_cents) VALUES (?, ?, ?, ?, ?, ?, ?, 'POST', 'succeeded', ?, ?, ?, ?, ?, ?, 202, 0)")
      .bind(id, project.project_id, project.virtual_key_id, session.provider_id, session.provider_credential_id, session.model_id, new URL(request.url).pathname, recordedIp(request, project.ip_logging), project.ip_logging, request.cf?.country ?? null, request.headers.get("user-agent")?.slice(0, 500) ?? null, timestamp, timestamp),
    env.DB.prepare("INSERT INTO jobs(id, request_id, project_id, model_id, provider_id, provider_credential_id, provider_job_id, provider_status_url, type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)")
      .bind(jobId, id, project.project_id, session.model_id, session.provider_id, session.provider_credential_id, session.provider_task_id, statusUrl, expectedType === "video" ? "video_watermark_removal" : "pdf_watermark_removal", timestamp, timestamp),
    env.DB.prepare("UPDATE upload_sessions SET status = 'submitted', submitted_at = ? WHERE id = ?").bind(timestamp, uploadId),
  ]);
  await markCredentialSuccess(env, String(session.provider_credential_id));
  return json({ id: jobId, object: "job", status: "processing", provider_job_id: session.provider_task_id }, 202, { "x-request-id": id, "x-job-id": jobId });
}

async function removeImageWatermark(request: Request, env: Env, id: string): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Use multipart/form-data with an image file.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  const maxBytes = safeMaxBodyBytes(env.MAX_REQUEST_BODY_BYTES);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(400, "INVALID_REQUEST", `Request body exceeds ${maxBytes} bytes.`);
  }
  const form = await request.formData();
  const image = form.get("image") ?? form.get("original_preview_image");
  if (!(image instanceof File) || image.size === 0 || image.size > maxBytes || !/^image\/jpeg$/i.test(image.type)) {
    throw new ApiError(400, "INVALID_REQUEST", "image must be a non-empty JPEG file within the configured request size limit.");
  }
  const modelName = form.get("model");
  if (typeof modelName !== "string" || !modelName.trim()) throw new ApiError(400, "INVALID_REQUEST", "model is required.");
  const project = await authenticateProject(request, env);
  await enforceProjectIpRules(env, project.project_id, request);
  const model = await resolveModel(env, project.project_id, modelName);
  if (model.adapter_type !== "dewatermark" || model.request_type !== "image") {
    throw new ApiError(403, "MODEL_NOT_ALLOWED", "The selected model is not an image watermark-removal model.");
  }
  const credential = (await credentialsFor(env, model.provider_id))[0];
  if (!credential) throw new ApiError(503, "PROVIDER_UNAVAILABLE", `No healthy credential is available for ${model.provider_name}.`);
  const upstreamForm = new FormData();
  upstreamForm.set("original_preview_image", image, image.name || "image.jpg");
  for (const field of ["session_id", "mask_base", "remove_text", "predict_mode"] as const) {
    const value = form.get(field);
    if (typeof value === "string" && value.length <= 10_000) upstreamForm.set(field, value);
  }
  const mask = form.get("mask_brush");
  if (mask instanceof File && mask.size > 0 && mask.size <= maxBytes && /^image\/(?:png|jpeg)$/i.test(mask.type)) {
    upstreamForm.set("mask_brush", mask, mask.name || "mask.png");
  }
  const endpoint = model.provider_model_id === "pro" ? "/api/object_removal/v1/erase_watermark_pro" : "/api/object_removal/v3/erase_watermark";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), model.timeout_ms);
  try {
    const secret = await decryptSecret(credential.encrypted_secret, env.CREDENTIAL_ENCRYPTION_KEY);
    const upstream = await fetch(`${model.base_url.replace(/\/$/, "")}${endpoint}`, {
      method: "POST",
      headers: { "x-api-key": secret, accept: "application/json" },
      body: upstreamForm,
      signal: controller.signal,
    });
    if (!upstream.ok) throw new ApiError(upstream.status === 401 ? 502 : 503, "PROVIDER_UNAVAILABLE", "The watermark-removal provider request failed.");
    const payload = await upstream.json().catch(() => null) as Record<string, unknown> | null;
    const edited = payload?.edited_image && typeof payload.edited_image === "object" ? payload.edited_image as Record<string, unknown> : null;
    if (!edited || typeof edited.image !== "string") throw new ApiError(502, "PROVIDER_INVALID_RESPONSE", "The watermark-removal provider did not return an image.");
    await markCredentialSuccess(env, credential.id);
    return json({
      created: Math.floor(Date.now() / 1_000),
      data: [{ b64_json: edited.image }],
      session_id: typeof payload?.session_id === "string" ? payload.session_id : null,
      watermark_mask: typeof edited.watermark_mask === "string" ? edited.watermark_mask : null,
    }, 200, { "x-request-id": id });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new ApiError(timedOut ? 504 : 503, timedOut ? "REQUEST_TIMEOUT" : "PROVIDER_UNAVAILABLE", timedOut ? "The watermark-removal provider request timed out." : "The watermark-removal provider request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function forwardToKie(
  env: Env,
  model: ModelRoute,
  credential: CredentialRoute,
  payload: Record<string, unknown>,
): Promise<{ ok: true; response: Response } | { ok: false; failure: { status: number; code: string; message: string } }> {
  const input = kieInputFor(model, payload);
  try {
    const secret = await decryptSecret(credential.encrypted_secret, env.CREDENTIAL_ENCRYPTION_KEY);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), model.timeout_ms);
    try {
      const response = await fetch(`${model.base_url.replace(/\/$/, "")}/api/v1/jobs/createTask`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ model: model.provider_model_id, input }),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, failure: await providerFailure(response) };
      const body = await response.clone().json().catch(() => null) as { code?: unknown; msg?: unknown; data?: unknown } | null;
      const taskId = body?.data && typeof body.data === "object" && !Array.isArray(body.data) ? (body.data as Record<string, unknown>).taskId : null;
      if (body?.code !== 200 || typeof taskId !== "string" || !taskId) {
        return { ok: false, failure: { status: 502, code: "PROVIDER_INVALID_RESPONSE", message: typeof body?.msg === "string" ? `KIE task creation failed: ${sanitizeProviderMessage(body.msg)}` : "KIE did not return a task ID." } };
      }
      return { ok: true, response };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return { ok: false, failure: { status: timedOut ? 504 : 503, code: timedOut ? "REQUEST_TIMEOUT" : "PROVIDER_UNAVAILABLE", message: timedOut ? "The provider request timed out." : "The provider request failed." } };
  }
}

function kieInputFor(model: ModelRoute, payload: Record<string, unknown>): Record<string, unknown> {
  const prompt = typeof payload.prompt === "string" ? payload.prompt.slice(0, 10_000) : "";
  if (!prompt) throw new ApiError(400, "INVALID_REQUEST", "prompt is required for KIE generation.");
  const input: Record<string, unknown> = { prompt };
  if (model.request_type === "image") {
    if (typeof payload.size === "string" && /^[a-z0-9_:-]{1,32}$/i.test(payload.size)) input.image_size = payload.size;
    if (typeof payload.n === "number" && Number.isInteger(payload.n) && payload.n >= 1 && payload.n <= 4) input.max_images = payload.n;
    const images = Array.isArray(payload.image_urls) ? payload.image_urls : Array.isArray(payload.images) ? payload.images : [];
    const allowedImages = images.filter((value): value is string => typeof value === "string" && isHttpsUrl(value)).slice(0, 8);
    if (allowedImages.length) input.image_urls = allowedImages;
  } else {
    const duration = typeof payload.duration === "number" && Number.isInteger(payload.duration) && [5, 10].includes(payload.duration)
      ? String(payload.duration)
      : "5";
    if (model.provider_model_id.startsWith("kling-2.6/")) {
      // Kling 2.6 requires sound and duration for both video modes. Its image
      // endpoint specifically expects an image_urls array rather than image_url.
      input.sound = payload.sound === true;
      input.duration = duration;
      if (model.provider_model_id === "kling-2.6/image-to-video") {
        if (typeof payload.image_url !== "string" || !isHttpsUrl(payload.image_url)) {
          throw new ApiError(400, "INVALID_REQUEST", "image_url is required for Kling image-to-video generation.");
        }
        input.image_urls = [payload.image_url];
      } else if (typeof payload.size === "string" && /^(?:1:1|16:9|9:16)$/.test(payload.size)) {
        input.aspect_ratio = payload.size;
      } else {
        input.aspect_ratio = "1:1";
      }
    } else {
      if (typeof payload.duration === "number" && Number.isInteger(payload.duration) && payload.duration >= 1 && payload.duration <= 10) input.duration = String(payload.duration);
      if (typeof payload.size === "string" && /^(?:1:1|16:9|9:16)$/.test(payload.size)) input.aspect_ratio = payload.size;
      if (typeof payload.image_url === "string" && isHttpsUrl(payload.image_url)) input.image_url = payload.image_url;
    }
  }
  return input;
}

function isHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

async function providerFailure(response: Response): Promise<{ status: number; code: string; message: string }> {
  const fallback = `Provider returned HTTP ${response.status}.`;
  let upstreamCode = "";
  let upstreamMessage = "";
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      const parsed = JSON.parse(await boundedResponseText(response, 8_192)) as Record<string, unknown>;
      const error = parsed.error && typeof parsed.error === "object" && !Array.isArray(parsed.error)
        ? parsed.error as Record<string, unknown>
        : {};
      upstreamCode = typeof error.code === "string" ? error.code.slice(0, 100) : "";
      upstreamMessage = typeof error.message === "string" ? sanitizeProviderMessage(error.message) : "";
    } catch {
      // A malformed or oversized provider error must not replace the stable gateway fallback.
    }
  }
  const quotaExceeded = response.status === 429 && upstreamCode === "insufficient_quota";
  const code = response.status === 401
    ? "PROVIDER_AUTH_FAILED"
    : quotaExceeded
      ? "PROVIDER_QUOTA_EXCEEDED"
      : response.status === 429
        ? "PROVIDER_RATE_LIMITED"
        : "PROVIDER_UNAVAILABLE";
  return {
    status: response.status,
    code,
    message: upstreamMessage ? `${fallback.slice(0, -1)}: ${upstreamMessage}` : fallback,
  };
}

async function boundedResponseText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function sanitizeProviderMessage(message: string): string {
  return message
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, "Bearer [REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function providerPath(baseUrl: string, gatewayPath: string): string {
  if (gatewayPath === "/v1/videos/generations") gatewayPath = "/v1/contents/generations/tasks";
  const normalized = baseUrl.replace(/\/$/, "");
  return /\/v\d+$/.test(normalized) && gatewayPath.startsWith("/v1/") ? gatewayPath.slice(3) : gatewayPath;
}

function enforceEndpointModelType(pathname: string, proxyEndpoint: string | undefined, model: ModelRoute): void {
  const endpoint = proxyEndpoint ?? pathname;
  const expected = endpoint === "/v1/images/generations"
    ? "image"
    : isVideoGenerationEndpoint(endpoint)
      ? "video"
      : endpoint === "/v1/embeddings"
        ? "embedding"
        : null;
  if (expected && model.request_type !== expected) {
    throw new ApiError(400, "MODEL_TYPE_MISMATCH", `This endpoint requires a ${expected} model.`);
  }
}

function isAsyncGenerationEndpoint(endpoint: string, requestType: string, adapterType: string): boolean {
  return adapterType === "kie" || (requestType === "video" && isVideoGenerationEndpoint(endpoint));
}

function isVideoGenerationEndpoint(endpoint: string): boolean {
  return endpoint === "/v1/videos/generations"
    || endpoint === "/contents/generations/tasks"
    || endpoint === "/v1/contents/generations/tasks";
}

function proxyTarget(pathname: string): { providerSlug: string; endpoint: string } | null {
  const match = /^\/v1\/proxy\/([a-z0-9][a-z0-9_-]{1,62})\/(.+)$/.exec(pathname);
  if (!match) return null;
  const segments = match[2].split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || /%2f|%5c/i.test(segment))) return null;
  return { providerSlug: match[1], endpoint: `/${segments.join("/")}` };
}

async function settle(
  env: Env,
  ctx: ExecutionContext,
  limiter: { complete(requestId: string, chargedCostCents: number, modelId: string): Promise<void> },
  requestId: string,
  project: AuthenticatedProject,
  model: ModelRoute,
  credentialId: string | null,
  httpStatus: number,
  startedMs: number,
  errorCode: string | null,
  errorMessage: string | null,
  failoverAttempts: number,
  usage: { costCents: number; inputTokens: number | null; outputTokens: number | null },
  responseMetadata: string | null = null,
): Promise<void> {
  const succeeded = httpStatus >= 200 && httpStatus < 400;
  const completedAt = now();
  const date = completedAt.slice(0, 10);
  const month = completedAt.slice(0, 7);
  await Promise.all([
    env.DB.prepare("UPDATE requests SET provider_id = ?, provider_credential_id = ?, model_id = ?, status = ?, http_status = ?, completed_at = ?, duration_ms = ?, estimated_cost_cents = ?, input_tokens = ?, output_tokens = ?, price_version = ?, error_code = ?, error_message = ?, failover_attempts = ?, response_metadata = ? WHERE id = ?")
      .bind(model.provider_id, credentialId, model.model_id, succeeded ? "succeeded" : "failed", httpStatus, completedAt, Date.now() - startedMs, succeeded ? usage.costCents : 0, usage.inputTokens, usage.outputTokens, model.price_version, errorCode, errorMessage?.slice(0, 500) ?? null, failoverAttempts, responseMetadata, requestId).run(),
    env.DB.prepare(`INSERT INTO usage_daily(project_id, usage_date, request_count, success_count, failure_count, estimated_cost_cents) VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT(project_id, usage_date) DO UPDATE SET request_count = request_count + 1, success_count = success_count + excluded.success_count, failure_count = failure_count + excluded.failure_count, estimated_cost_cents = estimated_cost_cents + excluded.estimated_cost_cents`)
      .bind(project.project_id, date, succeeded ? 1 : 0, succeeded ? 0 : 1, succeeded ? usage.costCents : 0).run(),
    env.DB.prepare(`INSERT INTO usage_monthly(project_id, usage_month, request_count, success_count, failure_count, estimated_cost_cents) VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT(project_id, usage_month) DO UPDATE SET request_count = request_count + 1, success_count = success_count + excluded.success_count, failure_count = failure_count + excluded.failure_count, estimated_cost_cents = estimated_cost_cents + excluded.estimated_cost_cents`)
      .bind(project.project_id, month, succeeded ? 1 : 0, succeeded ? 0 : 1, succeeded ? usage.costCents : 0).run(),
    env.DB.prepare("UPDATE virtual_keys SET last_used_at = ? WHERE id = ?").bind(completedAt, project.virtual_key_id).run(),
    completeLimiter(limiter, requestId, succeeded ? usage.costCents : 0, model.model_id, project.project_id),
  ]);
  if (succeeded) await recordUsageThresholdAlerts(env, ctx, project.project_id);
}

async function recordUsageThresholdAlerts(env: Env, ctx: ExecutionContext, projectId: string): Promise<void> {
  const [limits, daily, monthly, settings] = await Promise.all([
    env.DB.prepare("SELECT daily_request_limit, monthly_request_limit, daily_cost_limit_cents, monthly_cost_limit_cents FROM project_limits WHERE project_id = ?").bind(projectId).first<Record<string, number | null>>(),
    env.DB.prepare("SELECT request_count, estimated_cost_cents FROM usage_daily WHERE project_id = ? AND usage_date = date('now')").bind(projectId).first<Record<string, number>>(),
    env.DB.prepare("SELECT request_count, estimated_cost_cents FROM usage_monthly WHERE project_id = ? AND usage_month = strftime('%Y-%m', 'now')").bind(projectId).first<Record<string, number>>(),
    env.DB.prepare("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('alert_threshold_warning', 'alert_threshold_critical')").all<{ setting_key: string; setting_value: string }>(),
  ]);
  if (!limits) return;
  const configured = Object.fromEntries(settings.results.map((row) => [row.setting_key, Number(row.setting_value)]));
  const thresholds = [{ label: "warning", percent: configured.alert_threshold_warning || 70 }, { label: "critical", percent: configured.alert_threshold_critical || 90 }];
  const ratios = [
    ["daily_request", daily?.request_count ?? 0, limits.daily_request_limit], ["monthly_request", monthly?.request_count ?? 0, limits.monthly_request_limit],
    ["daily_cost", daily?.estimated_cost_cents ?? 0, limits.daily_cost_limit_cents], ["monthly_cost", monthly?.estimated_cost_cents ?? 0, limits.monthly_cost_limit_cents],
  ] as const;
  const timestamp = now();
  const candidates = ratios.flatMap(([scope, used, limit]) => limit && limit > 0
    ? thresholds.filter(({ percent }) => used / limit * 100 >= percent).map(({ label, percent }) => ({
      id: crypto.randomUUID(),
      type: `usage_${scope}_${label}`,
      severity: label === "critical" ? "critical" : "warning",
      message: `Project usage reached ${percent}% of its ${scope.replaceAll("_", " ")} limit.`,
    }))
    : []);
  if (!candidates.length) return;
  const results = await env.DB.batch(candidates.map((alert) => env.DB.prepare(
    "INSERT INTO alerts(id, project_id, type, severity, message, status, created_at) SELECT ?, ?, ?, ?, ?, 'open', ? WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE project_id = ? AND type = ? AND status = 'open')",
  ).bind(alert.id, projectId, alert.type, alert.severity, alert.message, timestamp, projectId, alert.type)));
  for (let index = 0; index < candidates.length; index += 1) {
    if (results[index].meta.changes > 0) {
      const alert = candidates[index];
      await safeQueueProjectWebhook(env, ctx, projectId, "alert.created", alert.id, {
        alert_id: alert.id,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
      });
    }
  }
}

function defaultUsageCost(model: ModelRoute, requestPayload: Record<string, unknown> = {}): { costCents: number; inputTokens: number | null; outputTokens: number | null } {
  const unitCost = Math.ceil(unitQuantity({}, requestPayload, model.billing_unit) * model.unit_cost_microunits / 1_000_000);
  return { costCents: model.fixed_cost_cents + unitCost, inputTokens: null, outputTokens: null };
}

async function usageCostFromResponse(response: Response, model: ModelRoute, requestPayload: Record<string, unknown>): Promise<{ costCents: number; inputTokens: number | null; outputTokens: number | null }> {
  if (!response.headers.get("content-type")?.includes("application/json")) return defaultUsageCost(model, requestPayload);
  try {
    const body = await response.json() as Record<string, unknown>;
    const usage = body.usage && typeof body.usage === "object" && !Array.isArray(body.usage) ? body.usage as Record<string, unknown> : {};
    const inputTokens = usageNumber(usage, ["prompt_tokens", "input_tokens"]);
    const outputTokens = usageNumber(usage, ["completion_tokens", "output_tokens"]);
    const variableCost = Math.ceil(((inputTokens ?? 0) * model.input_cost_microunits + (outputTokens ?? 0) * model.output_cost_microunits) / 1_000_000);
    const unitCost = Math.ceil(unitQuantity(body, requestPayload, model.billing_unit) * model.unit_cost_microunits / 1_000_000);
    return { costCents: model.fixed_cost_cents + variableCost + unitCost, inputTokens, outputTokens };
  } catch { return defaultUsageCost(model, requestPayload); }
}

function usageNumber(usage: Record<string, unknown>, keys: string[]): number | null { const value = keys.map((key) => usage[key]).find((candidate) => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0); return typeof value === "number" ? Math.floor(value) : null; }

function unitQuantity(body: Record<string, unknown>, requestPayload: Record<string, unknown>, unit: ModelRoute["billing_unit"]): number {
  if (unit === "token") return 0;
  if (unit === "request") return 1;
  const usage = body.usage && typeof body.usage === "object" && !Array.isArray(body.usage) ? body.usage as Record<string, unknown> : {};
  const finite = (...values: unknown[]): number | null => {
    const value = values.find((candidate) => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0);
    return typeof value === "number" ? value : null;
  };
  if (unit === "image") {
    return finite(usage.images, usage.image_count, body.image_count, requestPayload.n, requestPayload.image_count)
      ?? (Array.isArray(body.data) ? body.data.length : 1);
  }
  const seconds = finite(usage.duration_seconds, usage.seconds, body.duration_seconds, body.duration, requestPayload.duration_seconds, requestPayload.duration, requestPayload.seconds);
  if (unit === "second") return seconds ?? 0;
  const minutes = finite(usage.duration_minutes, usage.minutes, body.duration_minutes, requestPayload.duration_minutes, requestPayload.minutes);
  return minutes ?? (seconds === null ? 0 : seconds / 60);
}

async function responseMetadataFromResponse(response: Response, policy: AuthenticatedProject["log_policy"], redactionFields: Set<string>): Promise<string | null> {
  if (policy !== "full" || !response.headers.get("content-type")?.includes("application/json")) return null;
  try { return metadataJson(safeLogValue(await response.json(), 0, redactionFields)); } catch { return null; }
}

async function recordRejected(env: Env, id: string, request: Request, project: AuthenticatedProject, model: ModelRoute, code: string): Promise<void> {
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO requests(id, project_id, virtual_key_id, provider_id, model_id, endpoint, method, status, source_ip, source_ip_policy, source_country, user_agent, started_at, completed_at, http_status, estimated_cost_cents, price_version, error_code, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?, 429, ?, ?, ?, ?)")
      .bind(id, project.project_id, project.virtual_key_id, model.provider_id, model.model_id, new URL(request.url).pathname, request.method, recordedIp(request, project.ip_logging), project.ip_logging, request.cf?.country ?? null, request.headers.get("user-agent")?.slice(0, 500) ?? null, timestamp, timestamp, model.fixed_cost_cents, model.price_version, code, limitMessage(code)),
    env.DB.prepare("INSERT INTO alerts(id, project_id, type, severity, message, status, created_at) SELECT ?, ?, ?, 'warning', ?, 'open', ? WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE project_id = ? AND type = ? AND status = 'open' AND created_at >= datetime('now', '-1 hour'))")
      .bind(crypto.randomUUID(), project.project_id, code, limitMessage(code), timestamp, project.project_id, code),
  ]);
}

async function recordAccessRejected(
  env: Env,
  id: string,
  request: Request,
  project: AuthenticatedProject,
  code: string,
  httpStatus: number,
): Promise<void> {
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO requests(id, project_id, virtual_key_id, endpoint, method, status, source_ip, source_ip_policy,
      source_country, user_agent, started_at, completed_at, http_status, estimated_cost_cents, error_code, error_message)
     VALUES (?, ?, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(
    id,
    project.project_id,
    project.virtual_key_id,
    new URL(request.url).pathname,
    request.method,
    recordedIp(request, project.ip_logging),
    project.ip_logging,
    request.cf?.country ?? null,
    request.headers.get("user-agent")?.slice(0, 500) ?? null,
    timestamp,
    timestamp,
    httpStatus,
    code,
    code === "IP_BLOCKED" ? "This source IP is blocked for the project." : "This source IP is not on the project's allowlist.",
  ).run();
}

async function recordSystemRejected(
  env: Env,
  id: string,
  request: Request,
  project: AuthenticatedProject,
  model: ModelRoute,
  httpStatus: number,
  code: string,
  message: string,
): Promise<void> {
  const timestamp = now();
  await env.DB.prepare(
    `INSERT INTO requests(id, project_id, virtual_key_id, provider_id, model_id, endpoint, method, status,
      source_ip, source_ip_policy, source_country, user_agent, started_at, completed_at, http_status,
      estimated_cost_cents, price_version, error_code, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'rejected', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).bind(
    id,
    project.project_id,
    project.virtual_key_id,
    model.provider_id,
    model.model_id,
    new URL(request.url).pathname,
    request.method,
    recordedIp(request, project.ip_logging),
    project.ip_logging,
    request.cf?.country ?? null,
    request.headers.get("user-agent")?.slice(0, 500) ?? null,
    timestamp,
    timestamp,
    httpStatus,
    model.price_version,
    code,
    message,
  ).run();
}

async function recordAttempt(
  env: Env,
  requestId: string,
  attemptNumber: number,
  model: ModelRoute,
  credential: CredentialRoute | null,
  status: "succeeded" | "failed" | "rejected",
  httpStatus: number,
  durationMs: number,
  errorCode: string | null,
  errorMessage: string | null,
  startedAt: string,
  completedAt: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO request_attempts(id, request_id, attempt_number, model_id, provider_id, provider_credential_id,
      status, http_status, duration_ms, error_code, error_message, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(),
    requestId,
    attemptNumber,
    model.model_id,
    model.provider_id,
    credential?.id ?? null,
    status,
    httpStatus,
    Math.max(0, durationMs),
    errorCode,
    errorMessage?.slice(0, 500) ?? null,
    startedAt,
    completedAt,
  ).run();
}

async function quotaFailurePolicy(env: Env): Promise<"deny" | "allow"> {
  const row = await env.DB.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'quota_failure_policy'")
    .first<{ setting_value: string }>();
  return row?.setting_value === "allow" ? "allow" : "deny";
}

async function recordQuotaSystemAlert(env: Env, ctx: ExecutionContext, projectId: string, policy: "deny" | "allow"): Promise<void> {
  const timestamp = now();
  const alertId = crypto.randomUUID();
  const message = `Quota checks failed; the configured fail-${policy === "allow" ? "open" : "closed"} policy was applied.`;
  const result = await env.DB.prepare(
    `INSERT INTO alerts(id, project_id, type, severity, message, status, created_at)
     SELECT ?, ?, 'quota_service_unavailable', 'critical', ?, 'open', ?
     WHERE NOT EXISTS (
       SELECT 1 FROM alerts WHERE project_id = ? AND type = 'quota_service_unavailable'
       AND status = 'open' AND created_at >= datetime('now', '-1 hour')
     )`,
  ).bind(
    alertId,
    projectId,
    message,
    timestamp,
    projectId,
  ).run();
  if (result.meta.changes > 0) {
    await safeQueueProjectWebhook(env, ctx, projectId, "alert.created", alertId, {
      alert_id: alertId,
      type: "quota_service_unavailable",
      severity: "critical",
      message,
    });
  }
}

async function completeLimiter(
  limiter: { complete(requestId: string, chargedCostCents: number, modelId: string): Promise<void> },
  requestId: string,
  chargedCostCents: number,
  modelId: string,
  projectId: string,
): Promise<void> {
  try {
    await limiter.complete(requestId, chargedCostCents, modelId);
  } catch (error) {
    console.error(JSON.stringify({ event: "quota_settlement_failed", request_id: requestId, project_id: projectId, error: String(error) }));
  }
}

async function markCredentialFailure(env: Env, credentialId: string, code: string, message: string, status: number): Promise<void> {
  const authFailure = status === 401;
  const rateLimited = status === 429;
  const outOfCredit = code === "PROVIDER_QUOTA_EXCEEDED";
  const specialHealth = authFailure ? "auth_failed" : outOfCredit ? "out_of_credit" : rateLimited ? "rate_limited" : null;
  const openDurationMs = authFailure ? 60 * 60_000 : outOfCredit ? 15 * 60_000 : rateLimited ? 60_000 : 5 * 60_000;
  const openUntil = new Date(Date.now() + openDurationMs).toISOString();
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE provider_credentials SET consecutive_failures = consecutive_failures + 1,
      health_status = CASE WHEN ? IS NOT NULL THEN ? WHEN consecutive_failures + 1 >= 3 THEN 'unhealthy' ELSE health_status END,
      circuit_open_until = CASE WHEN ? IS NOT NULL OR consecutive_failures + 1 >= 3 THEN ? ELSE circuit_open_until END,
      last_error = ?, updated_at = ? WHERE id = ?`)
      .bind(specialHealth, specialHealth, specialHealth, openUntil, `${code}: ${message}`.slice(0, 500), timestamp, credentialId),
    env.DB.prepare("INSERT INTO alerts(id, project_id, type, severity, message, status, created_at) SELECT ?, NULL, ?, 'warning', ?, 'open', ? WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE project_id IS NULL AND type = ? AND status = 'open' AND created_at >= datetime('now', '-1 hour'))")
      .bind(crypto.randomUUID(), code, `Credential ${credentialId.slice(0, 8)} failed: ${message}`.slice(0, 500), timestamp, code),
  ]);
}

async function markCredentialSuccess(env: Env, credentialId: string): Promise<void> {
  await env.DB.prepare("UPDATE provider_credentials SET consecutive_failures = 0, health_status = 'healthy', circuit_open_until = NULL, last_error = NULL, last_used_at = ?, updated_at = ? WHERE id = ?")
    .bind(now(), now(), credentialId).run();
}

async function createAsyncJob(
  env: Env,
  requestId: string,
  project: AuthenticatedProject,
  model: ModelRoute,
  credential: CredentialRoute,
  endpoint: string,
  upstream: Response,
): Promise<{ id: string; providerJobId: string | null }> {
  const payload = await upstream.clone().json().catch(() => null) as unknown;
  const providerJobId = providerJobIdFrom(payload);
  const providerStatusUrl = providerStatusUrlFrom(payload, upstream.headers.get("location"), model.base_url, endpoint, providerJobId, model.adapter_type);
  const id = `job_${crypto.randomUUID().replaceAll("-", "")}`;
  const timestamp = now();
  await env.DB.prepare("INSERT INTO jobs(id, request_id, project_id, model_id, provider_id, provider_credential_id, provider_job_id, provider_status_url, type, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)")
    .bind(id, requestId, project.project_id, model.model_id, model.provider_id, credential.id, providerJobId, providerStatusUrl, jobTypeFor(endpoint), timestamp, timestamp).run();
  return { id, providerJobId };
}

function providerJobIdFrom(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  const direct = [source.id, source.job_id, source.task_id, source.taskId];
  const nested = source.data && typeof source.data === "object" && !Array.isArray(source.data) ? [(source.data as Record<string, unknown>).id, (source.data as Record<string, unknown>).job_id, (source.data as Record<string, unknown>).task_id, (source.data as Record<string, unknown>).taskId] : [];
  return [...direct, ...nested].find((value): value is string => typeof value === "string" && value.length > 0) ?? null;
}

function providerStatusUrlFrom(payload: unknown, location: string | null, baseUrl: string, endpoint: string, providerJobId: string | null, adapterType: string): string | null {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const nested = source.data && typeof source.data === "object" && !Array.isArray(source.data) ? source.data as Record<string, unknown> : {};
  const candidate = [location, source.status_url, source.statusUrl, nested.status_url, nested.statusUrl].find((value): value is string => typeof value === "string" && value.length > 0);
  const resolvedCandidate = candidate ?? (adapterType === "kie" && providerJobId
    ? `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(providerJobId)}`
    : (
    providerJobId && isVideoGenerationEndpoint(endpoint)
      ? `contents/generations/tasks/${encodeURIComponent(providerJobId)}`
      : null));
  if (!resolvedCandidate) return null;
  try {
    const base = new URL(baseUrl);
    const target = new URL(resolvedCandidate, `${baseUrl.replace(/\/$/, "")}/`);
    return target.origin === base.origin && target.protocol === "https:" ? target.toString() : null;
  } catch { return null; }
}

function jobTypeFor(endpoint: string): string {
  if (endpoint.includes("images")) return "image_generation";
  if (isVideoGenerationEndpoint(endpoint)) return "video_generation";
  if (endpoint.includes("responses")) return "response";
  return "generation";
}

async function jobStatus(request: Request, env: Env, ctx: ExecutionContext, id: string, jobId: string): Promise<Response> {
  const project = await authenticateProject(request, env);
  let job = await env.DB.prepare(`SELECT j.id, j.request_id, j.project_id, j.provider_job_id, j.provider_status_url, j.status, j.retry_count, j.result_url, j.final_cost_cents, j.created_at, j.updated_at,
    pc.encrypted_secret, p.timeout_ms, p.adapter_type FROM jobs j LEFT JOIN provider_credentials pc ON pc.id = j.provider_credential_id
    LEFT JOIN providers p ON p.id = j.provider_id WHERE j.id = ? AND j.project_id = ?`).bind(jobId, project.project_id).first<Record<string, unknown>>();
  if (!job) throw new ApiError(404, "NOT_FOUND", "Job not found.");
  if ((job.status === "queued" || job.status === "processing") && typeof job.provider_status_url === "string" && typeof job.encrypted_secret === "string" && (job.adapter_type === "openai-compatible" || job.adapter_type === "custom" || job.adapter_type === "kie" || job.adapter_type === "dewatermark")) {
    await refreshJobStatus(env, ctx, job);
    job = await env.DB.prepare("SELECT id, request_id, provider_job_id, status, retry_count, result_url, final_cost_cents, created_at, updated_at FROM jobs WHERE id = ? AND project_id = ?").bind(jobId, project.project_id).first<Record<string, unknown>>();
  }
  return json(job, 200, { "x-request-id": id });
}

async function refreshJobStatus(env: Env, ctx: ExecutionContext, job: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(Number(job.timeout_ms) || 60_000, 1_000), 90_000));
  try {
    const secret = await decryptSecret(String(job.encrypted_secret), env.CREDENTIAL_ENCRYPTION_KEY);
    const headers = new Headers({ accept: "application/json" });
    if (job.adapter_type === "dewatermark") headers.set("x-api-key", secret);
    else headers.set("authorization", `Bearer ${secret}`);
    const response = await fetch(String(job.provider_status_url), { headers, signal: controller.signal });
    if (!response.ok) return;
    const payload = await response.json().catch(() => null) as unknown;
    const update = jobUpdateFrom(payload);
    if (!update) return;
    await env.DB.prepare("UPDATE jobs SET status = ?, result_url = COALESCE(?, result_url), updated_at = ? WHERE id = ?")
      .bind(update.status, update.resultUrl, now(), job.id).run();
    if (["succeeded", "failed", "cancelled", "expired"].includes(update.status)) {
      await safeQueueProjectWebhook(env, ctx, String(job.project_id), "job.completed", String(job.id), {
        job_id: job.id,
        request_id: job.request_id,
        status: update.status,
        result_url: update.resultUrl,
      });
    }
  } catch { /* A polling failure leaves the job processing for the next query. */ }
  finally { clearTimeout(timeout); }
}

function jobUpdateFrom(payload: unknown): { status: "queued" | "processing" | "succeeded" | "failed" | "cancelled" | "expired"; resultUrl: string | null } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const source = payload as Record<string, unknown>;
  const nested = source.data && typeof source.data === "object" && !Array.isArray(source.data) ? source.data as Record<string, unknown> : {};
  const content = source.content && typeof source.content === "object" && !Array.isArray(source.content) ? source.content as Record<string, unknown> : {};
  const raw = [source.status, source.state, nested.status, nested.state].find((value): value is string => typeof value === "string")?.toLowerCase();
  const statuses: Record<string, "queued" | "processing" | "succeeded" | "failed" | "cancelled" | "expired"> = { created: "queued", queued: "queued", pending: "queued", waiting: "queued", queuing: "queued", processing: "processing", running: "processing", generating: "processing", succeeded: "succeeded", success: "succeeded", completed: "succeeded", done: "succeeded", failed: "failed", fail: "failed", error: "failed", cancelled: "cancelled", canceled: "cancelled", expired: "expired" };
  if (!raw || !statuses[raw]) return null;
  const resultJson = typeof nested.resultJson === "string" ? JSON.parse(nested.resultJson) as unknown : null;
  const resultRecord = resultJson && typeof resultJson === "object" && !Array.isArray(resultJson) ? resultJson as Record<string, unknown> : {};
  const resultUrls = Array.isArray(resultRecord.resultUrls) ? resultRecord.resultUrls : [];
  const resultUrl = [source.result_url, source.url, nested.result_url, nested.url, source.download_signed_url, nested.download_signed_url, content.video_url, content.url, ...resultUrls].find((value): value is string => typeof value === "string" && isHttpsUrl(value)) ?? null;
  return { status: statuses[raw], resultUrl };
}

function requestMetadata(payload: Record<string, unknown>, policy: AuthenticatedProject["log_policy"], redactionFields: Set<string>): Record<string, unknown> | null {
  if (policy === "metadata") return { model: payload.model, stream: payload.stream === true };
  if (policy === "request") return { model: payload.model, stream: payload.stream === true, parameter_keys: Object.keys(payload).filter((key) => key !== "messages" && key !== "input") };
  return safeLogValue(payload, 0, redactionFields) as Record<string, unknown>;
}

function safeLogValue(value: unknown, depth = 0, redactionFields = new Set<string>()): unknown {
  if (depth > 7) return "[truncated depth]";
  if (typeof value === "string") return value.length > 8_000 ? `${value.slice(0, 8_000)}…[truncated]` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeLogValue(item, depth + 1, redactionFields));
  if (!value || typeof value !== "object") return String(value);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => (
    /authorization|api.?key|secret|token|cookie/i.test(key) || redactionFields.has(key.toLowerCase())
      ? [key, "[redacted]"]
      : [key, safeLogValue(item, depth + 1, redactionFields)]
  )));
}

async function customRedactionFields(env: Env): Promise<Set<string>> {
  const row = await env.DB.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'custom_redaction_fields'")
    .first<{ setting_value: string }>();
  return new Set((row?.setting_value ?? "").split(/[\n,]/).map((field) => field.trim().toLowerCase()).filter(Boolean).slice(0, 50));
}

function metadataJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxLogMetadataBytes) return serialized;
  return JSON.stringify({
    truncated: true,
    original_bytes: new TextEncoder().encode(serialized).byteLength,
    preview: serialized.slice(0, maxLogMetadataBytes - 1_000),
  });
}

function limitMessage(code: string | undefined): string {
  const messages: Record<string, string> = {
    RATE_LIMIT_EXCEEDED: "The project has exceeded its requests-per-minute limit.",
    CONCURRENCY_LIMIT_EXCEEDED: "The project has exceeded its concurrency limit.",
    DAILY_LIMIT_EXCEEDED: "The project has exceeded its daily usage limit.",
    MONTHLY_LIMIT_EXCEEDED: "The project has exceeded its monthly usage limit.",
    MODEL_DAILY_LIMIT_EXCEEDED: "The project has exceeded this model's daily usage limit.",
    MODEL_MONTHLY_LIMIT_EXCEEDED: "The project has exceeded this model's monthly usage limit.",
  };
  return messages[code ?? ""] ?? "The project has exceeded a usage limit.";
}

function safeMaxBodyBytes(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000_000 ? parsed : 2_097_152;
}
