---
title: 项目目录结构
description: workspace crate 划分原则、关键文件位置、新增业务模块该往哪放。
published_at: 2026-05-04 11:20:00
---

# 项目目录结构

`summerrs-admin` 是一个 cargo workspace,根 `Cargo.toml` 列出全部成员:

```toml
[workspace]
members = [
    "crates/app",
    "crates/summer-admin-macros",
    "crates/summer-auth",
    "crates/summer-common",
    "crates/summer-domain",
    "crates/summer-ai",
    "crates/summer-ai/core",
    "crates/summer-ai/model",
    "crates/summer-ai/relay",
    "crates/summer-ai/admin",
    "crates/summer-ai/billing",
    "crates/summer-ai/agent",
    "crates/summer-sharding",
    "crates/summer-sql-rewrite",
    "crates/summer-mcp",
    "crates/summer-plugins",
    "crates/summer-system",
    "crates/summer-system/model",
    "crates/summer-job-dynamic",
]
```

## 顶层结构

```tree
summerrs-admin/
├── crates/                   # 所有 Rust 代码
├── config/                   # 多环境 toml 配置(app.toml + app-dev/prod/test.toml)
├── sql/                      # 数据库 source of truth(按域分文件夹)
├── doc/                      # 部署 / 迁移 / 技术指南(中文为主)
├── docs/                     # 调研、研究、参考资料(对外文档站独立另一个仓库)
├── locales/                  # rust-i18n 国际化资源(zh.yml / en.yml)
├── build-tools/              # fmt / clippy / pre-commit 脚本
├── data/                     # 静态数据(ip2region xdb、JWT key 等)
├── nginx/                    # 部署用 nginx 配置 + 证书
├── skills/                   # Claude Code 等 AI 工具的 skill 配置
├── docker-compose.yml        # 一键拉起 postgres / redis / rustfs / app
├── Dockerfile                # 多阶段构建
└── Cargo.toml                # workspace 根
```

## crates 子目录

```tree
crates/
├── app/                      # 二进制入口,只组装,不放业务
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs           # add_plugin(...) 全部插件
│       └── router.rs         # axum Router 拼装
├── summer-admin-macros/      # 声明式宏(#[login] / #[has_perm] / #[rate_limit] / #[log] / #[job_handler])
├── summer-auth/              # JWT 鉴权 + 会话 + 路径策略
├── summer-common/            # 通用类型(ApiResult / Json<T> / 分页 / 校验 / extractor)
├── summer-domain/            # 领域服务(MenuDomainService / DictDomainService 等),不依赖 web 层
├── summer-system/            # 系统业务(用户 / 角色 / 菜单 / 字典 / 配置 / 文件 / 通知 / 监控)
│   ├── src/
│   │   ├── lib.rs
│   │   ├── router/           # 19 个路由文件,一个文件一个域
│   │   ├── service/          # 对应 service 层,负责事务和聚合
│   │   ├── plugins/          # PermBitmapPlugin / SocketGatewayPlugin
│   │   ├── socketio/         # Socket.IO connection / core / handler
│   │   └── job/              # 系统域定时任务
│   └── model/                # 子 crate:entity / dto / vo / views(纯数据契约)
├── summer-ai/                # 父 crate(re-export 子 crate)
│   ├── core/                 # 协议核心(共享类型与 trait)
│   ├── model/                # SeaORM 实体 + DTO / VO
│   ├── relay/                # 中转引擎 + OpenAI/Claude/Gemini 子路由
│   ├── admin/                # AI 管理后台(channel / vendor / token / quota...)
│   ├── billing/              # 三阶段计费 + 配额扣减
│   └── agent/                # rig-core 驱动的 Agent
├── summer-sharding/          # 分片 / 多租户 / SQL 改写引擎(下层)
├── summer-sql-rewrite/       # 鉴权信息注入 SQL(上层)
├── summer-mcp/               # 嵌入式 / 独立 MCP Server
│   └── src/
│       ├── plugin.rs
│       ├── server.rs
│       ├── runtime.rs
│       ├── config.rs
│       ├── prompts.rs
│       ├── table_tools/      # schema / query_builder / sql_scanner / router
│       └── tools/            # entity / admin module / frontend bundle 生成器
├── summer-plugins/           # 共享基础插件(S3 / IP2Region / 后台任务 / 批量日志)
└── summer-job-dynamic/       # 动态调度器(数据库驱动 cron)
```

## 关键文件锚点

