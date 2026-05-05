---
title: 整体架构
description: Summerrs Admin 的请求流转、域划分、入口路由组装。
published_at: 2026-05-04 11:00:00
---

# 整体架构

Summerrs Admin 的核心架构观点只有一句:**用插件组合替代脚手架**。所有运行时能力都封装为一个 `Plugin`,在 `crates/app/src/main.rs` 里按依赖顺序串起来。

## 请求流转

```mermaid
flowchart TD
    A[Client / Browser / AI Agent] -->|HTTP 8080| B[Tower / tower-http 中间件层]
    B --> C{Path 匹配}
    C -->|/api/...| D[summer-system / summer-ai-admin / summer-job-dynamic]
    C -->|/v1/... or /v1beta/...| E[summer-ai-relay]
    C -->|/api/mcp| F[summer-mcp]
    C -->|其他| G[auto_grouped_routers.default]
    D -->|JWT 鉴权| H[GroupAuthLayer + JwtStrategy]
    E -->|API key 鉴权| I[GroupAuthLayer + ApiKeyStrategy + flavor panic_guard]
    H --> J[声明式宏层 #login / #has_perm / #rate_limit / #log]
    J --> K[Service 层 业务事务]
    I --> K
    K --> L[summer-sharding / summer-sql-rewrite]
    L --> M[(PostgreSQL 17)]
    K --> N[(Redis 7)]
    K --> O[Socket.IO / 后台任务 / S3]
```

## 三大入口域

`crates/app/src/router.rs` 把整套路由分成 3 个独立域:

```rust
pub fn router() -> Router {
    let api_router = summer_system::router_with_layers()
        .merge(summer_ai_admin::router_with_layers())
        .merge(summer_job_dynamic::router_with_layers());

    let default_router = auto_grouped_routers().default;

    Router::new()
        .nest("/api", api_router)              // 域 1:JWT
        .merge(default_router)                  // 域 3:default
        .layer(CatchPanicLayer::custom(handle_panic))
        .merge(summer_ai_relay::router_with_layers())  // 域 2:API key
        .layer(ClientIpSource::ConnectInfo.into_extension())
}
```

| 域 | 路径 | 鉴权 | panic 处理 |
|---|---|---|---|
| **admin / system** | `/api/*` | JWT(`Authorization: Bearer ...`) | 全局 `CatchPanicLayer` 转 RFC 7807 |
| **ai relay** | `/v1/*`, `/v1beta/*` | API key(`Authorization: Bearer sk-xxx`) | 各自 flavor 的 `*_panic_guard`(转 OpenAI / Claude / Gemini 风格 JSON) |
| **default** | 没显式 group 的路由 | 无 | 全局 `CatchPanicLayer` |

> 关键设计:`panic_guard` 在 `GroupAuthLayer` 外层,鉴权阶段的 panic 也会被各家的 flavor 抓住,避免误返成系统级 RFC 7807。

## AI Relay 的子路由

`crates/summer-ai/relay/src/router/mod.rs` 把 relay 内部又拆成三家:

```rust
pub fn router_with_layers() -> Router {
    let openai = grouped_router(relay_openai_group())
        .layer(GroupAuthLayer::new(ApiKeyStrategy::for_group(
            relay_openai_group(), ErrorFlavor::OpenAI)))
        .layer(middleware::from_fn(openai_panic_guard));

    let claude = grouped_router(relay_claude_group())
        .layer(GroupAuthLayer::new(ApiKeyStrategy::for_group(
            relay_claude_group(), ErrorFlavor::Claude)))
        .layer(middleware::from_fn(claude_panic_guard));

    let gemini = grouped_router(relay_gemini_group())
        .layer(GroupAuthLayer::new(ApiKeyStrategy::for_group(
            relay_gemini_group(), ErrorFlavor::Gemini)))
        .layer(middleware::from_fn(gemini_panic_guard));

    Router::new()
        .merge(openai).merge(claude).merge(gemini)
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
}
```

