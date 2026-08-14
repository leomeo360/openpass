# OpenPass 执行说明

- 目标运行时是 Cloudflare Workers，生产资源为 D1 与 Durable Objects。
- 不要把 `.dev.vars`、真实供应商 Key 或 `CREDENTIAL_ENCRYPTION_KEY` 提交到仓库。
- 修改 `wrangler.jsonc` 后运行 `npm run types`；修改 Worker 后至少运行 `npm run check` 与 `npm test`。
- 请求/响应体要保持流式转发，禁止为日志目的读取无限大的上游响应。
- OAuth 注册账号与后台授权必须分离：注册成功不自动成为全局管理员；全局权限仍由 `ADMIN_EMAILS` 控制，项目权限仍由 `project_admins` 控制。
- Google/GitHub OAuth 客户端密钥只能放 Worker Secrets；OAuth 回调分别为 `/admin/auth/oauth/google/callback` 与 `/admin/auth/oauth/github/callback`，Google One Tap 的 GIS 原生 POST 回调为 `/api/auth/callback/google`，必须保留 double-submit CSRF、nonce 与 ID token 完整校验。
- 同时提供密码与 OAuth 登录时使用 `AUTH_MODE=hybrid`；明文密码不得进入 Wrangler 配置、日志或 Git，且密码不少于 12 个字符。
- 多域名生产入口必须用 `OAUTH_PUBLIC_ORIGIN` 固定到主域名；GitHub OAuth App 只有一个回调地址，不能按请求 Host 动态切换。
- 不执行部署，除非用户明确要求。
