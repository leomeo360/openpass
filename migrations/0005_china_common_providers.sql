INSERT OR IGNORE INTO providers(id, name, slug, base_url, adapter_type, status, timeout_ms, retry_count, created_at, updated_at) VALUES
  ('provider_zhipu', '智谱 AI（GLM）', 'zhipu-glm', 'https://open.bigmodel.cn/api/paas/v4', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_volcengine', '字节跳动火山引擎（豆包 / 方舟）', 'volcengine-ark', 'https://ark.cn-beijing.volces.com/api/v3', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_bailian', '阿里云百炼（通义千问）', 'aliyun-bailian', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_siliconflow', '硅基流动', 'siliconflow', 'https://api.siliconflow.cn/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_tokenhub', '腾讯云 TokenHub（混元）', 'tencent-tokenhub', 'https://tokenhub.tencentmaas.com/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_qianfan', '百度千帆', 'baidu-qianfan', 'https://qianfan.baidubce.com/v2', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_moonshot', '月之暗面（Kimi）', 'moonshot', 'https://api.moonshot.cn/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_minimax', 'MiniMax', 'minimax', 'https://api.minimaxi.com/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_stepfun', '阶跃星辰', 'stepfun', 'https://api.stepfun.com/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now')),
  ('provider_lingyi', '零一万物（Yi）', 'lingyiwanwu', 'https://api.lingyiwanwu.com/v1', 'openai-compatible', 'active', 60000, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO models(id, provider_id, name, alias, provider_model_id, request_type, status, fixed_cost_cents, price_version, created_at, updated_at) VALUES
  ('model_zhipu_glm5', 'provider_zhipu', 'GLM-5', 'glm-5', 'glm-5', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_zhipu_glm51', 'provider_zhipu', 'GLM-5.1', 'glm-5-1', 'glm-5.1', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_volc_doubao', 'provider_volcengine', '豆包 Seed 1.6', 'doubao-seed-1-6', 'doubao-seed-1-6-251015', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_bailian_qwenplus', 'provider_bailian', '通义千问 Plus', 'qwen-plus', 'qwen-plus', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_bailian_qwenmax', 'provider_bailian', '通义千问 Max', 'qwen-max', 'qwen-max', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_bailian_qwenvl', 'provider_bailian', '通义千问 VL Max', 'qwen-vl-max', 'qwen-vl-max', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_siliconflow_qwen3', 'provider_siliconflow', 'Qwen 3 32B', 'siliconflow-qwen3-32b', 'Qwen/Qwen3-32B', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_siliconflow_deepseek', 'provider_siliconflow', 'DeepSeek V3', 'siliconflow-deepseek-v3', 'deepseek-ai/DeepSeek-V3', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_tokenhub_hy3', 'provider_tokenhub', '混元 Hy3', 'hunyuan-hy3', 'hy3', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_tokenhub_role', 'provider_tokenhub', '混元 Role Latest', 'hunyuan-role-latest', 'hunyuan-role-latest', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_qianfan_ernie', 'provider_qianfan', 'ERNIE 4.5 Turbo', 'ernie-4-5-turbo', 'ernie-4.5-turbo-20260402', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_qianfan_glm51', 'provider_qianfan', 'GLM-5.1 via Qianfan', 'qianfan-glm-5-1', 'glm-5.1', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_moonshot_kimi', 'provider_moonshot', 'Kimi K2.6', 'kimi-k2-6', 'kimi-k2.6', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now')),
  ('model_minimax_m25', 'provider_minimax', 'MiniMax M2.5', 'minimax-m2-5', 'MiniMax-M2.5', 'chat', 'active', 0, 'provider-default', datetime('now'), datetime('now'));
