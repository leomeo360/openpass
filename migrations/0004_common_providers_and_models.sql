INSERT OR IGNORE INTO providers(id, name, slug, base_url, adapter_type, status, timeout_ms, retry_count, created_at, updated_at) VALUES
  ('provider_openai', 'OpenAI', 'openai', 'https://api.openai.com', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_deepseek', 'DeepSeek', 'deepseek', 'https://api.deepseek.com', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_groq', 'Groq', 'groq', 'https://api.groq.com/openai/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_together', 'Together AI', 'together', 'https://api.together.xyz/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_openrouter', 'OpenRouter', 'openrouter', 'https://openrouter.ai/api/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO models(id, provider_id, name, alias, provider_model_id, request_type, status, fixed_cost_cents, price_version, created_at, updated_at) VALUES
  ('model_openai_gpt5', 'provider_openai', 'GPT-5', 'gpt-5', 'gpt-5', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_openai_gpt5mini', 'provider_openai', 'GPT-5 mini', 'gpt-5-mini', 'gpt-5-mini', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_openai_gpt41', 'provider_openai', 'GPT-4.1', 'gpt-4-1', 'gpt-4.1', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_openai_gpt41mini', 'provider_openai', 'GPT-4.1 mini', 'gpt-4-1-mini', 'gpt-4.1-mini', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_openai_image', 'provider_openai', 'GPT Image 1', 'gpt-image-1', 'gpt-image-1', 'image', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_openai_embedding', 'provider_openai', 'Text Embedding 3 Large', 'text-embedding-3-large', 'text-embedding-3-large', 'embedding', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_deepseek_v4flash', 'provider_deepseek', 'DeepSeek V4 Flash', 'deepseek-v4-flash', 'deepseek-v4-flash', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_deepseek_v4pro', 'provider_deepseek', 'DeepSeek V4 Pro', 'deepseek-v4-pro', 'deepseek-v4-pro', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_groq_gptoss120', 'provider_groq', 'GPT-OSS 120B', 'groq-gpt-oss-120b', 'openai/gpt-oss-120b', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_groq_qwen36', 'provider_groq', 'Qwen 3.6 27B', 'groq-qwen-3-6-27b', 'qwen/qwen3.6-27b', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_together_llama', 'provider_together', 'Llama 3.3 70B Instruct Turbo', 'together-llama-3-3-70b', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_together_qwen', 'provider_together', 'Qwen 2.5 72B Instruct Turbo', 'together-qwen-2-5-72b', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_openrouter_gpt5mini', 'provider_openrouter', 'GPT-5 mini via OpenRouter', 'openrouter-gpt-5-mini', 'openai/gpt-5-mini', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_openrouter_deepseek', 'provider_openrouter', 'DeepSeek V3 via OpenRouter', 'openrouter-deepseek-v3', 'deepseek/deepseek-chat-v3-0324', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now'));
