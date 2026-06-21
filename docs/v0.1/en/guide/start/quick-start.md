---
title: Quick Start
description: Start Summerrs Admin quickly with Docker or local development.
published_at: 2026-06-16 10:00:00
---

# Quick Start

## Prerequisites

| Tool | Recommended version | Purpose |
|---|---|---|
| Rust | **1.93+** (Edition 2024) | Compile the backend |
| PostgreSQL | **17+** | Primary storage |
| Redis | **7+** | Sessions / cache / rate-limit backend |
| S3-compatible storage | MinIO / RustFS / AWS S3 | File uploads |
| Docker + Compose | Optional | Start the full environment in one command |

> `Cargo.toml` uses `edition = "2024"`, so the Rust toolchain must be 1.93 or newer.

## Option 1: Docker One-Command Startup (Recommended)

### 1. Clone

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin
```

### 2. Configure Environment

The root `docker-compose.yml` contains five services:

| Service | Image | Default port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5432 | Primary storage |
| `redis` | `redis:7-alpine` | 6379 | Sessions / cache / rate-limit backend |
| `rustfs` | `rustfs/rustfs:latest` | 9000 / 9001 | S3-compatible object storage |
| `ratchjob` | `qingpan/ratchjob:stable` | 8725 / 8825 / 8925 | Job scheduler (XXL-Job compatible) |
| `app` | Multi-stage build | 8080 | Summerrs Admin main app |

Create or update `.env`:

```bash
# Postgres
POSTGRES_PASSWORD=replace-with-a-strong-password

# JWT
JWT_SECRET=replace-with-a-64-plus-character-random-string

# S3 / RustFS
S3_ACCESS_KEY=summerAK
S3_SECRET_KEY=summerSK
S3_ENDPOINT=http://rustfs:9000     # use the service name inside Docker
S3_BUCKET=summer-admin
S3_REGION=us-east-1

# XXL-Job / RatchJob (optional)
XXL_JOB_ACCESS_TOKEN=default_token

# Log level
RUST_LOG=info
```

> The `app` container talks to `postgres`, `redis`, `rustfs`, and `ratchjob` by service name, so `S3_ENDPOINT` should be `http://rustfs:9000` instead of `localhost`.

### 3. Start Services

```bash
# Pull images, build app, and start
docker compose up -d --build

# Watch app logs
docker compose logs -f app

# Check health
docker compose ps
# postgres/redis should be healthy, app should be running
```

The app listens on `8080`; the RustFS console listens on `9001` with default credentials `summerAK / summerSK`.

> The database initializes automatically on first app startup. No manual SQL execution is needed.

### 4. Verify

```bash
# OpenAPI document
curl http://localhost:8080/docs/openapi.json

# Login test (default account Admin / 123456)
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"userName":"Admin","password":"123456"}'
```

### Custom Ports

If local services already use the default ports, set these variables in `.env`; `docker-compose.yml` will read them automatically:

```bash
POSTGRES_PORT=15432
REDIS_PORT=16379
S3_PORT=19000
APP_PORT=18080
```

These port variables only affect Docker deployment. The app's own config lives in `config/app.toml`.

## Option 2: Local Development

### 1. Clone

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin
```

### 2. Prepare External Dependencies

Make sure these are available locally:

- PostgreSQL 17+
- Redis 7+
- S3-compatible storage (MinIO / RustFS / AWS S3)

> The database initializes automatically through SeaORM on first startup. No manual SQL execution is needed.

### 3. Configure Environment

Create `.env`:

```bash
# Database connection
DATABASE_URL=postgres://admin:123456@localhost/summerrs-admin

# Redis connection
REDIS_URL=redis://127.0.0.1/

# JWT signing key
JWT_SECRET="use openssl rand -base64 32 for production"

# Log level
RUST_LOG=debug

# S3 / MinIO / RustFS
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=summer-admin
S3_REGION=us-east-1
S3_ACCESS_KEY=fill-me
S3_SECRET_KEY=fill-me

# XXL-Job (optional; skip if not using job scheduling)
XXL_JOB_ADMIN_ADDRESSES=http://127.0.0.1:8725/xxl-job-admin
XXL_JOB_ACCESS_TOKEN=default_token
```

> `.env` is already in `.gitignore`. Do not commit production secrets.

### 4. Run

```bash
# Run directly; cargo will compile automatically
cargo run --bin app
```

The project initializes the database on first startup. After it starts, open `http://localhost:8080/docs/openapi.json`.
