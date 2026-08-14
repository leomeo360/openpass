export type Env = Omit<Cloudflare.Env, "ENVIRONMENT"> & {
  ENVIRONMENT: string;
  AUTH_MODE?: string;
  ADMIN_EMAILS?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  AUTH_SESSION_SECRET?: string;
  REGISTRATION_ENABLED?: string;
  OAUTH_PUBLIC_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  CREDENTIAL_ENCRYPTION_KEY: string;
};

export type ProjectStatus = "active" | "paused" | "disabled";
export type KeyStatus = "active" | "disabled" | "revoked" | "rotating";

export interface ProjectLimits {
  rpm_limit: number;
  concurrency_limit: number;
  daily_request_limit: number | null;
  monthly_request_limit: number | null;
  daily_cost_limit_cents: number | null;
  monthly_cost_limit_cents: number | null;
}

export interface AuthenticatedProject extends ProjectLimits {
  project_id: string;
  project_name: string;
  project_slug: string;
  project_status: ProjectStatus;
  log_policy: "metadata" | "request" | "full";
  ip_logging: "full" | "masked" | "none";
  virtual_key_id: string;
  virtual_key_status: KeyStatus;
  virtual_key_expires_at: string | null;
  virtual_key_rotation_expires_at: string | null;
}

export interface ModelRoute {
  model_id: string;
  model_name: string;
  model_alias: string;
  project_alias: string | null;
  request_type: string;
  fallback_priority: number;
  provider_model_id: string;
  fixed_cost_cents: number;
  input_cost_microunits: number;
  output_cost_microunits: number;
  billing_unit: "token" | "request" | "image" | "second" | "minute" | "audio_minute";
  unit_cost_microunits: number;
  project_daily_cost_limit_cents: number | null;
  project_monthly_cost_limit_cents: number | null;
  price_version: string;
  provider_id: string;
  provider_name: string;
  provider_slug: string;
  base_url: string;
  adapter_type: string;
  timeout_ms: number;
  retry_count: number;
}

export interface CredentialRoute {
  id: string;
  name: string;
  encrypted_secret: string;
  status: "active" | "disabled" | "unhealthy";
  health_status: "healthy" | "rate_limited" | "out_of_credit" | "auth_failed" | "unhealthy";
  priority: number;
  weight: number;
  rpm_limit: number | null;
  daily_request_limit: number | null;
  circuit_open_until: string | null;
}

export interface LimitReservation {
  requestId: string;
  estimatedCostCents: number;
  limits: ProjectLimits;
  modelId: string;
  modelDailyCostLimitCents: number | null;
  modelMonthlyCostLimitCents: number | null;
}

export interface LimitDecision {
  allowed: boolean;
  code?: "RATE_LIMIT_EXCEEDED" | "CONCURRENCY_LIMIT_EXCEEDED" | "DAILY_LIMIT_EXCEEDED" | "MONTHLY_LIMIT_EXCEEDED" | "MODEL_DAILY_LIMIT_EXCEEDED" | "MODEL_MONTHLY_LIMIT_EXCEEDED";
}
