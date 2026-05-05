---
title: Default Account & Initial Data
description: Built-in admin, roles, menus, dictionaries, system config.
published_at: 2026-05-04 10:40:00
---

# Default Account & Initial Data

> Detailed Chinese version: [`/guide/start/default-account`](/guide/start/default-account).

## Default admin

| Field | Default |
|---|---|
| **Username** | `Admin` |
| **Password** | `123456` |
| **Role** | `admin` (wildcard `*` permission) |

> ⚠️ **Change the password before going to production.**

Passwords are stored as Argon2 PHC strings.

## Built-in roles

| Code | Permissions |
|---|---|
| `admin` | `*` (everything) |

Custom roles are added in the `sys.role` / `sys.role_menu` tables. Granularity is driven by `#[has_perm("xxx:yyy:zzz")]` on each route.

## Menus

`sql/sys/menu_data_all.sql` seeds a complete menu tree under `sys.menu`:

- System (`system:*`) — users, roles, menus, dicts, configs, notices, files
- Monitor (`monitor:*`) — online users, login log, op log, jobs
- AI (`ai:*`) — channels, model configs, routing, quotas, billing log

## Dictionaries

`sql/sys/dict.sql` seeds common types: `sys_user_sex`, `sys_normal_disable`, `sys_yes_no`, `sys_login_type`, `sys_oper_type`, etc. Read via `DictDomainService` or expose to AI through MCP `dict_tool`.

## System config

`sql/sys/config.sql` seeds key-value entries like `sys.account.captcha.enabled`, `sys.upload.max_size`, `sys.notice.banner`. Modifiable via `/api/sys-config/*`.

## Reset

```bash
psql -U admin -d summerrs-admin -c "DROP SCHEMA sys CASCADE;"
psql -U admin -d summerrs-admin -c "DROP SCHEMA ai CASCADE;"
psql -U admin -d summerrs-admin -c "DROP SCHEMA tenant CASCADE;"
# then re-run sql/{sys,ai,tenant}/*.sql
```

Docker quick path: `docker compose down -v && docker compose up -d`.
