-- Preserve historical requests while removing an operational provider from the UI.
ALTER TABLE providers ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_providers_active ON providers(deleted_at, status);
