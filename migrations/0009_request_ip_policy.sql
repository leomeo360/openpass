-- Persist the policy used at request time so later project edits cannot extend
-- the retention window for raw IP addresses already stored in the audit trail.
ALTER TABLE requests ADD COLUMN source_ip_policy TEXT NOT NULL DEFAULT 'masked'
  CHECK(source_ip_policy IN ('full', 'masked', 'none'));

CREATE INDEX IF NOT EXISTS idx_requests_ip_policy_started ON requests(source_ip_policy, started_at);