每家协议的鉴权失败和 panic 都按对应"风味"返回——OpenAI 风格的 `{"error": {...}}`、Claude 风格的 `{"type": "error", "error": {...}}`、Gemini 风格的错误 JSON。客户端 SDK 不用改,可以无缝接入。

## 域之间怎么解耦

每个 crate 自带 `router_with_layers()`,负责"路由 + 自家中间件"打包,`crates/app` 只做拼装:

```text
summer-system::router_with_layers()       挂 JWT
summer-ai-admin::router_with_layers()     挂 JWT,合到 /api 下
summer-ai-relay::router_with_layers()     按 flavor 挂三套 ApiKeyStrategy + panic_guard
summer-job-dynamic::router_with_layers()  动态调度器 admin API,挂 JWT
auto_grouped_routers().default            没显式 group 的 handler,无鉴权
```

这种"自包装"设计的好处:

- **新增业务域只动两个文件**:在新 crate 里写好 `router_with_layers()`,再到 `crates/app/src/router.rs` 加一行 `merge`。
- **自家中间件不会污染别人**:relay 的 `panic_guard` 只覆盖 relay 路由,system 域没有。
- **app crate 不依赖 relay 内部细节**:不用 import `ApiKeyStrategy`、`ErrorFlavor`,黑盒拼装。

## 数据访问层

```mermaid
flowchart LR
    A[Service] --> B[SeaORM EntityModel]
    B --> C[summer-sql-rewrite]
    C -->|改写后 SQL| D[summer-sharding]
    D --> E[summer-sea-orm Connector]
    E --> F[(Postgres)]
```

- `summer-sql-rewrite`:把鉴权信息(用户、角色、租户、权限)注入到 SQL where 子句。常见用例:行级安全、按租户过滤。
- `summer-sharding`:更上层的 SQL 改写引擎,实现四级租户隔离、分片、加密、脱敏、影子库、CDC。
- `summer-sea-orm`:对 SeaORM 的薄包装,处理连接池配置和 Web 层的分页/排序约定。

详见 [多租户](../core/multi-tenancy)。

## 异步运行时

主二进制用 `#[tokio::main]`(`features = ["full"]`),关键后台任务:

| 任务 | 谁跑 | 关键参数 |
|---|---|---|
| HTTP server | `WebPlugin` | `[web].port`(默认 8080)、`graceful = true` |
| 数据库连接池 | `SeaOrmPlugin` | `[sea-orm].uri` |
| Redis 连接池 | `RedisPlugin` | `[redis].uri` |
| Socket.IO | `SocketGatewayPlugin` | `[socket-gateway]` 用 Redis 共享会话状态 |
| 定时任务 | `JobPlugin` + `SummerSchedulerPlugin` | `tokio-cron-scheduler`,DB 驱动可热改 |
| 后台任务队列 | `BackgroundTaskPlugin` | 4 worker / 4096 容量 |
| 批量日志 | `LogBatchCollectorPlugin` | `[log-batch].batch_size` |
| MCP server | `McpPlugin` | embedded → 挂 axum;standalone → 单独 spawn |

## 配置与环境

所有插件用 Summer 的 `Configurable` derive 从 `config/app[-{env}].toml` 读取配置,变量用 `${VAR:default}` 插值:

```toml
[sea-orm]
uri = "${DATABASE_URL:postgres://admin:123456@localhost/summerrs-admin}"

[auth]
jwt_secret = "${JWT_SECRET:change-me-in-local-dev}"
```

`SUMMER_ENV` 环境变量决定加载哪个 profile:

| `SUMMER_ENV` | 加载 |
|---|---|
| 不设 / `dev` | `app.toml` + `app-dev.toml` |
| `prod` | `app.toml` + `app-prod.toml` |
| `test` | `app.toml` + `app-test.toml` |

## 下一步

- [17 个插件清单与依赖](./plugins) —— 每个插件的作用、读哪个配置段
- [项目目录结构](./directory) —— crate 划分原则、典型文件位置
- [认证授权](../core/auth) / [多租户](../core/multi-tenancy) / [AI 网关](../core/ai-gateway) / [MCP](../core/mcp) —— 核心能力深挖
