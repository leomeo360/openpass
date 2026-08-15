# OpenPass

[English](./README.md) | **简体中文**

> 一个真实供应商 Key，安全地为团队成员和独立项目签发虚拟 Key。

OpenPass 是一个开源、可自托管于 Cloudflare 的 AI API Key 管理平台与兼容 OpenAI 协议的网关。管理员只需保存供应商的真实 API Key 一次；随后即可为每个团队成员、产品、环境或独立项目创建单独的虚拟 Key，而无需把真实 Key 分发给任何调用方。

本仓库包含 OpenPass 开源版，专注于单工作区、项目隔离、虚拟 Key 与基础成员协作。版本边界见 [`COMMUNITY.md`](./COMMUNITY.md)。

## 为什么使用 OpenPass

真实 Key 一旦被复制到多个前端、脚本或成员手中，就难以撤销、审计和控制成本。OpenPass 将真实凭证保留在服务端加密存储，并将调用权限拆分为可独立管理的虚拟 Key。

| 场景 | OpenPass 的做法 |
| --- | --- |
| 团队协作 | 为成员或业务线发放不同项目的虚拟 Key，不共享真实供应商 Key。 |
| 多项目隔离 | 每个项目拥有独立模型范围、RPM、并发、请求量和费用限制。 |
| 供应商集中管理 | 真实 Key 仅在后台配置，支持凭证优先级、权重、健康状态与故障处理。 |
| 安全撤销 | 停用或删除某个虚拟 Key，不影响其他项目与团队成员。 |
| 审计与成本 | 统一查看请求、模型、用量、延迟、预估费用和告警。 |

## 工作方式

```text
真实供应商 Key
      │ 仅在后台加密保存
      ▼
OpenPass Gateway
      │
 ┌────┼────┐
 ▼    ▼    ▼
项目 A  项目 B  团队成员 C
虚拟 Key  虚拟 Key  虚拟 Key
```

1. 在后台添加供应商及一个真实 API Key。
2. 创建项目并指定可调用模型及限额。
3. 为项目创建虚拟 Key，并只把该 Key 交给对应的应用或成员。
4. 应用通过 OpenPass 的统一接口发起请求；真实 Key 始终不离开平台。

## 网关调用示例

所有请求都把项目虚拟 Key 放在 `Authorization: Bearer <VIRTUAL_KEY>` 中。功能由请求路径区分，`model` 使用项目内配置的模型别名。

```bash
# 对话
curl https://your-domain.example/v1/chat/completions \
  -H "Authorization: Bearer <VIRTUAL_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seed-2-1-turbo","messages":[{"role":"user","content":"你好"}]}'

# 图片生成
curl https://your-domain.example/v1/images/generations \
  -H "Authorization: Bearer <VIRTUAL_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedream-4-0","prompt":"一艘纸船漂浮在湖面","size":"2K","response_format":"url"}'

# 视频生成
curl https://your-domain.example/v1/videos/generations \
  -H "Authorization: Bearer <VIRTUAL_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedance-1-0-pro","content":[{"type":"text","text":"一艘飞船掠过云海"}],"duration":5,"resolution":"720p","ratio":"16:9"}'

# 视频接口返回内部任务 ID 后查询状态
curl https://your-domain.example/v1/jobs/<JOB_ID> \
  -H "Authorization: Bearer <VIRTUAL_KEY>"
```

## 核心能力

- OpenAI 兼容网关：`/v1/models`、`/v1/chat/completions`、`/v1/responses`、`/v1/images/generations`、`/v1/videos/generations`、`/v1/embeddings`。
- 项目级虚拟 Key、模型授权、默认模型与可选故障回退。
- 项目级 RPM、并发、每日/月度请求量与费用控制。
- 供应商凭证加密、优先级、权重、健康检查与熔断状态。
- 请求日志、异步任务、操作审计、告警与费用估算。
- 管理后台内置调用文档，动态展示启用模型，并提供聊天、图片和视频调用示例及供应商参数。
- Google / GitHub 注册登录、Cloudflare Access 或内置账号密码保护后台。新注册账号必须由管理员按邮箱授予全局或项目权限。

