---
title: Installation
description: Toolchain, external dependencies, and environment variables.
published_at: 2026-05-04 10:10:00
---

# Installation

> The full Chinese version (with detailed troubleshooting) is at [`/guide/start/installation`](/guide/start/installation). The English page is being expanded — contributions welcome.

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

# 2. Bring up dependencies
docker compose up -d postgres redis rustfs

# 3. Initialize database (run sql/sys/*.sql with psql)
for f in sql/sys/*.sql; do
  psql -U admin -d summerrs-admin -f "$f"
done

# 4. Build & run
cargo build --release
cargo run -p app --release
```

## Required env vars (`.env`)

```bash
DATABASE_URL=postgres://admin:123456@localhost/summerrs-admin?options=-c%20TimeZone%3DAsia%2FShanghai
SUMMER_MCP_DATABASE_URL=${DATABASE_URL}
POSTGRES_PASSWORD=replace-with-strong
JWT_SECRET="replace-with-a-64+char-random-string"
RUST_LOG=debug
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
```

> ⚠️ `.env` is gitignored. Do not commit production secrets.

See [Docker](./docker) for the compose-managed path, [First run](./first-run) for end-to-end verification.
