CREATE INDEX IF NOT EXISTS idx_requests_virtual_key_started
  ON requests(virtual_key_id, started_at DESC);
