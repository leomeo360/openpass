-- Project-specific model naming and ordered degradation routes.
ALTER TABLE project_models ADD COLUMN project_alias TEXT;
ALTER TABLE project_models ADD COLUMN fallback_priority INTEGER NOT NULL DEFAULT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_models_project_alias
  ON project_models(project_id, project_alias)
  WHERE project_alias IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_models_fallback
  ON project_models(project_id, status, fallback_priority);

-- Preserve every upstream try so request details can explain credential and
-- model failover instead of exposing only an aggregate attempt count.
CREATE TABLE IF NOT EXISTS request_attempts (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  provider_credential_id TEXT REFERENCES provider_credentials(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed', 'rejected')),
  http_status INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_request_attempts_request_number
  ON request_attempts(request_id, attempt_number);

-- A block rule always wins. When a project has one or more active allow rules,
-- every source must match an allow rule before reaching a provider.
CREATE TABLE IF NOT EXISTS project_ip_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('allow', 'block')),
  value TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, rule_type, value)
);

CREATE INDEX IF NOT EXISTS idx_project_ip_rules_active
  ON project_ip_rules(project_id, status, rule_type);
