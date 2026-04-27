---
description: From dependency preparation and database initialization to cargo run, complete the first local startup of Summerrs Admin.
published_at: 2026-04-26 09:15:00
---

# Quick Start

This page solves one thing first: boot the `summerrs-admin` main application locally and prepare the minimum environment needed for later verification.

## 1. Prepare dependencies

It is recommended to prepare the following first:

- Rust stable toolchain
- A local PostgreSQL instance
- A local Redis instance
- An S3-compatible object storage service
  For local development, MinIO or RustFS is fine as long as it responds at `http://localhost:9000`
- The `psql` CLI tool

Why object storage also needs to be ready:

- `crates/app` loads `S3Plugin` unconditionally at startup
- The `[s3]` section in `config/app-dev.toml` does not provide defaults for `access_key` or `secret_key`
- So even if you do not test file upload yet, the main app still expects valid S3 configuration during startup

## 2. Check the development baseline config

The first file worth opening in the repository is:

- `config/app-dev.toml`

Several key development defaults are already there:

- Web port: `8080`
- API global prefix: `/api`
- OpenAPI docs: `/api/docs`
- Embedded MCP path: `/api/mcp`
- PostgreSQL default DSN: `postgres://admin:123456@localhost/summerrs-admin`
- Redis default DSN: `redis://127.0.0.1/`
- Object storage endpoint: `http://localhost:9000`
- Object storage bucket: `summer-admin`

## 3. Initialize the database

If your goal is simply to boot the backend and verify login, OpenAPI, and the system-domain APIs, the minimum path is:

1. Create a database named `summerrs-admin`
2. Import `sql/sys/*.sql` first
3. Add `sql/tenant/` and `sql/ai/` later when you want to explore tenant or AI capabilities

A straightforward initialization example:

```bash
createdb -U admin summerrs-admin

find sql/sys -maxdepth 1 -type f -name '*.sql' ! -name 'menu_data_all.sql' | sort | \
  xargs -I{} psql -U admin -d summerrs-admin -f "{}"
```

If you also want to import the menu seed data:

```bash
psql -U admin -d summerrs-admin -f sql/sys/menu_data_all.sql
```

If you want tenant and AI-related tables as well, continue with:

```bash
find sql/tenant -maxdepth 1 -type f -name '*.sql' | sort | \
  xargs -I{} psql -U admin -d summerrs-admin -f "{}"

find sql/ai -type f -name '*.sql' | sort | \
  xargs -I{} psql -U admin -d summerrs-admin -f "{}"
```

:::warning
`sql/README.md` mentions a fuller SQL layering story, but the actual top-level directories currently present in the repository are mainly `sys`, `tenant`, `ai`, and `migration`. This first edition follows the repository as it exists today.
:::

## 4. Prepare required environment variables

At minimum, set the following:

```bash
export DATABASE_URL='postgres://admin:123456@localhost/summerrs-admin'
export JWT_SECRET='change-me-in-local-dev'
export S3_ACCESS_KEY='minioadmin'
export S3_SECRET_KEY='minioadmin'
```

If your object storage is not `http://localhost:9000`, or the bucket is not `summer-admin`, update the `[s3]` section in `config/app-dev.toml` accordingly.

AI provider settings such as `RIG_OPENAI_API_KEY` can wait until you actually verify AI-related endpoints.

## 5. Start the main application

Run this from the `summerrs-admin` repository root:

```bash
cargo run -p app
```

If startup succeeds, the application should expose at least:

- `http://localhost:8080/api/docs`
- `http://localhost:8080/api/mcp`

## 6. Default test accounts

`sql/sys/user.sql` already inserts three initial accounts, all using the password `123456`:

- `Super`
- `Admin`
- `User`

For the first authentication verification, the recommended account is:

- Username: `Admin`
- Password: `123456`

Next, continue to [Verify After Startup](/guide/start/verify-after-start).
