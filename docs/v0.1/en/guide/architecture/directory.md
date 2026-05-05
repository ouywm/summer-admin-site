---
title: Directory Layout
description: Workspace crates, key files, where new business code should go.
published_at: 2026-05-04 11:20:00
---

# Directory Layout

> Full Chinese reference with anchor files: [`/guide/architecture/directory`](/guide/architecture/directory).

```text
summerrs-admin/
├── crates/
│   ├── app/                          # binary entry, assembly only
│   ├── summer-admin-macros/          # #[login] / #[has_perm] / #[rate_limit] / #[log] / #[job_handler]
│   ├── summer-auth/                  # JWT, session, path policy
│   ├── summer-common/                # ApiResult / Json<T> / pagination / extractors
│   ├── summer-domain/                # cross-crate domain services
│   ├── summer-system/                # System APIs (users, roles, menus, files, ...)
│   │   ├── src/{router,service,plugins,socketio,job}/
│   │   └── model/                    # entity / dto / vo / views
│   ├── summer-ai/
│   │   ├── core/                     # protocol core
│   │   ├── model/                    # entity + DTO/VO
│   │   ├── relay/                    # relay engine + OpenAI/Claude/Gemini routes
│   │   ├── admin/                    # AI admin APIs
│   │   ├── billing/                  # 3-stage billing
│   │   └── agent/                    # rig-core agent
│   ├── summer-sharding/              # SQL rewriting / multi-tenancy / sharding / encryption
│   ├── summer-sql-rewrite/           # auth context → SQL injection
│   ├── summer-mcp/                   # embedded / standalone MCP server
│   │   └── src/{plugin,server,runtime,prompts,table_tools/,tools/}
│   ├── summer-plugins/               # S3 / IP2Region / background task / batch log
│   └── summer-job-dynamic/           # DB-driven cron scheduler
├── config/                           # app.toml + app-{dev,prod,test}.toml
├── sql/                              # source-of-truth DB schema
│   ├── sys/  ai/  tenant/  biz/
├── doc/                              # deployment / migration guides (zh-leaning)
├── docs/                             # research / reference materials
├── locales/                          # rust-i18n resources
├── build-tools/                      # fmt / clippy / pre-commit scripts
├── docker-compose.yml
└── Dockerfile
```

## Where new business code goes

Adding a "Tag" module:

1. SQL → `sql/sys/tag.sql`
2. Entity → `crates/summer-system/model/src/entity/sys_tag.rs` (use MCP `generate_entity_from_table`)
3. DTO / VO → `model/src/dto/sys_tag.rs` + `vo/sys_tag.rs`
4. Service → `crates/summer-system/src/service/sys_tag_service.rs`
5. Router → `crates/summer-system/src/router/sys_tag.rs` with `#[has_perm("system:tag:list")]`
6. Wire it up → add `let router = sys_tag::routes(router);` to `router/mod.rs`
7. Menus + perms → use MCP `menu_tool::plan_apply`

## Anchor files

| Purpose | Path |
|---|---|
| Binary entry | `crates/app/src/main.rs` |
| Router assembly | `crates/app/src/router.rs` |
| Default config | `config/app.toml` |
| System router examples | `crates/summer-system/src/router/{auth,sys_user}.rs` |
| MCP server | `crates/summer-mcp/src/{plugin,server,runtime}.rs` |
| AI relay routers | `crates/summer-ai/relay/src/router/{openai,claude,gemini}/` |
| AI admin routers | `crates/summer-ai/admin/src/router/` (15+ files) |
| Macro implementations | `crates/summer-admin-macros/src/{auth_macro,log_macro,rate_limit_macro}.rs` |
