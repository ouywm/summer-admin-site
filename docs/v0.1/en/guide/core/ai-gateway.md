---
title: AI Gateway Integration
description: Recommended boundaries for AI admin, model channels, API keys, rate limits, billing, request logs, MCP tools, and relay protocol entrypoints.
published_at: 2026-05-04 12:20:00
---

# AI Gateway Integration

Summerrs Admin can serve as the admin backend foundation for an AI gateway. It provides login authentication, RBAC, menu buttons, resource permissions, dictionaries, operation logs, and MCP tools that can support AI channels, models, API keys, usage, audit, and operations.

An AI gateway usually has two parts:

| Part | Audience | Typical responsibilities |
|---|---|---|
| AI admin backend | Admins, operators, developers | Manage channels, models, API keys, quotas, routing, logs, and alerts |
| AI relay | Applications, external callers, agents | Receive OpenAI/Claude/Gemini-style requests, authenticate, and forward to upstream models |

Admin APIs fit naturally into the `/api` system, reusing admin JWTs, button permissions, resource permissions, and `ApiResult` responses. Relay protocol entrypoints should be mounted as a separate route group, such as `/v1/chat/completions`, `/v1/messages`, and `/v1beta/models/*`, with API keys, model routing, streaming responses, and protocol-specific error models.

## Reusable Admin Capabilities

The AI gateway admin side can reuse Summerrs Admin infrastructure:

| Capability | Use |
|---|---|
| Login auth | Admins log in with JWT and manage AI resources |
| RBAC | Use `ai:*` permissions for channels, models, keys, logs, and usage |
| Backend resource permissions | Register AI admin APIs in `sys.resource` and bind them to buttons |
| Operation logs | Write admin actions to `sys.operation_log` through `#[log]` |
| Dictionaries | Manage model status, channel type, billing unit, log status, and similar enums |
| Menus | Add AI admin pages and buttons to the backend UI |
| Rate limits | Protect admin APIs or relay requests by user, header, or API key |
| MCP | Let AI assistants read schemas, generate CRUD, and plan menus/dictionaries |

This lets the AI module focus on model-gateway domain logic while the admin foundation stays consistent with the rest of the system.

## Recommended Module Boundaries

AI admin APIs and relay protocol entrypoints have different auth, error, and response models. Keep the modules clear:

```text
crates/
  summer-ai-core/        # protocol types, error models, shared traits
  summer-ai-admin/       # /api/ai/* admin APIs
  summer-ai-relay/       # /v1/* protocol entrypoints and upstream forwarding
  summer-ai-model/       # SeaORM entities, DTOs, VOs
  summer-ai-billing/     # quotas, billing, request logs
```

The main app can register both admin and relay plugins:

```rust
app.add_plugin(SummerAuthPlugin)
   .add_plugin(ResourcePermissionPlugin)
   .add_plugin(AiAdminPlugin)
   .add_plugin(AiRelayPlugin);
```

Design the two entrypoint families separately:

| Entrypoint | Auth | Path | Response style |
|---|---|---|---|
| AI admin backend | Admin JWT + RBAC | `/api/ai/*` | `ApiResult` / JSON |
| OpenAI-compatible relay | API key | `/v1/chat/completions` etc. | OpenAI-style error JSON/SSE |
| Claude-compatible relay | API key | `/v1/messages` | Anthropic-style error JSON/SSE |
| Gemini-compatible relay | API key or query key | `/v1beta/models/*` | Gemini-style error JSON |

This prevents admin login state, button permissions, API keys, streaming responses, and third-party protocol errors from being mixed into one request chain.

## Admin Features

An AI admin backend usually includes these pages:

| Page | Capability |
|---|---|
| Channel management | Configure OpenAI, Claude, Gemini, self-hosted models, and other upstreams |
| Model management | Maintain model names, upstream mapping, context length, pricing, and capability tags |
| API key management | Create, disable, rotate, expire, and bind callers and quotas |
| Routing rules | Choose upstreams by model, tenant, key, weight, priority, or health |
| Usage analytics | View request count, tokens, cost, latency, and success rate |
| Request logs | Search request ID, caller, model, status, and error summary |
| Alert config | Alert on error rate, balance, channel availability, and similar events |

Admin handlers can follow the existing system style:

```rust
#[log(module = "AI 渠道", action = "创建渠道", biz_type = Create)]
#[has_perm("ai:channel:create")]
#[post_api("/ai/channel")]
pub async fn create_channel(...) -> ApiResult<()> {
    // ...
}
```

Menu buttons can be organized by business object:

```text
ai:channel:list
ai:channel:create
ai:channel:update
ai:channel:delete
ai:model:list
ai:model:update
ai:token:list
ai:token:create
ai:token:disable
ai:request-log:list
ai:usage:list
```

If you want the resource-permission layer to apply, register AI admin APIs in `sys.resource` and bind them to the corresponding Button through `sys.action_resource`. You can reload the policy with:

```http
POST /api/system/resource-permission/reload
```

## API Key Auth

Relay callers are programs, external applications, or agents. Use a dedicated API key strategy instead of admin JWTs.

Common request format:

```http
Authorization: Bearer sk-xxxx
```

An API key should contain at least:

