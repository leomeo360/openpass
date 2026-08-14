ALTER TABLE jobs ADD COLUMN provider_status_url TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_processing_updated ON jobs(status, updated_at DESC);
