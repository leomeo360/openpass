PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  adapter_type TEXT NOT NULL DEFAULT 'openai-compatible',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  retry_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  secret_last4 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'unhealthy')),
  weight INTEGER NOT NULL DEFAULT 1 CHECK(weight > 0),
  priority INTEGER NOT NULL DEFAULT 100,
  rpm_limit INTEGER,
  daily_request_limit INTEGER,
  health_status TEXT NOT NULL DEFAULT 'healthy' CHECK(health_status IN ('healthy', 'rate_limited', 'out_of_credit', 'auth_failed', 'unhealthy')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  circuit_open_until TEXT,
  last_used_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credentials_routing ON provider_credentials(provider_id, status, health_status, priority);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  alias TEXT NOT NULL UNIQUE,
  provider_model_id TEXT NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  fixed_cost_cents INTEGER NOT NULL DEFAULT 0,
  input_cost_microunits INTEGER NOT NULL DEFAULT 0,
  output_cost_microunits INTEGER NOT NULL DEFAULT 0,
  price_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id, status);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT 'production' CHECK(environment IN ('development', 'staging', 'production')),
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'disabled')),
  log_policy TEXT NOT NULL DEFAULT 'metadata' CHECK(log_policy IN ('metadata', 'request', 'full')),
  ip_logging TEXT NOT NULL DEFAULT 'masked' CHECK(ip_logging IN ('full', 'masked', 'none')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_limits (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  rpm_limit INTEGER NOT NULL DEFAULT 60,
  concurrency_limit INTEGER NOT NULL DEFAULT 5,
  daily_request_limit INTEGER,
  monthly_request_limit INTEGER,
  daily_cost_limit_cents INTEGER,
  monthly_cost_limit_cents INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_models (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  is_default INTEGER NOT NULL DEFAULT 0,
  daily_cost_limit_cents INTEGER,
  monthly_cost_limit_cents INTEGER,
  PRIMARY KEY(project_id, model_id)
);

CREATE TABLE IF NOT EXISTS virtual_keys (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  key_last4 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'revoked', 'rotating')),
  expires_at TEXT,
  last_used_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_virtual_keys_project ON virtual_keys(project_id, status);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  virtual_key_id TEXT,
  provider_id TEXT,
  provider_credential_id TEXT,
  model_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing', 'succeeded', 'failed', 'rejected')),
  http_status INTEGER,
  source_ip TEXT,
  source_country TEXT,
  user_agent TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  price_version TEXT,
  error_code TEXT,
  error_message TEXT,
  failover_attempts INTEGER NOT NULL DEFAULT 0,
  request_metadata TEXT,
  response_metadata TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  FOREIGN KEY(virtual_key_id) REFERENCES virtual_keys(id),
  FOREIGN KEY(provider_id) REFERENCES providers(id),
  FOREIGN KEY(provider_credential_id) REFERENCES provider_credentials(id),
  FOREIGN KEY(model_id) REFERENCES models(id)
);
CREATE INDEX IF NOT EXISTS idx_requests_project_started ON requests(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status_started ON requests(status, started_at DESC);

CREATE TABLE IF NOT EXISTS usage_daily (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(project_id, usage_date)
);

CREATE TABLE IF NOT EXISTS usage_monthly (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  usage_month TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(project_id, usage_month)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_job_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'succeeded', 'failed', 'cancelled', 'expired')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  result_url TEXT,
  final_cost_cents INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'acknowledged', 'resolved')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  before_summary TEXT,
  after_summary TEXT,
  source_ip TEXT,
  result TEXT NOT NULL DEFAULT 'success',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
