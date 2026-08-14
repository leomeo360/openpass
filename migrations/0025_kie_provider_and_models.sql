-- KIE tasks use a provider-specific asynchronous API rather than OpenAI's API.
INSERT OR IGNORE INTO providers(id, name, slug, base_url, adapter_type, status, timeout_ms, retry_count, created_at, updated_at)
VALUES ('provider_kie', 'KIE.AI', 'kie', 'https://api.kie.ai', 'kie', 'active', 60000, 0, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO models(id, provider_id, name, alias, provider_model_id, request_type, status, fixed_cost_cents, price_version, created_at, updated_at) VALUES
  ('model_kie_seedream_v4', 'provider_kie', 'KIE Seedream 4 Text to Image', 'kie-seedream-v4-text-to-image', 'bytedance/seedream-v4-text-to-image', 'image', 'active', 0, 'kie-market', datetime('now'), datetime('now')),
  ('model_kie_seedream_v4_edit', 'provider_kie', 'KIE Seedream 4 Edit', 'kie-seedream-v4-edit', 'bytedance/seedream-v4-edit', 'image', 'active', 0, 'kie-market', datetime('now'), datetime('now')),
  ('model_kie_kling_26_text', 'provider_kie', 'KIE Kling 2.6 Text to Video', 'kie-kling-2-6-text-to-video', 'kling-2.6/text-to-video', 'video', 'active', 0, 'kie-market', datetime('now'), datetime('now')),
  ('model_kie_kling_26_image', 'provider_kie', 'KIE Kling 2.6 Image to Video', 'kie-kling-2-6-image-to-video', 'kling-2.6/image-to-video', 'video', 'active', 0, 'kie-market', datetime('now'), datetime('now'));
