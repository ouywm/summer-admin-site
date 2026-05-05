---
title: First Run
description: Boot the app, login, verify OpenAPI, MCP, and AI relay.
published_at: 2026-05-04 10:30:00
---

# First Run

> Full walkthrough is in the Chinese version: [`/guide/start/first-run`](/guide/start/first-run).

## Start

```bash
cargo run -p app --release
# or with debug logs
RUST_LOG=debug cargo run -p app --release
```

Expected logs:

```text
INFO Web server started on 0.0.0.0:8080
INFO MCP plugin initialized (transport: http, mode: embedded, path: /mcp)
INFO summer-ai-relay registered: openai / claude / gemini
```

## Verify OpenAPI

```bash
open http://localhost:8080/docs
```

## Verify auth

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"123456"}' | jq -r .data.access_token)

curl -s http://localhost:8080/api/user/info \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## Verify MCP

```bash
curl -X POST http://localhost:8080/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0.1"}}}'
```

Standalone mode:

```bash
cargo run -p summer-mcp --features standalone --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin'
```

## Verify AI Relay

After creating a token in the AI admin (`/api/ai-admin/token`):

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `connection refused 5432` | Postgres not running |
| `relation "sys.user" does not exist` | SQL not initialized |
| `Authentication required` even with token | Token expired or `JWT_SECRET` rotated |
| `summer-ai-relay channel not found` | No channels configured in AI admin yet |
