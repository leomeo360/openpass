UPDATE providers
SET base_url = 'https://api.openai.com/v1',
    updated_at = datetime('now')
WHERE slug = 'openai'
  AND rtrim(base_url, '/') = 'https://api.openai.com';
