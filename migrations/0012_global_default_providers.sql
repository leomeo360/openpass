-- The management UI defaults to the five most common direct providers.  These
-- entries carry no credentials and therefore cannot route traffic until an
-- administrator explicitly adds a key.
INSERT OR IGNORE INTO providers(id, name, slug, base_url, adapter_type, status, timeout_ms, retry_count, created_at, updated_at) VALUES
  ('provider_anthropic', 'Anthropic（Claude）', 'anthropic', 'https://api.anthropic.com/v1', 'custom', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_xai', 'xAI（Grok）', 'xai', 'https://api.x.ai/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_google_gemini', 'Google Gemini', 'google-gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now'));
