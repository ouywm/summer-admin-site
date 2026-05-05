---
title: Multi-tenancy
description: Four isolation levels, SQL rewriting, tenant context injection.
published_at: 2026-05-04 12:10:00
---

# Multi-tenancy

> Full Chinese version: [`/guide/core/multi-tenancy`](/guide/core/multi-tenancy).

| Crate | Role |
|---|---|
| `crates/summer-sharding` | Lower SQL-rewriting engine (4-level isolation, sharding, encryption, masking, CDC) |
| `crates/summer-sql-rewrite` | Upper auth-context injection (`LoginUser` → SQL where clause) |

## Four isolation levels

| Mode | Use case | Implementation |
|---|---|---|
| `shared_row` | SaaS at scale | SQL rewrite adds `WHERE tenant_id = ?` |
| `separate_table` | Medium isolation | physical tables `user_001`, `user_002` |
| `separate_schema` | Strong isolation, separate backups | Postgres schemas |
| `separate_database` | Compliance / dedicated | one physical DB per tenant |

## Config

```toml
[summer-sharding]
enabled = true

[summer-sharding.tenant]
default_isolation = "shared_row"
enabled = true
tenant_id_source = "request_extension"   # injected by summer-auth

[summer-sharding.tenant.row_level]
column_name = "tenant_id"
strategy = "sql_rewrite"   # sql_rewrite | rls
```

## How rewriting works

Business code stays plain SeaORM:

```rust
SysUser::find().filter(SysUser::Column::Username.eq("alice")).all(db).await?;
```

The plugin pipeline parses the prepared SQL, injects the tenant context, and emits the rewritten SQL transparently. Business code stays agnostic.

## Verification

```sql
-- watch SQL hitting the DB
SELECT query FROM pg_stat_activity WHERE state = 'active' AND query ILIKE '%user%';
-- you'll see ... AND tenant_id = $N appended
```

Or enable SeaORM logging:

```toml
[sea-orm]
enable_logging = true
```

## Capabilities included

- `encrypt/` — column-level encryption before persisting
- `masking/` — output masking by rule (phone, ID, email)
- `shadow/` — mirror traffic to a shadow DB
- `audit/` — pluggable `SqlAuditor` hooks
- `cdc/` — Postgres logical replication (`pgwire-replication`)
- `migration/` — assist in moving tenants between isolation modes
- `ddl/` — DDL fan-out across tenants

## Tables shared across tenants

Add to ignore list:

```toml
[summer-sharding.tenant]
ignore_tables = ["sys.dict_type", "sys.dict_data", "sys.config"]
```

## Source files

- `crates/summer-sharding/src/{config,tenant,rewrite,encrypt,masking,cdc,migration,ddl}/`
- `crates/summer-sql-rewrite/src/`
