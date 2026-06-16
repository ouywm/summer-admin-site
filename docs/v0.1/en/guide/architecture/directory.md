---
title: Project Structure
description: Summerrs Admin workspace layout, crate organization, and key file locations
published_at: 2026-06-16 14:00:00
---

# Project Structure

`summerrs-admin` is a Cargo workspace with all business code organized as independent crates.

## Workspace Members

From root `Cargo.toml`:

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

## Top-Level Layout

```tree
summerrs-admin/
├── crates/               # All Rust code
├── config/               # Multi-environment config (app.toml, app-dev.toml, app-prod.toml)
├── data/                 # Static data (ip2region DB, JWT keys, etc.)
├── build-tools/          # Format and lint scripts
├── locales/              # I18n resources (rust-i18n)
├── logs/                 # Runtime logs
├── doc/                  # Deployment docs, technical guides
├── docs/                 # Research materials
├── docker-compose.yml    # One-shot environment
├── Dockerfile            # Multi-stage build
└── Cargo.toml            # Workspace root
```

## Crates Structure

### Core Crates

| Crate | Purpose |
|---|---|
| **app** | Binary entry point, assembles all plugins and routes |
| **summer-system** | System management (users, roles, menus, dicts, config, files, notifications, logs, monitoring) |
| **summer-system/model** | System domain data models (Entity / DTO / VO), web-agnostic |

### Infrastructure Crates

| Crate | Purpose |
|---|---|
| **summer-common** | Common types (ApiResult, pagination, validation, extractors) |
| **summer-auth** | JWT auth, session management, permission policies |
| **summer-domain** | Domain services (MenuDomainService, DictDomainService), cross-crate reuse |
| **summer-plugins** | Infrastructure plugins (S3, IP2Region, background tasks, batch logging) |
| **summer-admin-macros** | Declarative macros (`#[login]`, `#[has_perm]`, `#[rate_limit]`, `#[log]`) |

### Tool Crates

| Crate | Purpose |
|---|---|
| **summer-mcp** | MCP Server (schema discovery, table CRUD, code generation, menu/dict tools) |
| **summer-migration** | Database migrations (SeaORM migration) |
| **summer-codegen** | Code generation utilities |

## Key Files

### Entry and Config

| File | Purpose |
|---|---|
| `crates/app/src/main.rs` | Application entry, plugin registration |
| `crates/app/src/router.rs` | Global route assembly |
| `config/app.toml` | Default config |
| `config/app-dev.toml` | Development config |
| `config/app-prod.toml` | Production config |

### System Domain

| File | Purpose |
|---|---|
| `crates/summer-system/src/router/` | System routes (users, roles, menus, etc.) |
| `crates/summer-system/src/service/` | Business logic layer (Services) |
| `crates/summer-system/model/src/entity/` | SeaORM entities |
| `crates/summer-system/model/src/dto/` | Request DTOs |
| `crates/summer-system/model/src/vo/` | Response VOs |

### MCP

| File | Purpose |
|---|---|
| `crates/summer-mcp/src/plugin.rs` | MCP plugin entry |
| `crates/summer-mcp/src/server.rs` | MCP server implementation |
| `crates/summer-mcp/src/tools/` | MCP tools (code generation, etc.) |
| `crates/summer-mcp/templates/` | Code generation templates |

## Crate Organization Principles

1. **app** - Assembly only, no business logic
2. **summer-system** - All system management business code
3. **summer-system/model** - Pure data models, no web/service dependencies
4. **summer-common** - Truly generic types and utilities
5. **summer-plugins** - Reusable infrastructure plugins
6. **summer-domain** - Cross-module domain services

## Configuration Loading

Config files switch via `SUMMER_ENV` environment variable:

| `SUMMER_ENV` | Loaded Files |
|---|---|
| Unset or `dev` | `app.toml` + `app-dev.toml` |
| `prod` | `app.toml` + `app-prod.toml` |
| `test` | `app.toml` + `app-test.toml` |

Environment variable interpolation:

```toml
[sea-orm]
uri = "${DATABASE_URL:postgres://admin:123456@localhost/summerrs-admin}"

[auth]
jwt_secret = "${JWT_SECRET:change-me-in-local-dev}"
```

## Common Commands

```bash
# Format
cargo fmt

# Lint
cargo clippy --workspace --all-targets

# Build
cargo build --release --bin app

# Run
cargo run --bin app
```

## Next Steps

- [Plugin Overview](./plugins) - All plugins and their configurations
- [Authentication](../core/auth) - JWT and permission system
- [Multi-tenancy](../core/multi-tenancy) - Tenant isolation
- [MCP](../core/mcp) - Model Context Protocol integration