| Field | Description |
|---|---|
| token hash | Store only the hash, not the plaintext key |
| owner | Owning user, tenant, or application |
| enabled | Whether the key is enabled |
| quota | Request, token, or cost quota |
| allowed models | Models this key may call |
| rate limit | Key-level rate-limit strategy |
| expires_at | Expiry time |
| last_used_at | Last use time |

The auth flow can be:

```text
parse Authorization -> hash lookup -> check enabled/expiry/model scope -> calculate limits and quota -> inject caller context
```

Show only key prefixes/suffixes in the admin UI. Return the plaintext key only once at creation time, then replace it through rotation.

## Model Routing

Model routing maps client-requested models to actual upstreams:

```text
client model: gpt-4o-mini
        |
        v
routing rule: openai-primary 80%, openai-backup 20%
        |
        v
upstream model: gpt-4o-mini / gpt-4.1-mini / custom alias
```

Common routing dimensions:

| Dimension | Use |
|---|---|
| Model alias | Expose stable model names while switching upstreams internally |
| Weight | Split traffic across channels by ratio |
| Priority | Primary/backup failover |
| Health status | Skip unavailable channels |
| Tenant or key | Give different customers different channels |
| Cost policy | Prefer lower-cost models and upgrade when needed |

Write the routing result into request logs so operators can answer "which model did the client request, and which upstream did it actually hit?"

## Streaming Responses

LLM relays often return SSE or chunked bodies. Streaming differs from normal admin JSON:

| Difference | Recommendation |
|---|---|
| Usage may only appear at the end | Write or update the request log when the stream finishes |
| Upstream may disconnect mid-stream | Record `canceled` or `upstream_error` |
| Failure can happen after HTTP 200 | Express it as an in-stream error event and store the final status in logs |
| Response bodies can be large | Do not store full responses in operation logs |

Continue using `#[log]` for admin actions. Relay requests should write to a dedicated AI request log, for example:

| Field | Description |
|---|---|
| request_id | Trace ID |
| protocol | openai / claude / gemini |
| endpoint | chat_completions / messages, etc. |
| client_model | Model requested by the client |
| upstream_model | Actual upstream model |
| token_id | Caller API key |
| status | success / error / canceled |
| prompt_tokens / completion_tokens | Usage |
| latency_ms | Total latency |
| error_detail | Error summary |

This keeps admin operation audit intact while giving relay traffic the high-frequency, streaming, billing-oriented log model it needs.

## Rate Limits And Quotas

`summer-common::rate_limit` provides `#[rate_limit]`, `RateLimitEngine`, and cost-based rate limiting. Admin APIs can use declarative limits; relay traffic is better controlled by API key and token cost.

For LLM requests, reserve quota before calling the upstream:

```rust
let reservation = rate_limit_ctx
    .reserve(&token_key, config, estimated_tokens, "请求过于频繁")
    .await?;

// Commit with real usage after upstream success; release/refund on failure or over-estimation.
```

Common strategies:

| Strategy | Description |
|---|---|
| Key-level QPS | Prevent one key from exhausting service capacity |
| Model-level concurrency | Protect expensive models or low-concurrency upstreams |
| Token reservation | Control token-based quota |
| Tenant total quota | Share quota across multiple keys under one tenant |
| Channel circuit breaker | Degrade or switch when upstreams fail |

If the API key is in `Authorization`, the relay auth layer can parse it first, then call `RateLimitContext` with the resolved token identifier.

## Relationship To MCP

MCP and AI relay solve different problems:

| Capability | Audience | Purpose |
|---|---|---|
| `summer-mcp` | AI assistants, development tools, operations tools | Read schemas, call table tools, generate code, manage menus/dictionaries |
| AI relay | Applications, agents, external callers | Receive model requests and forward them to OpenAI/Claude/Gemini or self-hosted models |

MCP can help develop AI admin modules: generate entities, CRUD, frontend bundles, then plan menus and dictionaries with `menu_tool` and `dict_tool`. Relay handles online model calls, API keys, quotas, routing, logs, and streaming responses.

```mermaid
flowchart LR
    A[AI assistant / development tool] --> B[summer-mcp]
    B --> C[database schema / CRUD / code generation]
    D[application / agent] --> E[AI relay]
    E --> F[OpenAI / Claude / Gemini / self-hosted model]
    G[Admin UI] --> H[/api/ai/* admin APIs]
    H --> I[JWT / RBAC / resource permissions]
```

## Integration Checklist

You can integrate an AI gateway module in this order:

1. Define AI domain models: channels, models, API keys, routing rules, request logs, usage stats.
2. Create admin menus and button permissions with the `ai:*` permission namespace.
3. Add admin APIs with `#[log]`, `#[has_perm]`, and resource-permission bindings.
4. Design API key auth: store only hashes and show plaintext only once.
5. Implement model routing from client model names to real upstream channels.
6. Add rate limits and quotas for keys, tenants, models, and token cost.
7. Create dedicated request logs for streaming responses, final status, and usage.
8. Use MCP to generate or validate CRUD, menus, dictionaries, and frontend page drafts.

This lets the AI gateway fit into the admin system while keeping relay protocol entrypoints independent.
