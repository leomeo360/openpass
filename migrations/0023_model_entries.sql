CREATE TABLE IF NOT EXISTS model_entries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  request_type TEXT NOT NULL DEFAULT 'chat',
  scope TEXT NOT NULL DEFAULT 'all' CHECK(scope IN ('all', 'selected')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_entry_routes (
  entry_id TEXT NOT NULL REFERENCES model_entries(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(entry_id, model_id)
);

CREATE TABLE IF NOT EXISTS model_entry_projects (
  entry_id TEXT NOT NULL REFERENCES model_entries(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY(entry_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_model_entries_slug_status ON model_entries(slug, status);
CREATE INDEX IF NOT EXISTS idx_model_entry_projects_project ON model_entry_projects(project_id, entry_id);
