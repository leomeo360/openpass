INSERT OR IGNORE INTO system_settings(setting_key, setting_value, updated_at) VALUES
  ('quota_failure_policy', 'deny', datetime('now')),
  ('error_rate_alert_percent', '20', datetime('now')),
  ('error_rate_min_requests', '10', datetime('now')),
  ('request_spike_multiplier', '3', datetime('now')),
  ('ip_request_alert_threshold', '50', datetime('now'));