|  作用 | 路径 |
|---|---|
| 二进制入口 | `crates/app/src/main.rs` |
| 全局路由组装 | `crates/app/src/router.rs` |
| 默认配置 | `config/app.toml` |
| 系统域路由示例 | `crates/summer-system/src/router/sys_user.rs`, `crates/summer-system/src/router/auth.rs` |
| 系统域 Service 示例 | `crates/summer-system/src/service/sys_user_service.rs`, `crates/summer-system/src/service/online_service.rs` |
| Socket.IO 入口 | `crates/summer-system/src/plugins/socket_gateway.rs`, `crates/summer-system/src/socketio/connection/*` |
| 系统 Entity / DTO / VO | `crates/summer-system/model/src/{entity,dto,vo,views}/*` |
| 共享 schema sync | `crates/summer-plugins/src/entity_schema_sync.rs` |
| MCP 入口 | `crates/summer-mcp/src/plugin.rs`, `crates/summer-mcp/src/server.rs`, `crates/summer-mcp/src/runtime.rs` |
| MCP 工具集 | `crates/summer-mcp/src/tools/*`, `crates/summer-mcp/src/table_tools/*` |
| AI Relay router | `crates/summer-ai/relay/src/router/{openai,claude,gemini}` |
| AI Relay service | `crates/summer-ai/relay/src/service/*` |
| AI Admin router | `crates/summer-ai/admin/src/router/*`(channel / token / vendor / quota...) |
| 声明式宏实现 | `crates/summer-admin-macros/src/{auth_macro,log_macro,rate_limit_macro,job_handler_macro}.rs` |

## crate 划分原则

参照仓库 `skills/summerrs-admin/SKILL.md`:

1. **`crates/app`** —— 只放组装代码(`main.rs` / `router.rs`),**不要**放业务逻辑。
2. **`crates/summer-system`** —— 系统域业务代码全部在这里(用户、角色、菜单等)。
3. **`crates/summer-system/model`** —— 系统域的 Entity / DTO / VO / Views,纯数据契约,不引 web。
4. **`crates/summer-ai/model`** —— AI 模型契约 (Entity / DTO / VO)。
5. **`crates/summer-ai/relay`** —— AI 中转的运行时与协议适配。
6. **`crates/summer-plugins`** —— 共享基础设施插件(S3 / IP / 后台任务 / 批量日志),不绑定特定业务。
7. **`crates/summer-domain`** —— 领域服务,跨 crate 复用(例如 MCP 和 system 都用 `MenuDomainService`)。

## 新增业务模块的标准流程

假设要加一个"标签管理":

1. **建表 SQL** → 在 `sql/sys/tag.sql` 写好 DDL + 初始数据。
2. **生成 SeaORM Entity** → 用 MCP 的 `generate_entity_from_table` 工具生成,落到 `crates/summer-system/model/src/entity/sys_tag.rs`。
3. **DTO / VO** → `crates/summer-system/model/src/dto/sys_tag.rs` + `vo/sys_tag.rs`。
4. **Service** → `crates/summer-system/src/service/sys_tag_service.rs`(事务、聚合、策略)。
5. **Router** → `crates/summer-system/src/router/sys_tag.rs`,加上 `#[has_perm("system:tag:list")]` 等宏。
6. **挂载** → 在 `crates/summer-system/src/router/mod.rs` 加 `let router = sys_tag::routes(router);`。
7. **菜单 + 字典** → 用 MCP 的 `menu_tool::plan_apply` 把菜单和按钮权限批量写入 `sys.menu`。

> 推荐**先用 MCP 工具批量生成**,再手工调整。这样命名风格和文件位置自然贴合现有约定。

## 测试与脚本

- **格式化** —— `cargo fmt` 或 `build-tools/pre-commit`(整合 fmt + clippy)
- **lint** —— `cargo clippy --workspace --all-targets --all-features`
- **构建** —— `cargo build --release -p app`
- **运行** —— `cargo run -p app --release`(读 `.env`)

## 仓库根目录的非代码文件

| 文件 | 用途 |
|---|---|
| `.editorconfig` | 编辑器统一配置 |
| `.taplo.toml` | TOML 格式化(rustfmt 不管 toml) |
| `rustfmt.toml` | Rust 代码风格 |
| `.dockerignore` | 控制 Docker 构建上下文 |
| `LICENSE` | MIT |

## 下一步

- [整体架构](./overview) —— 请求流转
- [17 个插件清单](./plugins) —— 每个插件的依赖、配置段
- [认证授权](../core/auth) —— 第一站核心机制
