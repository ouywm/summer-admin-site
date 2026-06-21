---
title: Rate Limits & Logging
description: Declarative rate limits, standard response headers, operation logs, and batched writes.
published_at: 2026-05-04 12:40:00
---

# Rate Limits & Logging

Rate limits protect high-traffic endpoints so one user, IP, or caller cannot exhaust service resources in a short time. Logs record key admin actions so login, create/update/delete, resource access, errors, and latency can be audited.

Summerrs Admin provides two groups of capabilities:

| Capability | What it does |
|---|---|
| `#[rate_limit]` | Adds declarative rate limits to HTTP handlers by IP, user, header, or global key |
| `RateLimitEngine` | Maintains rate-limit state in memory or Redis with multiple algorithms and failure policies |
| `rate_limit_headers_middleware` | Adds `RateLimit-*` and `Retry-After` response headers |
| `#[log]` | Records admin operation request, response, duration, status, and error |
| `LogBatchCollectorPlugin` | Batches operation and login logs into the database, reducing request-path cost |

## Declarative Rate Limits

Use `#[rate_limit]` on HTTP handlers. It checks the limit before business logic runs. When the request is limited, it returns `429 Too Many Requests`; when the Redis backend is unavailable and the policy is `fail_closed`, it returns `503 Service Unavailable`.

The common case is rate limiting by IP or user:

```rust
use summer_admin_macros::rate_limit;
use summer_common::error::ApiResult;
use summer_web::get_api;

#[rate_limit(rate = 2, per = "second", key = "ip")]
#[get_api("/limited")]
async fn limited_handler() -> ApiResult<()> {
    Ok(())
}
```

Usage notes:

- Only async free functions are supported.
- Methods with `self` are not supported.
- Put `#[rate_limit]` outside the route macro, for example above `#[get_api]`.

## Integration Prerequisites

The macro depends on `summer_common::rate_limit::RateLimitEngine`. Before enabling rate limits on business endpoints, provide this component in the app.

Register it through the plugin:

```rust
use summer_system::plugins::rate_limit::RateLimitPlugin;

app.add_plugin(RedisPlugin)
   .add_plugin(RateLimitPlugin);
```

`RateLimitPlugin` reads `summer_redis::Redis` from app components, then registers:

```rust
let engine = summer_common::rate_limit::RateLimitEngine::new(redis);
app.add_component(engine);
```

For custom routers or tests, you can also inject `RateLimitEngine` directly as an axum extension or Summer component.

To add response headers automatically, mount:

```rust
use summer_common::rate_limit::middleware::rate_limit_headers_middleware;
use summer_web::axum::middleware;

router.layer(middleware::from_fn(rate_limit_headers_middleware));
```

## Parameters

| Param | Default | Description |
|---|---|---|
| `rate` | required | Requests allowed per window; must be greater than 0 |
| `per` | required | `"second"`, `"minute"`, `"hour"`, `"day"` |
| `key` | `"global"` | `"global"`, `"ip"`, `"user"`, `"header:<name>"` |
| `backend` | `"memory"` | `"memory"` or `"redis"` |
| `algorithm` | `"token_bucket"` | See algorithm table below |
| `failure_policy` | `"fail_open"` | Redis failure policy |
| `burst` | `rate` | Supported only by `token_bucket` / `gcra` |
| `max_wait_ms` | none | Supported only by `throttle_queue`; must be greater than 0 |
| `message` | `"请求过于频繁"` | 429 response message |
| `mode` | `"enforce"` | `"enforce"` or `"shadow"` |

`key = "user"` prefers the logged-in user ID. When the user is anonymous, it falls back to `ip:<client_ip>` and does not share buckets with `key = "ip"`. `key = "header:X-Tenant-Id"` buckets by the header value; missing headers use `unknown`.

## Algorithms

| `algorithm` | Core | Description |
|---|---|---|
| `token_bucket` | GCRA | Default; burst defaults to rate |
| `gcra` | GCRA | Explicit GCRA, good for precise burst control |
| `leaky_bucket` | ScheduledSlot | Strictly spaces requests by 1/rate |
| `throttle_queue` | ScheduledSlot | Waits within `max_wait_ms`, then rejects |
| `fixed_window` | Counter | Counts by natural window boundaries |
| `sliding_window` | Timestamp log | More accurate, higher memory cost |

Only `token_bucket` and `gcra` support cost-based limits and reservations.

## Redis Failure Policies

When `backend = "redis"`, Redis failures are handled by `failure_policy`:

| Policy | Behavior |
|---|---|
| `fail_open` | Allow the request and record stats |
| `fail_closed` | Return 503 |
| `fallback_memory` | Use an in-process memory bucket |

