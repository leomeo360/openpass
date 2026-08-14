ALTER TABLE requests ADD COLUMN input_tokens INTEGER;
ALTER TABLE requests ADD COLUMN output_tokens INTEGER;

CREATE INDEX IF NOT EXISTS idx_requests_model_started ON requests(model_id, started_at DESC);
