---
title: MCP Server
description: Embedded vs standalone, schema discovery, table CRUD, code generators, business tools.
published_at: 2026-05-04 12:30:00
---

# MCP Server

> Full Chinese version: [`/guide/core/mcp`](/guide/core/mcp).

`summer-mcp` is an embedded [MCP](https://modelcontextprotocol.io) server based on [rmcp](https://github.com/modelcontextprotocol/rust-sdk). It exposes the project's database schema, CRUD tools, code generators, and menu/dict business tools to AI assistants.

## Two run modes

| Mode | Path | Use case |
|---|---|---|
| **embedded** | `http://localhost:8080/api/mcp` | Co-deployed with main app |
| **standalone** | `http://127.0.0.1:9090/mcp` | Dedicated AI tooling |

## Config

```toml
[mcp]
enabled = true
transport = "http"          # http | stdio
http_mode = "embedded"      # embedded | standalone
path = "/mcp"
binding = "127.0.0.1"
port = 9090
server_name = "summerrs-admin-mcp"
server_version = "0.0.1"
title = "Summerrs Admin MCP"
stateful_mode = true
sse_keep_alive = 15
sse_retry = 3
session_channel_capacity = 16
```

## Standalone

```bash
cargo run -p summer-mcp --features standalone --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin'
```

## Capabilities

### Resources

| URI | Content |
|---|---|
| `schema://tables` | All tables (runtime-discovered) |
| `schema://table/{table}` | Columns / types / comments / indexes / FKs |

### Tools — generic table

| Tool | Use |
|---|---|
| `table_get` / `table_query` / `table_insert` / `table_update` / `table_delete` | Generic CRUD over any table |

### Tools — SQL escape hatches

| Tool | Use |
|---|---|
| `sql_query_readonly` | Complex read-only SQL |
| `sql_exec` | Explicit DDL/DML (use with care) |

### Tools — code generators

| Tool | Output |
|---|---|
| `generate_entity_from_table` | SeaORM entity (auto-detects enums) |
| `upgrade_entity_enums_from_table` | Preview enum upgrade plan |
| `generate_admin_module_from_table` | Backend CRUD module (router + service + dto + vo) |
| `generate_frontend_bundle_from_table` | Frontend api / types / page bundle (Art Design Pro preset) |

### Tools — business

| Tool | Use |
|---|---|
| `menu_tool` | Plan / export / apply menu changes safely |
| `dict_tool` | Plan / export / apply dictionary changes |

### Prompts

- `discover_table_workflow`
- `generate_crud_bundle_workflow`
- `rollout_menu_dict_workflow`

## Claude Desktop

```json
{
  "mcpServers": {
    "summerrs-admin": {
      "type": "http",
      "url": "http://localhost:8080/api/mcp"
    }
  }
}
```

## Cursor

```json
{
  "mcpServers": {
    "summerrs-admin": {
      "url": "http://localhost:8080/api/mcp"
    }
  }
}
```

## Security

- **`sql_exec` is powerful** — keep it on trusted networks only
- **Standalone binding** is `127.0.0.1` by default — do not expose to `0.0.0.0`
- **MCP can be disabled in production** via `[mcp].enabled = false`

## Source files

- `crates/summer-mcp/src/{plugin,server,runtime,prompts}.rs`
- `crates/summer-mcp/src/config.rs`
- `crates/summer-mcp/src/table_tools/`
- `crates/summer-mcp/src/tools/`
