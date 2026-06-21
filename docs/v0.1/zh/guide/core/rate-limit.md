---
title: 限流与日志
description: 声明式限流、标准响应头、操作日志与批量写入。
published_at: 2026-05-04 12:40:00
---

# 限流与日志

限流用于保护高频接口,避免单个用户、IP 或调用方在短时间内打满服务资源。日志用于记录管理后台里的关键操作,让登录、增删改、资源访问、异常和耗时都有迹可查。

Summerrs Admin 提供两类能力:

| 能力 | 可以做什么 |
|---|---|
| `#[rate_limit]` | 给 HTTP handler 增加声明式限流,支持 IP、用户、Header 和全局维度 |
| `RateLimitEngine` | 使用内存或 Redis 维护限流状态,支持多种算法和故障策略 |
| `rate_limit_headers_middleware` | 自动输出 `RateLimit-*` 和 `Retry-After` 响应头 |
| `#[log]` | 记录管理操作的请求、响应、耗时、状态和错误 |
| `LogBatchCollectorPlugin` | 将操作日志和登录日志批量写入数据库,降低主请求开销 |

## 声明式限流

`#[rate_limit]` 用在 HTTP handler 上。它会在业务逻辑执行前完成限流检查,命中时直接返回 `429 Too Many Requests`;Redis 后端不可用且策略为 `fail_closed` 时返回 `503 Service Unavailable`。

最常见的是按 IP 或用户限流:

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

使用时注意:

- 只能用于 async free function。
- 不支持带 `self` 的方法。
- 必须放在路由宏外层,例如 `#[rate_limit]` 写在 `#[get_api]` 上方。

## 接入前置条件

限流宏依赖 `summer_common::rate_limit::RateLimitEngine`。业务接口启用限流前,需要先在应用里提供这个组件。

可以通过插件注册:

```rust
use summer_system::plugins::rate_limit::RateLimitPlugin;

app.add_plugin(RedisPlugin)
   .add_plugin(RateLimitPlugin);
```

`RateLimitPlugin` 会从 app 组件里取 `summer_redis::Redis`,然后注册:

```rust
let engine = summer_common::rate_limit::RateLimitEngine::new(redis);
app.add_component(engine);
```

也可以在自定义 router 或测试场景里,直接把 `RateLimitEngine` 作为 axum extension 或 summer 组件注入。

如果还想自动写响应头,需要给 router 挂:

```rust
use summer_common::rate_limit::middleware::rate_limit_headers_middleware;
use summer_web::axum::middleware;

router.layer(middleware::from_fn(rate_limit_headers_middleware));
```

## 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `rate` | 必填 | 每个窗口允许的请求数,必须大于 0 |
| `per` | 必填 | `"second"`、`"minute"`、`"hour"`、`"day"` |
| `key` | `"global"` | `"global"`、`"ip"`、`"user"`、`"header:<name>"` |
| `backend` | `"memory"` | `"memory"` 或 `"redis"` |
| `algorithm` | `"token_bucket"` | 见下方算法表 |
| `failure_policy` | `"fail_open"` | Redis 故障时的策略 |
| `burst` | `rate` | 仅 `token_bucket` / `gcra` 支持 |
| `max_wait_ms` | 无 | 仅 `throttle_queue` 支持且必须大于 0 |
| `message` | `"请求过于频繁"` | 429 响应提示 |
| `mode` | `"enforce"` | `"enforce"` 或 `"shadow"` |

`key = "user"` 会优先使用登录用户 ID;未登录时回退到 `ip:<client_ip>`,不会和 `key = "ip"` 串桶。`key = "header:X-Tenant-Id"` 会按 Header 值分桶,Header 缺失时使用 `unknown`。

## 算法

| `algorithm` | 内核 | 说明 |
|---|---|---|
| `token_bucket` | GCRA | 默认选项,burst 默认等于 rate |
| `gcra` | GCRA | 显式 GCRA,适合精确控制突发 |
| `leaky_bucket` | ScheduledSlot | 严格按 1/rate 间隔放行 |
| `throttle_queue` | ScheduledSlot | 在 `max_wait_ms` 内等待,超过才拒绝 |
| `fixed_window` | 计数器 | 按自然窗口边界计数 |
| `sliding_window` | 时间戳日志 | 更精确,内存开销更高 |

只有 `token_bucket` 和 `gcra` 支持 cost-based 限流和 reservation。

## Redis 故障策略

`backend = "redis"` 时,Redis 故障由 `failure_policy` 决定:

| 策略 | 行为 |
|---|---|
| `fail_open` | 放行,记录统计 |
| `fail_closed` | 返回 503 |
| `fallback_memory` | 使用本进程内存桶兜底 |

多实例部署时,`fallback_memory` 只在单个进程内计数,语义会降级。对外部 API 更看重可用性时通常选 `fail_open`;对配额严格性要求更高时选 `fail_closed`。

