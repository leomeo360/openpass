ALTER TABLE jobs ADD COLUMN model_id TEXT REFERENCES models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_model_updated ON jobs(model_id, updated_at DESC);
