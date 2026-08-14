ALTER TABLE jobs ADD COLUMN type TEXT NOT NULL DEFAULT 'generation';
ALTER TABLE jobs ADD COLUMN provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN provider_credential_id TEXT REFERENCES provider_credentials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_project_status_updated ON jobs(project_id, status, updated_at DESC);