## Shadow 模式

`mode = "shadow"` 表示只记录“本来会拒绝”,但不真的拒绝请求:

```rust
#[rate_limit(rate = 10, per = "minute", key = "user", mode = "shadow")]
#[get_api("/expensive")]
async fn expensive() -> ApiResult<()> {
    Ok(())
}
```

Shadow 和 Enforce 共享同一个桶状态。长期跑 shadow 后直接切到 enforce,可能立刻拒绝一段时间。切换前可以调用 `RateLimitEngine::reset_key` 清桶。

## Cost 与预扣

`RateLimitContext` 还支持按 cost 消耗配额:

```rust
let key = rate_limit_ctx.extract_key(RateLimitKeyType::User);

let _meta = rate_limit_ctx
    .check_with_cost(&key, config.clone(), 20, "请求过于频繁")
    .await?;
```

如果业务需要“先预扣,结束后按真实消耗找平”,使用 `reserve`:

```rust
let reservation = rate_limit_ctx
    .reserve(&key, config.clone(), estimated_cost, "请求过于频繁")
    .await?;

// 成功后 commit,失败或估算过高时 release/refund。
```

这类能力适合 AI token、批量导入、文件处理等消耗型任务。非 GCRA 算法收到 `cost > 1` 时只按 1 次请求计数,并首次打 warn。

## 响应头

如果挂了 `rate_limit_headers_middleware`,响应会自动带 IETF draft 风格的限流头:

| Header | 含义 |
|---|---|
| `RateLimit-Limit` | 桶或窗口容量 |
| `RateLimit-Remaining` | 剩余可立即使用配额 |
| `RateLimit-Reset` | 恢复所需秒数 |
| `Retry-After` | 仅限流拒绝时返回 |

被限流时,业务响应使用统一错误格式:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 1
Content-Type: application/json

{
  "code": 429,
  "message": "请求过于频繁"
}
```

## 操作日志宏

系统接口可以使用 `#[log]` 记录操作审计:

```rust
#[log(module = "用户管理", action = "创建用户", biz_type = Create)]
#[has_perm("system:user:create")]
#[post_api("/user")]
pub async fn create_user(...) -> ApiResult<()> {
    // ...
}
```

宏展开后会注入 `OperationLogContext`,记录:

| 字段 | 来源 |
|---|---|
| `module` / `action` / `business_type` | 宏参数 |
| `request_method` / `request_url` | HTTP 请求 |
| `request_params` | query 和 JSON body,可关闭 |
| `response_body` | 响应体,可关闭 |
| `response_code` | handler 返回或错误映射 |
| `client_ip` / `user_agent` | 请求上下文 |
| `user_id` / `user_name` | 登录会话 `UserSession` |
| `duration` | handler 耗时 |
| `status` / `error_msg` | 成功、失败或 panic |

敏感接口要关闭参数记录:

```rust
#[log(module = "认证管理", action = "管理员登录", biz_type = Auth, save_params = false)]
```

大响应或文件响应要关闭响应体记录:

```rust
#[log(module = "文件管理", action = "公开分享下载", biz_type = Query, save_response = false)]
```

## 日志批量写入

主应用已注册:

```rust
app.add_plugin(LogBatchCollectorPlugin)
```

`LogBatchCollectorPlugin` 提供 `OperationLogCollector` 和 `LoginLogCollector`。service 不同步写库,而是先 `try_send` 到有界 channel,后台 worker 满足条件后批量 `insert_many`。

默认配置来自 `summer-plugins/src/log_batch_collector/config.rs`:

```toml
[log-batch]
batch_size = 50
flush_interval_ms = 500
capacity = 4096
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `batch_size` | `50` | 累积多少条后批量 INSERT |
| `flush_interval_ms` | `500` | 不足 batch size 时的强制刷新间隔 |
| `capacity` | `4096` | channel 容量 |

通道满或关闭时,日志会被丢弃并记录 warn,不会阻塞主请求。

## 查询日志

系统路由提供日志查询:

| 方法 | 路径 | 权限 |
|---|---|---|
| `GET` | `/api/operation-log/list` | `system:operation-log:list` |
| `GET` | `/api/operation-log/{id}` | `system:operation-log:detail` |
| `GET` | `/api/login-log/list` | `system:login-log:list` |

日志查询本身也挂了 `#[log]`,所以管理员查看日志的动作也会进入操作日志。

## 实践建议

- 普通后台 CRUD 优先只用 `#[log]` 和权限宏。
- 登录、密码、token、文件下载等敏感/大体积接口要关闭参数或响应体记录。
- 限流上线前先注册 `RateLimitEngine`,再从少量接口开始。
- 外部 API 或高成本接口优先使用 Redis 后端。
- 从 `shadow` 模式观察一段时间再切 `enforce`,切换前注意清桶。
- 如果需要客户端自动退避,别忘了挂 `rate_limit_headers_middleware`。
