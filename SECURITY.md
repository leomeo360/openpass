# Security Policy

## Reporting a vulnerability

请通过仓库的私密安全报告渠道提交漏洞，不要在公开 Issue 中附带可利用细节、真实密钥、Cookie、Cloudflare Token 或数据库导出。

报告中可以包含最小复现步骤、影响范围和经过脱敏的日志。请先撤销任何曾经意外暴露的凭证，再进行报告。

## Deployment responsibilities

- 生产环境必须使用 `AUTH_MODE=oauth`、`AUTH_MODE=access` 或 `AUTH_MODE=password`。
- OAuth 注册只创建身份账号，不自动授予全局或项目权限；权限仍由 `ADMIN_EMAILS` 和 `project_admins` 明确控制。
- Google/GitHub OAuth 客户端密钥和 `AUTH_SESSION_SECRET` 必须使用 Worker Secrets。
- `CREDENTIAL_ENCRYPTION_KEY`、`ADMIN_PASSWORD_HASH` 和 `AUTH_SESSION_SECRET` 必须通过 Worker Secrets 配置。
- Access 模式应在 Cloudflare Zero Trust 中保护整个 `/admin/*` 路径。
- 密码模式应使用 HTTPS，并避免再叠加一个无法通过的 Access 策略。
- 定期备份 D1，但不要把备份提交到 Git。
- 定期轮换供应商凭证、虚拟 Key、管理员密码和会话签名密钥。

## Secret exposure

如果密钥进入 Git 历史，仅删除当前文件不够。请立即撤销或轮换密钥，清理 Git 历史，并检查 Cloudflare Audit Logs 与 OpenPass 请求日志。
