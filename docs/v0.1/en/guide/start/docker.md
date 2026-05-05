---
title: Docker
description: Bring up Postgres / Redis / RustFS / app with one command.
published_at: 2026-05-04 10:20:00
---

# Docker

> Detailed walkthrough (Chinese) at [`/guide/start/docker`](/guide/start/docker). The English version below covers the essentials.

The repo's `docker-compose.yml` provisions four services:

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5432 | Primary store |
| `redis` | `redis:7-alpine` | 6379 | Session / cache / rate limit |
| `rustfs` | `rustfs/rustfs:latest` | 9000 / 9001 | S3-compatible storage |
| `app` | multi-stage build → `summerrs-admin:latest` | 8080 | Main app |

## 1. `.env`

```bash
POSTGRES_PASSWORD=replace
JWT_SECRET=replace-64-chars
S3_ACCESS_KEY=summerAK
S3_SECRET_KEY=summerSK
S3_ENDPOINT=http://rustfs:9000
S3_BUCKET=summer-admin
RUST_LOG=info
```

## 2. Start

```bash
docker compose up -d --build
docker compose logs -f app
docker compose ps
```

## 3. Initialize DB

```bash
psql -h localhost -U admin -d summerrs-admin -f sql/sys/user.sql
# repeat for the rest of sql/sys/*.sql, sql/ai/*.sql, sql/tenant/*.sql
```

## 4. Verify

```bash
curl http://localhost:8080/docs                                     # OpenAPI
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"123456"}'
```

## Maintenance

```bash
docker compose down              # stop
docker compose down -v           # ⚠️ wipe volumes
docker compose restart app       # restart only the app
docker compose build app         # rebuild app image
```
