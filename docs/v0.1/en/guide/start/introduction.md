---
description: Understand the repository positioning, implemented capabilities, and recommended reading flow for Summerrs Admin.
published_at: 2026-04-26 09:00:00
---

# Introduction

`Summerrs Admin` is a multi-crate Rust workspace built on the Summer ecosystem. It is not only an "admin template", but a single repository that brings together system admin APIs, an MCP Server, AI Relay modules, multi-tenant support, and SQL rewrite infrastructure.

Several core capability groups are already visible in the repository:

- System admin APIs: auth, users, roles, menus, dictionaries, configuration, files, notifications, logs, and monitoring
- Embedded MCP Server: schema discovery, table CRUD, SQL tools, backend/frontend code generation, and menu/dictionary business tools
- AI modules: OpenAI-compatible endpoints, AI admin APIs, routing, billing, platform, and governance models
- Multi-tenant and low-level infrastructure: tenant metadata, SQL rewrite, route isolation, sharding, and extension plugins

## Who this first edition is for

This first edition primarily serves the first of these two needs:

- People who want to run the `summerrs-admin` workspace locally and continue developing inside it
- People who want to understand the entry points, configuration files, and SQL layout before choosing a module to explore

## What the current docs focus on

This edition focuses on onboarding rather than trying to document every module at once:

- Explain the minimum dependencies required for local startup
- Get the main application running with `cargo run -p app`
- Verify OpenAPI, authentication, and the embedded MCP route first
- Use one page to map the workspace so you can explore deeper afterward

:::tip
The current repository is mainly a backend workspace. Although `sql/sys/menu_data_all.sql` contains menu and frontend route conventions, the full frontend project is not in this repository, so the first edition focuses on APIs, OpenAPI, and MCP.
:::

## Key entry points you will hit first

- `crates/app`: the main application entry, assembling system, MCP, AI, auth, Redis, S3, and other plugins
- `config/app-dev.toml`: the development baseline, where ports, database, Redis, S3, and MCP paths are defined
- `sql/`: the source of truth for database structure, organized by domains such as `sys`, `tenant`, and `ai`
- `docs/`: internal design notes and research docs that help you understand specific submodules

## Recommended reading order

1. Start with [Quick Start](/guide/start/getting-started) to boot the service
2. Continue with [Verify After Startup](/guide/start/verify-after-start) to confirm OpenAPI, login, and MCP are all working
3. Finish with [Module Overview](/guide/start/module-overview) to build a mental model of the whole workspace
