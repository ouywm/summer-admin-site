---
description: Summerrs Admin Project Overview
---

# Overview

Summerrs Admin is a multi-crate workspace built on Rust and the Summer ecosystem. It's not a single "admin template" but integrates backend system APIs, MCP Server, AI Relay, multi-tenancy, and SQL rewriting capabilities in one repository for continuous evolution on a unified infrastructure.

The repository currently provides several core capabilities:

- **System Domain APIs**: Authentication, users, roles, menus, dictionaries, configuration, files, notifications, logs, monitoring
- **Embedded MCP Server**: Database schema discovery, table-level CRUD, SQL tools, backend/frontend code generation, menu and dictionary business tools
- **AI Modules**: OpenAI-compatible endpoints, AI management APIs, routing, billing, platform and governance models
- **Multi-tenancy & Infrastructure**: Tenant metadata, SQL rewriting, routing isolation, sharding and extension plugins
