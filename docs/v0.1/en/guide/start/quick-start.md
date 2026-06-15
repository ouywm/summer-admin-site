---
title: Quick Start
description: Get Summerrs Admin up and running quickly with Docker or local development.
published_at: 2026-06-16 10:00:00
---

# Quick Start

## Prerequisites

| Tool | Recommended | Purpose |
|---|---|---|
| Rust | **1.93+** (Edition 2024) | Compile backend |
| PostgreSQL | **17+** | Primary store |
| Redis | **7+** | Session / cache / rate limit |
| S3-compatible | MinIO / RustFS / AWS S3 | File uploads |
| Docker + Compose | optional | One-shot environment |

## Option 1: Docker (Recommended)

### 1. Clone

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin
```

### 2. Configure Environment

The `docker-compose.yml` provisions five services:

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5432 | Primary store |
| `redis` | `redis:7-alpine` | 6379 | Session / cache / rate limit |
| `rustfs` | `rustfs/rustfs:latest` | 9000 / 9001 | S3-compatible storage |
| `ratchjob` | `qingpan/ratchjob:stable` | 8725 / 8825 / 8925 | Job scheduler (XXL-Job compatible) |
| `app` | multi-stage build | 8080 | Main app |

Create or update `.env`:

```bash
POSTGRES_PASSWORD=replace
JWT_SECRET=replace-64-chars
S3_ACCESS_KEY=summerAK
S3_SECRET_KEY=summerSK
S3_ENDPOINT=http://rustfs:9000
S3_BUCKET=summer-admin
S3_REGION=us-east-1
XXL_JOB_ACCESS_TOKEN=default_token
RUST_LOG=info
```

### 3. Start

```bash
docker compose up -d --build
docker compose logs -f app
docker compose ps
```

> 💡 **Tip**: Database schema is automatically initialized on first startup. No manual SQL execution needed.

### 4. Verify

```bash
curl http://localhost:8080/docs                                     # OpenAPI
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"123456"}'
```

### Maintenance

```bash
docker compose down              # stop
docker compose down -v           # ⚠️ wipe volumes
docker compose restart app       # restart only the app
docker compose build app         # rebuild app image
```

## Option 2: Local Development

### 1. Clone

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin
```

### 2. Prerequisites

Ensure you have:
- PostgreSQL 17+
- Redis 7+
- S3-compatible storage (MinIO / RustFS / AWS S3)

> 💡 **Tip**: Database initializes automatically on first startup.

### 3. Configure Environment

Create `.env`:

```bash
# Database connection
DATABASE_URL=postgres://admin:123456@localhost/summerrs-admin

# Redis connection
REDIS_URL=redis://127.0.0.1/

# JWT signing key (use openssl rand -base64 32 in production)
JWT_SECRET="replace-with-a-strong-random-string"

# Log level
RUST_LOG=debug

# S3 / MinIO / RustFS
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=summer-admin
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...

# XXL-Job (optional, skip if not using job scheduler)
XXL_JOB_ADMIN_ADDRESSES=http://127.0.0.1:8725/xxl-job-admin
XXL_JOB_ACCESS_TOKEN=default_token
```

> ⚠️ `.env` is gitignored. Do not commit production secrets.

### 4. Run

```bash
cargo run --bin app
```

The app auto-initializes the database on first startup. Access at `http://localhost:8080`.

## Troubleshooting

**Missing `summer` / `summer-web` during compilation?**

The `Cargo.toml` patches these from GitHub forks. First compile will auto-clone. If network-constrained, configure Cargo's `[source.crates-io]` mirror or GitHub proxy.
