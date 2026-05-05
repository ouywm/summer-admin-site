---
title: Rate-limit & Logging
description: Five algorithms, GCRA core, declarative #[rate_limit], batched op log writes.
published_at: 2026-05-04 12:40:00
---

# Rate-limit & Logging

> Full Chinese version: [`/guide/core/rate-limit`](/guide/core/rate-limit).

## Algorithms

| `algorithm` | Backing | Best for |
|---|---|---|
| `token_bucket` (default) | GCRA, burst = rate | General use |
| `gcra` | Explicit GCRA, custom burst | Precise burst control |
| `leaky_bucket` | Strict 1/rate spacing | Absolute uniformity |
| `throttle_queue` | Leaky bucket + queue | Wait up to `max_wait_ms` instead of rejecting |
| `fixed_window` | Calendar-aligned counters | Simple "N per minute" |
| `sliding_window` | Timestamp log | Most accurate, more memory |

## Usage

```rust
use summer_admin_macros::rate_limit;

// 2/sec per IP
#[rate_limit(rate = 2, per = "second", key = "ip")]
#[get_api("/limited")]
async fn limited() -> ApiResult<()> { Ok(()) }

// GCRA with burst
#[rate_limit(rate = 1, per = "second", burst = 10, algorithm = "gcra", key = "ip")]
#[get_api("/api")]
async fn api() -> ApiResult<()> { Ok(()) }

// Throttle queue
#[rate_limit(rate = 5, per = "second", key = "user",
             algorithm = "throttle_queue", max_wait_ms = 1500)]
#[get_api("/queue")]
async fn queue() -> ApiResult<()> { Ok(()) }
```

## Parameters

| Param | Default | Notes |
|---|---|---|
| `rate` | required | window allowance |
| `per` | required | `"second" / "minute" / "hour" / "day"` |
| `key` | `"global"` | `"global" / "ip" / "user" / "header:<name>"` |
| `backend` | `"memory"` | `"memory" / "redis"` |
| `algorithm` | `"token_bucket"` | see table |
| `failure_policy` | `"fail_open"` | `"fail_open" / "fail_closed" / "fallback_memory"` |
| `burst` | `= rate` | `token_bucket` / `gcra` only |
| `max_wait_ms` | — | `throttle_queue` only |
| `message` | "请求过于频繁" | response message |

## Failure policy

For `backend = "redis"`:

- `fail_open` — let it through, log stats (default)
- `fail_closed` — return 503
- `fallback_memory` — drop to in-process bucket (multi-instance accuracy degrades)

## Operation log `#[log]`

```rust
#[log(module = "User Mgmt", action = "Create user", biz_type = Create)]
#[post_api("/user")]
async fn create_user(...) -> ApiResult<()> { ... }
```

`#[log]` doesn't write `sys.operation_log` synchronously. It pushes records into a channel; `LogBatchCollectorPlugin` flushes them in batches:

```toml
[log-batch]
batch_size = 100
```

This keeps the request hot path microsecond-fast while bounding DB write rate.

## Source files

- `crates/summer-admin-macros/src/{rate_limit_macro,log_macro}.rs`
- `crates/summer-common/src/rate_limit/`
- `crates/summer-plugins/src/log_batch_collector/`
