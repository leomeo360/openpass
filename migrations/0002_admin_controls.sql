ALTER TABLE project_models ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled'));
ALTER TABLE project_models ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE project_models ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_project_models_project_status ON project_models(project_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_project_updated ON jobs(project_id, updated_at DESC);
