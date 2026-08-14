CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  provider_credential_id TEXT NOT NULL REFERENCES provider_credentials(id) ON DELETE CASCADE,
  provider_task_id TEXT NOT NULL,
  provider_file_path TEXT NOT NULL,
  upload_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type IN ('video', 'pdf')),
  status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created', 'submitted', 'expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  submitted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_project_status ON upload_sessions(project_id, status, created_at DESC);
