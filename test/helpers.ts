import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";
import type { Env as AppEnv } from "../src/types";

export const adminEmail = "admin@example.test";

export async function callWorker(
  path: string,
  options: RequestInit & { admin?: boolean; env?: Partial<AppEnv> } = {},
): Promise<{ response: Response; context: ExecutionContext }> {
  const { admin, env: envOverrides, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  if (admin !== false) headers.set("cf-access-authenticated-user-email", adminEmail);
  if (requestOptions.body && !(requestOptions.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  const request = new Request(`https://openpass.test${path}`, { ...requestOptions, headers });
  const context = createExecutionContext();
  const fetchHandler = worker.fetch as (
    request: Request,
    env: AppEnv,
    context: ExecutionContext,
  ) => Promise<Response>;
  const runtimeEnv = Object.assign(Object.create(env), env as unknown as AppEnv, envOverrides ?? {}) as AppEnv;
  const response = await fetchHandler(request, runtimeEnv, context);
  return { response, context };
}

export async function jsonRequest<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
  options: { admin?: boolean; headers?: HeadersInit; env?: Partial<AppEnv> } = {},
): Promise<{ response: Response; data: T }> {
  const result = await callWorker(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    admin: options.admin,
    headers: options.headers,
    env: options.env,
  });
  const data = await result.response.json() as T;
  await waitOnExecutionContext(result.context);
  return { response: result.response, data };
}

export async function firstActiveModel(): Promise<{ id: string; provider_id: string; alias: string }> {
  const row = await env.DB.prepare(
    "SELECT m.id, m.provider_id, m.alias FROM models m JOIN providers p ON p.id = m.provider_id WHERE m.status = 'active' AND p.status = 'active' AND p.deleted_at IS NULL LIMIT 1",
  ).first<{ id: string; provider_id: string; alias: string }>();
  if (!row) throw new Error("Test migrations did not seed an active model.");
  return row;
}

export async function createProjectFixture(overrides: Record<string, unknown> = {}): Promise<{
  id: string;
  key: string;
  model: { id: string; provider_id: string; alias: string };
}> {
  const model = await firstActiveModel();
  const slug = `test-${crypto.randomUUID().slice(0, 8)}`;
  const { response, data } = await jsonRequest<{
    project: { id: string };
    virtual_key: string;
  }>("/admin/api/projects", "POST", {
    name: "Test Project",
    slug,
    model_ids: [model.id],
    limits: { rpm_limit: 60, concurrency_limit: 5 },
    ...overrides,
  });
  if (response.status !== 201) throw new Error(`Unable to create project fixture: ${JSON.stringify(data)}`);
  return { id: data.project.id, key: data.virtual_key, model };
}

export function bearer(key: string): HeadersInit {
  return { authorization: `Bearer ${key}`, "content-type": "application/json" };
}
