CREATE TABLE IF NOT EXISTS admin_login_attempts (
  source_ip TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_updated
  ON admin_login_attempts(updated_at);
