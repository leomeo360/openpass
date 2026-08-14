INSERT OR IGNORE INTO system_settings(setting_key, setting_value, updated_at) VALUES
  ('custom_redaction_fields', '', datetime('now')),
  ('credential_health_check_enabled', 'true', datetime('now'));

ALTER TABLE models ADD COLUMN billing_unit TEXT NOT NULL DEFAULT 'token';
ALTER TABLE models ADD COLUMN unit_cost_microunits INTEGER NOT NULL DEFAULT 0;