## 架构

| 组件 | 用途 |
| --- | --- |
| Cloudflare Workers | 网关、管理 API 与静态管理后台。 |
| Cloudflare D1 | 项目、模型、加密凭证、日志、告警与审计数据。 |
| Durable Objects | 项目级并发与 RPM 协调。 |
| AES-GCM | 真实供应商 API Key 的静态加密。 |

## 快速开始

需要 Node.js 20+、Cloudflare 账号和 Wrangler CLI。

```bash
npm install
npx wrangler login
npx wrangler d1 create openpass
npx wrangler d1 migrations apply openpass --remote
```

将 D1 返回的 `database_id` 写入你自己的私有 Wrangler 配置。不要将域名、账号信息、数据库 ID 或任何密钥提交到公开仓库。

生成并设置用于加密供应商凭证的密钥：

```bash
openssl rand -base64 32 | npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY
```

> 该密钥丢失后，已有供应商凭证无法解密。请保存到密码管理器或 Cloudflare Secrets Store。

## 管理后台认证

### 账号密码与社交账号

`hybrid` 模式会在同一登录页同时提供管理员账号密码、Google 和 GitHub 入口。密码账号始终是全局管理员；社交账号仍按 `ADMIN_EMAILS` 或项目成员配置授权。

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "AUTH_MODE": "hybrid",
  "ADMIN_USERNAME": "owner@example.com",
  "ADMIN_EMAILS": "owner@example.com"
}
```

密码必须至少 12 个字符，并且只能将 `npm run password:hash` 的输出作为 `ADMIN_PASSWORD_HASH` Worker Secret 保存；不要把明文密码写入 Wrangler 配置。

### Google One Tap、Google OAuth 与 GitHub 注册登录

OAuth 或 `hybrid` 模式下，用户首次使用 Google One Tap、Google OAuth 或 GitHub 登录时会自动注册。注册本身不会授予供应商 Key、全局后台或项目权限；邮箱仍需出现在 `ADMIN_EMAILS` 中，或由管理员添加到某个项目。

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "AUTH_MODE": "oauth",
  "REGISTRATION_ENABLED": "true",
  "OAUTH_PUBLIC_ORIGIN": "https://your-domain.example",
  "ADMIN_EMAILS": "owner@example.com"
}
```

将 OAuth 凭证作为 Worker Secrets 配置，不要写进 `wrangler.jsonc`。可只启用其中一个，也可同时启用：

```bash
npx wrangler secret put AUTH_SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

OAuth 应用回调地址：

```text
https://your-domain.example/admin/auth/oauth/google/callback
https://your-domain.example/admin/auth/oauth/github/callback
```

Google One Tap 使用同一个 Web Client ID，并通过 GIS 原生表单 POST 回调：

```text
https://your-domain.example/api/auth/callback/google
```

在 Google Auth Platform 中，还要把 `https://your-domain.example` 配为 Authorized JavaScript origin，并把上述实际使用的回调地址配置到对应客户端。Worker 会先验证 GIS 的 `g_csrf_token` 双重提交 Cookie 和短期 nonce，再验证 Google ID token 的签名、issuer、audience、有效期和已验证邮箱。

将 `REGISTRATION_ENABLED` 改为 `false` 后，已有账号仍可登录，但不会再创建新账号。

公开 OAuth 主域名的 `/admin/*`（包括 `start` 与 `callback`）不能再被 Cloudflare Access 覆盖，否则用户会先被 Access 拦截，无法进入 OpenPass 的 Google/GitHub 注册流程。若仍需使用 Access，可将它放在独立的运维或兼容域名上。

### Cloudflare Access

