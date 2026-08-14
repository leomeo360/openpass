-- Cross-model degradation is opt-in because changing an explicitly requested
-- model can affect cost, output quality, and provider data residency.
ALTER TABLE projects ADD COLUMN model_fallback_enabled INTEGER NOT NULL DEFAULT 0
  CHECK(model_fallback_enabled IN (0, 1));
