---
title: 项目目录结构
description: Summerrs Admin 的 workspace 结构、crate 划分和关键文件位置
published_at: 2026-06-16 14:00:00
---

# 项目目录结构

`summerrs-admin` 是一个 Cargo workspace，所有业务代码以独立 crate 形式组织。

## Workspace 成员

根 `Cargo.toml` 定义的 workspace members：

```toml
[workspace]
members = [
    "crates/app",
    "crates/summer-admin-macros",
    "crates/summer-auth",
    "crates/summer-common",
    "crates/summer-domain",
    "crates/summer-mcp",
    "crates/summer-migration",
    "crates/summer-plugins",
    "crates/summer-system",
    "crates/summer-system/model",
]
```

## 顶层目录

```tree
summerrs-admin/
├── crates/               # 所有 Rust 代码
├── config/               # 多环境配置 (app.toml, app-dev.toml, app-prod.toml)
├── data/                 # 静态数据 (ip2region 数据库、JWT 密钥等)
├── build-tools/          # 格式化、检查脚本
├── locales/              # 国际化资源 (rust-i18n)
├── logs/                 # 运行时日志
├── doc/                  # 部署文档、技术指南
├── docs/                 # 研究资料
├── docker-compose.yml    # 一键启动环境
├── Dockerfile            # 多阶段构建
└── Cargo.toml            # workspace 根
```

## Crates 结构

### 核心 Crates

| Crate | 用途 |
|---|---|
| **app** | 二进制入口，组装所有插件和路由 |
| **summer-system** | 系统管理业务（用户、角色、菜单、字典、配置、文件、通知、日志、监控） |
| **summer-system/model** | 系统域数据模型（Entity / DTO / VO），不依赖 web 层 |

### 基础设施 Crates

| Crate | 用途 |
|---|---|
| **summer-common** | 通用类型（ApiResult、分页、校验、extractor） |
| **summer-auth** | JWT 鉴权、会话管理、权限策略 |
| **summer-domain** | 领域服务（MenuDomainService、DictDomainService），跨 crate 复用 |
| **summer-plugins** | 基础插件（S3 存储、IP2Region、后台任务队列、批量日志） |
| **summer-admin-macros** | 声明式宏（`#[login]`、`#[has_perm]`、`#[rate_limit]`、`#[log]`） |

### 工具 Crates

| Crate | 用途 |
|---|---|
| **summer-mcp** | MCP Server（Schema 发现、表 CRUD、代码生成、菜单/字典工具） |
| **summer-migration** | 数据库迁移（SeaORM migration） |

## 关键文件位置

### 入口和配置

| 文件 | 作用 |
|---|---|
| `crates/app/src/main.rs` | 应用入口，插件注册 |
| `crates/app/src/router.rs` | 全局路由组装 |
| `config/app.toml` | 默认配置 |
| `config/app-dev.toml` | 开发环境配置 |
| `config/app-prod.toml` | 生产环境配置 |

### 系统域

| 文件 | 作用 |
|---|---|
| `crates/summer-system/src/router/` | 系统域所有路由（用户、角色、菜单等） |
| `crates/summer-system/src/service/` | 业务逻辑层（Service） |
| `crates/summer-system/model/src/entity/` | SeaORM 实体定义 |
| `crates/summer-system/model/src/dto/` | 请求 DTO |
| `crates/summer-system/model/src/vo/` | 响应 VO |

### MCP 相关

| 文件 | 作用 |
|---|---|
| `crates/summer-mcp/src/plugin.rs` | MCP 插件入口 |
| `crates/summer-mcp/src/server.rs` | MCP 服务器实现 |
| `crates/summer-mcp/src/tools/` | MCP 工具集（代码生成等） |
| `crates/summer-mcp/templates/` | 代码生成模板 |

## Crate 划分原则

1. **app** - 只负责组装，不写业务逻辑
2. **summer-system** - 系统管理的所有业务代码
3. **summer-system/model** - 纯数据模型，不依赖 web/service
4. **summer-common** - 真正通用的类型和工具
5. **summer-plugins** - 可复用的基础设施插件
6. **summer-domain** - 跨模块的领域服务

## 配置加载机制

配置文件通过 `SUMMER_ENV` 环境变量切换：

| `SUMMER_ENV` | 加载文件 |
|---|---|
| 未设置或 `dev` | `app.toml` + `app-dev.toml` |
| `prod` | `app.toml` + `app-prod.toml` |
| `test` | `app.toml` + `app-test.toml` |

配置中可以使用环境变量插值：

```toml
[sea-orm]
uri = "${DATABASE_URL:postgres://admin:123456@localhost/summerrs-admin}"

[auth]
jwt_secret = "${JWT_SECRET:change-me-in-local-dev}"
```

## 常用命令

```bash
# 格式化
cargo fmt

# 检查
cargo clippy --workspace --all-targets

# 构建
cargo build --release --bin app

# 运行
cargo run --bin app
```

## 下一步

- [认证授权](../core/auth) - JWT 鉴权和权限系统
- [多租户](../core/multi-tenancy) - 租户隔离机制
- [MCP](../core/mcp) - Model Context Protocol 集成