Cloudflare Access 可作为替代认证模式，也可用于独立运维域名。

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "AUTH_MODE": "access",
  "ADMIN_EMAILS": "owner@example.com"
}
```

在 Cloudflare Zero Trust 中创建 Self-hosted Access Application，保护：

```text
https://your-domain.example/admin/*
```

`ADMIN_EMAILS` 支持逗号分隔的全局管理员邮箱。可将其他人设为项目管理员或只读成员，而无需给他们供应商真实 Key。

### 内置账号密码

适合个人部署或暂未接入 Cloudflare Access 的环境。

```jsonc
"vars": {
  "ENVIRONMENT": "production",
  "AUTH_MODE": "password",
  "ADMIN_USERNAME": "admin"
}
```

```bash
read -s OPENPASS_PASSWORD
printf %s "$OPENPASS_PASSWORD" | npm run password:hash | npx wrangler secret put ADMIN_PASSWORD_HASH
unset OPENPASS_PASSWORD
openssl rand -base64 48 | npx wrangler secret put AUTH_SESSION_SECRET
```

## 本地开发

```bash
cp .dev.vars.example .dev.vars
# 在 .dev.vars 中填写仅用于本机的 CREDENTIAL_ENCRYPTION_KEY
npx wrangler d1 migrations apply openpass --local
npm run dev
```

默认打开 `http://localhost:3103/admin/`。开发模式可使用 `AUTH_MODE=none`，但仅允许 `ENVIRONMENT=development`。

## 部署

先运行检查，再部署：

```bash
npm run check
npm test
npx wrangler deploy --dry-run
npm run deploy
```

使用私有部署配置时：

```bash
npx wrangler d1 migrations apply openpass --remote --config wrangler.private.jsonc
npx wrangler deploy --config wrangler.private.jsonc
```

### GitHub Actions 持续集成

推送和 Pull Request 会运行 `.github/workflows/ci.yml`，执行 TypeScript 检查和测试。公开仓库不自动部署，也不读取任何 Cloudflare 生产密钥。

## 重要配置

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `ENVIRONMENT` | Var | `development` 或 `production` |
| `AUTH_MODE` | Var | `hybrid`、`oauth`、`access`、`password` 或仅开发使用的 `none` |
| `REGISTRATION_ENABLED` | Var | OAuth 首次登录是否允许创建账号，默认 `true` |
| `OAUTH_PUBLIC_ORIGIN` | Var | OAuth 统一回调主域名；多域名入口和 GitHub 单回调场景必须配置 |
| `ADMIN_EMAILS` | Var | 逗号分隔的全局管理员邮箱 |
| `ADMIN_USERNAME` | Var | 密码登录的管理员账号 |
| `MAX_REQUEST_BODY_BYTES` | Var | 最大请求体字节数 |
| `CREDENTIAL_ENCRYPTION_KEY` | Secret | AES-GCM 凭证加密主密钥 |
| `ADMIN_PASSWORD_HASH` | Secret | PBKDF2-SHA256 密码摘要 |
| `AUTH_SESSION_SECRET` | Secret | OAuth/密码登录会话签名密钥 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Secret | Google OAuth 应用凭证 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Secret | GitHub OAuth 应用凭证 |

## 安全实践

- 不在客户端、示例代码、Issue、日志或 Git 历史中写入真实供应商 Key。
- 把真实 Key 仅配置在管理后台；应用只使用最小权限的项目虚拟 Key。
- 为每个环境和项目使用不同虚拟 Key；泄露时只撤销受影响 Key。
- 生产环境必须启用明确的后台认证：OAuth 主域名使用签名会话与角色授权；独立运维域名可使用 Cloudflare Access 并限制管理员邮箱。
- 不要提交 `.dev.vars`、`.env*`、私有 Wrangler 配置、备份或令牌。

提交前可执行：

```bash
git status --short
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' \
  '(sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}|BEGIN PRIVATE KEY)'
```

详见 [SECURITY.md](./SECURITY.md) 与 [TESTING.md](./TESTING.md)。

## 贡献

```bash
npm run check
npm test
```

新增接口请补充集成测试。请勿在 Issue、PR 或测试夹具中粘贴真实 API Key、Cookie、D1 导出或 Cloudflare Token。

## 许可证

[MIT](./LICENSE)
