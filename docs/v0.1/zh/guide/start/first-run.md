---
title: 首次启动
description: 从零启动应用、跑通登录、看到 OpenAPI 文档,验证 MCP 与 AI 入口。
published_at: 2026-05-04 10:30:00
---

# 首次启动

完成 [安装](./installation) 或 [Docker 启动](./docker) 后,这一页帮你**端到端跑通**主要入口。

## 1. 直接编译运行(非 Docker)

```bash
# 仓库根目录,加载 .env 后启动
cargo run -p app --release

# 想看 trace 级别的日志
RUST_LOG=debug cargo run -p app --release
```

成功启动会看到类似输出:

```text
INFO Web server started on 0.0.0.0:8080
INFO MCP plugin initialized (transport: http, mode: embedded, path: /mcp)
INFO summer-ai-relay registered: openai / claude / gemini
INFO Background task workers ready (workers=4 capacity=4096)
```

## 2. 验证 OpenAPI 文档

```bash
open http://localhost:8080/docs
```

会进入 Swagger UI。`config/app.toml` 里的 `[web.openapi]` 段配置了路径前缀:

```toml
[web.openapi]
doc_prefix = "/docs"
info = { title = "summerrs-admin", version = "0.0.1" }
```

## 3. 验证认证链路

```bash
# 登录
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"123456"}' | jq .

# 返回类似
# {
#   "code": 200,
#   "data": {
#     "access_token": "eyJhbGciOi...",
#     "refresh_token": "eyJhbGciOi...",
#     "token_type": "Bearer",
#     "expires_in": 7200
#   }
# }
```

把 access_token 存下来:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"123456"}' | jq -r .data.access_token)
echo $TOKEN
```

调一个需要鉴权的接口:

```bash
curl -s http://localhost:8080/api/user/info \
  -H "Authorization: Bearer $TOKEN" | jq .
```

> 默认账号、密码、初始权限位见 [默认账号](./default-account)。

## 4. 验证 MCP

`config/app.toml` 默认 `[mcp]` 段配置:

```toml
[mcp]
enabled = true
transport = "http"
http_mode = "embedded"   # 跟主应用一起跑
path = "/mcp"            # embedded 模式下完整路径会跟随 [web].global_prefix
```

embedded 模式下完整路径是:

```text
POST http://localhost:8080/api/mcp
```

简单握手测一下(MCP 协议是 JSON-RPC over HTTP):

```bash
curl -X POST http://localhost:8080/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "curl-test", "version": "0.1"}
    }
  }'
```

如果想用**独立 standalone 模式**(默认 9090 端口):

```bash
cargo run -p summer-mcp --features standalone --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin'
```

详见 [MCP](../core/mcp)。

## 5. 验证 AI 网关

`summer-ai-relay` 默认挂出 OpenAI / Claude / Gemini 三套兼容接口:

| 协议 | 路径 |
|---|---|
| OpenAI | `/v1/chat/completions`, `/v1/responses`, `/v1/models` |
| Claude | `/v1/messages` |
| Gemini | `/v1beta/models/{target}` |

需要先在 AI 后台建好 channel + token,然后用 token 调:

```bash
# 假设你已经在 /api/ai-admin/token 建好了 token,值为 sk-xxx
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

详见 [AI 网关](../core/ai-gateway)。

## 6. 看日志在哪

按 `config/app.toml`:

```toml
[logger]
file = { enable = true }
level = "debug"
pretty_backtrace = true
```

日志默认写到 `logs/` 目录。Docker 模式下会写到 `app_logs` 卷。

## 7. 关机

直接 `Ctrl+C` 即可。`config/app.toml` 里 `[web].graceful = true`,会等待 in-flight 请求处理完再退出。

## 出问题怎么办?

| 现象 | 可能原因 | 排查 |
|---|---|---|
| `connection refused 5432` | Postgres 没起 | `pg_isready` / `docker compose ps postgres` |
| `relation "sys.user" does not exist` | SQL 没初始化 | 重新跑 `sql/sys/*.sql` |
| `Authentication required` 但已经带了 token | token 过期或 `JWT_SECRET` 改过 | 重新登录;检查 `[auth].access_timeout` |
| `MCP plugin is disabled, skipping` | `[mcp].enabled = false` | 改回 `true` 重启 |
| `summer-ai-relay 报 channel not found` | AI 后台还没建 channel | 先建 vendor → channel → channel_account → token |
| 端口冲突 | 已有进程占用 | 改 `[web].port` 或 `.env` 里 `APP_PORT` |
