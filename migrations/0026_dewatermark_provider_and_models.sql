-- Dewatermark image processing accepts multipart uploads and is handled by a dedicated gateway route.
-- Reuse a live provider created through the admin UI when it already owns this endpoint.
-- If only an archived or disabled provider owns the canonical ID or slug, preserve it and
-- create a new live provider with a collision-safe ID and slug.
INSERT INTO providers(id, name, slug, base_url, adapter_type, status, timeout_ms, retry_count, created_at, updated_at)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM providers WHERE id = 'provider_dewatermark')
      THEN 'provider_dewatermark_' || lower(hex(randomblob(8)))
    ELSE 'provider_dewatermark'
  END,
  'Dewatermark.AI',
  CASE
    WHEN EXISTS (SELECT 1 FROM providers WHERE slug = 'dewatermark')
      THEN 'dewatermark-' || lower(hex(randomblob(6)))
    ELSE 'dewatermark'
  END,
  'https://platform.dewatermark.ai',
  'dewatermark',
  'active',
  90000,
  0,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (
  SELECT 1
  FROM providers
  WHERE deleted_at IS NULL
    AND status = 'active'
    AND base_url = 'https://platform.dewatermark.ai'
);

UPDATE providers
SET adapter_type = 'dewatermark', timeout_ms = 90000, retry_count = 0, updated_at = datetime('now')
WHERE id = (
  SELECT provider.id
  FROM providers AS provider
  WHERE provider.deleted_at IS NULL
    AND provider.status = 'active'
    AND provider.base_url = 'https://platform.dewatermark.ai'
  ORDER BY
    CASE WHEN EXISTS (
      SELECT 1
      FROM provider_credentials AS credential
      WHERE credential.provider_id = provider.id
        AND credential.status = 'active'
        AND credential.health_status = 'healthy'
        AND credential.encrypted_secret <> 'erased'
    ) THEN 0 ELSE 1 END,
    CASE WHEN provider.adapter_type = 'dewatermark' THEN 0 ELSE 1 END,
    CASE WHEN provider.id = 'provider_dewatermark' THEN 0 ELSE 1 END,
    provider.created_at ASC
  LIMIT 1
);

WITH target_provider AS (
  SELECT provider.id
  FROM providers AS provider
  WHERE provider.deleted_at IS NULL
    AND provider.status = 'active'
    AND provider.base_url = 'https://platform.dewatermark.ai'
  ORDER BY
    CASE WHEN EXISTS (
      SELECT 1
      FROM provider_credentials AS credential
      WHERE credential.provider_id = provider.id
        AND credential.status = 'active'
        AND credential.health_status = 'healthy'
        AND credential.encrypted_secret <> 'erased'
    ) THEN 0 ELSE 1 END,
    CASE WHEN provider.adapter_type = 'dewatermark' THEN 0 ELSE 1 END,
    CASE WHEN provider.id = 'provider_dewatermark' THEN 0 ELSE 1 END,
    provider.created_at ASC
  LIMIT 1
),
seed_models(id, name, alias, provider_model_id, request_type) AS (
  VALUES
    ('model_dewatermark_image_v3', 'Dewatermark Image Removal', 'dewatermark-image-v3', 'v3', 'image'),
    ('model_dewatermark_image_pro', 'Dewatermark Image Removal Pro', 'dewatermark-image-pro', 'pro', 'image'),
    ('model_dewatermark_video', 'Dewatermark Video Removal', 'dewatermark-video', 'video', 'video'),
    ('model_dewatermark_pdf', 'Dewatermark PDF Removal', 'dewatermark-pdf', 'pdf', 'document')
)
INSERT OR IGNORE INTO models(id, provider_id, name, alias, provider_model_id, request_type, status, fixed_cost_cents, price_version, created_at, updated_at)
SELECT seed_models.id, target_provider.id, seed_models.name, seed_models.alias, seed_models.provider_model_id,
       seed_models.request_type, 'active', 0, 'dewatermark-credit', datetime('now'), datetime('now')
FROM seed_models
CROSS JOIN target_provider;
