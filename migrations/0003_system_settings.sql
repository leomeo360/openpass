CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO system_settings(setting_key, setting_value, updated_at) VALUES
  ('default_log_policy', 'metadata', datetime('now')),
  ('default_ip_logging', 'masked', datetime('now')),
  ('default_timeout_ms', '60000', datetime('now')),
  ('default_retry_count', '1', datetime('now')),
  ('request_metadata_retention_days', '180', datetime('now')),
  ('raw_ip_retention_days', '30', datetime('now')),
  ('alert_threshold_warning', '70', datetime('now')),
  ('alert_threshold_critical', '90', datetime('now'));