In multi-instance deployments, `fallback_memory` only counts within one process, so semantics degrade. External APIs usually prefer `fail_open` for availability; strict quotas may prefer `fail_closed`.

## Shadow Mode

`mode = "shadow"` records "this would have been rejected" without actually rejecting the request:

```rust
#[rate_limit(rate = 10, per = "minute", key = "user", mode = "shadow")]
#[get_api("/expensive")]
async fn expensive() -> ApiResult<()> {
    Ok(())
}
```

Shadow and Enforce share the same bucket state. If shadow runs for a long time and you switch directly to enforce, requests may be rejected immediately for a while. Call `RateLimitEngine::reset_key` before switching when needed.

## Cost And Reservation

`RateLimitContext` also supports cost-based quota consumption:

```rust
let key = rate_limit_ctx.extract_key(RateLimitKeyType::User);

let _meta = rate_limit_ctx
    .check_with_cost(&key, config.clone(), 20, "请求过于频繁")
    .await?;
```

For "reserve first, settle later" workloads, use `reserve`:

```rust
let reservation = rate_limit_ctx
    .reserve(&key, config.clone(), estimated_cost, "请求过于频繁")
    .await?;

// Commit after success; release/refund on failure or over-estimation.
```

This fits AI tokens, bulk imports, file processing, and similar cost-based tasks. Non-GCRA algorithms treat `cost > 1` as one request and warn on first occurrence.

## Response Headers

If `rate_limit_headers_middleware` is mounted, responses automatically include IETF draft-style rate-limit headers:

| Header | Meaning |
|---|---|
| `RateLimit-Limit` | Bucket or window capacity |
| `RateLimit-Remaining` | Immediately available remaining quota |
| `RateLimit-Reset` | Seconds until recovery |
| `Retry-After` | Returned only when rate limited |

When limited, the business response uses the unified error format:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 1
Content-Type: application/json

{
  "code": 429,
  "message": "请求过于频繁"
}
```

## Operation Log Macro

System endpoints can use `#[log]` for operation audit:

```rust
#[log(module = "用户管理", action = "创建用户", biz_type = Create)]
#[has_perm("system:user:create")]
#[post_api("/user")]
pub async fn create_user(...) -> ApiResult<()> {
    // ...
}
```

The macro injects `OperationLogContext` and records:

| Field | Source |
|---|---|
| `module` / `action` / `business_type` | Macro parameters |
| `request_method` / `request_url` | HTTP request |
| `request_params` | Query and JSON body; can be disabled |
| `response_body` | Response body; can be disabled |
| `response_code` | Handler result or error mapping |
| `client_ip` / `user_agent` | Request context |
| `user_id` / `user_name` | Login-session `UserSession` |
| `duration` | Handler duration |
| `status` / `error_msg` | Success, failure, or panic |

Disable parameter logging for sensitive endpoints:

```rust
#[log(module = "认证管理", action = "管理员登录", biz_type = Auth, save_params = false)]
```

Disable response logging for large responses or file responses:

```rust
#[log(module = "文件管理", action = "公开分享下载", biz_type = Query, save_response = false)]
```

## Batched Log Writes

The main app registers:

```rust
app.add_plugin(LogBatchCollectorPlugin)
```

`LogBatchCollectorPlugin` provides `OperationLogCollector` and `LoginLogCollector`. Services do not write to the database synchronously. They `try_send` into a bounded channel, and a background worker performs batched `insert_many` when thresholds are reached.

Default config comes from `summer-plugins/src/log_batch_collector/config.rs`:

```toml
[log-batch]
batch_size = 50
flush_interval_ms = 500
capacity = 4096
```

| Param | Default | Description |
|---|---|---|
| `batch_size` | `50` | Number of records before batched INSERT |
| `flush_interval_ms` | `500` | Forced flush interval when the batch is not full |
| `capacity` | `4096` | Channel capacity |

When the channel is full or closed, logs are dropped and a warning is recorded. The main request path is not blocked.

## Query Logs

System routes provide log queries:

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/operation-log/list` | `system:operation-log:list` |
| `GET` | `/api/operation-log/{id}` | `system:operation-log:detail` |
| `GET` | `/api/login-log/list` | `system:login-log:list` |

Log-query endpoints also use `#[log]`, so an admin viewing logs is itself recorded in operation logs.

## Practical Advice

- Normal admin CRUD usually only needs `#[log]` and permission macros.
- Disable parameter or response logging for login, passwords, tokens, file downloads, and large responses.
- Register `RateLimitEngine` before enabling rate limits, then start with a small set of endpoints.
- Use Redis backend for external APIs or high-cost endpoints.
- Observe with `shadow` mode before switching to `enforce`; reset buckets before switching when needed.
- Mount `rate_limit_headers_middleware` when clients need automatic backoff hints.
