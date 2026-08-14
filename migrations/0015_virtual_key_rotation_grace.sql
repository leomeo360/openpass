-- Keep a rotated key usable during an explicit migration window, then revoke
-- it automatically from the existing daily maintenance trigger.
ALTER TABLE virtual_keys ADD COLUMN rotation_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_virtual_keys_rotation_expiry
  ON virtual_keys(status, rotation_expires_at);

INSERT OR IGNORE INTO system_settings(setting_key, setting_value, updated_at)
VALUES ('virtual_key_rotation_grace_minutes', '1440', datetime('now'));
