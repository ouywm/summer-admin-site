---
title: Overview
description: What Summerrs Admin is, what it bundles, and why it lives in one binary.
published_at: 2026-05-04 10:00:00
---

# What is Summerrs Admin

Summerrs Admin is a production-grade admin platform written **entirely in Rust**, built on top of the [Summer framework](https://github.com/ouywm/spring-rs) (a Spring-style application skeleton for Rust). It packages auth, multi-tenancy, AI gateway, messaging, object storage, and declarative auditing into **one binary** as composable plugins.

It is not a demo, nor a single component showcase — it is a **complete, self-contained, deployable** admin foundation.

## Capabilities you get out of the box

- **System APIs** — Auth, users, roles, menus, dictionaries, configuration, files, notifications, logs, monitoring
- **Embedded MCP Server** — Schema discovery, table CRUD, SQL escape hatches, backend & frontend code generators, menu / dict business tools
- **AI Gateway** — Native OpenAI / Claude / Gemini endpoints, AI admin console, 6-dim routing, 3-stage billing
- **Multi-tenancy & infra** — Tenant metadata, SQL rewriting, routing isolation, four isolation levels, CDC, encryption / masking / audit
- **Runtime plugins** — Socket.IO gateway, IP2Region geolocation, S3-compatible storage, background task queue, batch log writer, dynamic cron scheduler

## Stack at a glance

| Layer | Choice |
|---|---|
| Language | **Rust 1.93+ / Edition 2024** |
| Framework | [Summer 0.5](https://github.com/ouywm/spring-rs) |
| HTTP | Axum + Tower + tower-http |
| ORM | SeaORM 2.0 (custom fork with tenant SQL rewriting) |
| Primary store | PostgreSQL 17+ |
| Cache / session | Redis 7+ |
| Object storage | AWS S3 / MinIO / RustFS (S3-compatible) |
| MCP | [rmcp](https://github.com/modelcontextprotocol/rust-sdk) |
| AI Agent | [rig-core](https://github.com/0xPlaygrounds/rig) |

## Reading path

- Run it first → [Installation](./installation) → [Docker](./docker) → [First run](./first-run) → [Default account](./default-account)
- Architecture → [Overview](../architecture/overview) → [17 plugins](../architecture/plugins) → [Directory layout](../architecture/directory)
- Core mechanics → [Auth](../core/auth) / [Multi-tenancy](../core/multi-tenancy) / [AI Gateway](../core/ai-gateway) / [MCP](../core/mcp) / [Rate-limit](../core/rate-limit)
- API entry points → [API overview](/en/api/)

## Repository links

- Backend workspace: <https://github.com/ouywm/summerrs-admin>
- Framework (Summer / spring-rs): <https://github.com/ouywm/spring-rs>
- This documentation site: <https://github.com/ouywm/summer-admin-site>
