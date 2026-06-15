---
title: Installation
description: Toolchain, external dependencies, and environment variables.
published_at: 2026-05-04 10:10:00
---

# Installation

## Toolchain

| Tool | Recommended | Purpose |
|---|---|---|
| Rust | **1.93+** (Edition 2024) | Compile backend |
| PostgreSQL | **17+** | Primary store |
| Redis | **7+** | Session / cache / rate limit |
| S3-compatible | MinIO / RustFS / AWS S3 | File uploads |
| Docker + Compose | optional | One-shot environment |

## Quick path

```bash
# 1. Clone
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin

# 2. Bring up dependencies (Docker)
docker compose up -d postgres redis rustfs

# 3. Run (database auto-initializes via SeaORM migrations)
cargo run --bin app
```

> 💡 **Tip**: Database schema is automatically initialized on first startup via SeaORM migrations. No manual SQL execution needed.

## Required env vars (`.env`)

```bash
# Database connection
DATABASE_URL=postgres://admin:123456@localhost/summerrs-admin

# JWT signing key (use openssl rand -base64 32 in production)
JWT_SECRET="replace-with-a-strong-random-string"

# Log level
RUST_LOG=debug

# S3 / MinIO / RustFS
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

> ⚠️ `.env` is gitignored. Do not commit production secrets.

See [Docker](./docker) for the compose-managed path.
