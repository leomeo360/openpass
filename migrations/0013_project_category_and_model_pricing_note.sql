ALTER TABLE projects ADD COLUMN category TEXT NOT NULL DEFAULT 'other_tools';
ALTER TABLE models ADD COLUMN pricing_note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category, created_at DESC);

UPDATE models
SET pricing_note = CASE alias
  WHEN 'deepseek-v4-flash' THEN 'DeepSeek 官方人民币价 / 1M Token：缓存命中 ¥0.02；缓存未命中 ¥1；输出 ¥2'
  WHEN 'deepseek-v4-pro' THEN 'DeepSeek 官方人民币价 / 1M Token：缓存命中 ¥0.025；缓存未命中 ¥3；输出 ¥6'
  ELSE pricing_note
END
WHERE alias IN ('deepseek-v4-flash', 'deepseek-v4-pro');
