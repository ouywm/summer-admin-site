---
title: MCP Server
description: Schema discovery, table tools, code generation, menu/dictionary tools, and deployment boundaries for the MCP Server.
published_at: 2026-05-04 12:30:00
---

# MCP Server

`summer-mcp` is the engineering entrypoint for AI tools in Summerrs Admin. Built on `rmcp`, it exposes database schemas, generic table tools, code generators, and menu/dictionary business tools to MCP-capable clients.

The main app registers it in `crates/app/src/main.rs`:

```rust
app.add_plugin(McpPlugin)
```

`McpPlugin` depends on `SeaOrmPlugin`. On startup it:

1. Reads `[mcp]` config.
2. Checks `enabled`.
3. Gets `DatabaseConnection`.
4. Verifies the database backend is PostgreSQL.
5. Chooses embedded routing or standalone startup based on `transport` and `http_mode`.

## Config

Development and production environments can enable MCP through `[mcp]`:

```toml
[mcp]
enabled = true
http_mode = "embedded" # "embedded" | "standalone"
transport = "http"     # "stdio" | "http"

server_name = "summerrs-admin-mcp"
server_version = "0.0.1"
title = "Summerrs Admin MCP"
description = "summerrs-admin 后台管理系统 MCP Server，提供库表发现、通用表工具、代码生成和菜单/字典业务工具"

binding = "127.0.0.1"
path = "/mcp"
port = 9090
stateful_mode = true
json_response = false
sse_keep_alive = 15
sse_retry = 3
session_channel_capacity = 16
```

The default Host allowlist in code is:

```text
localhost
127.0.0.1
::1
```

Use `allowed_hosts` and `allowed_origins` to tighten HTTP access sources. Do not expose MCP directly to the public internet in production.

## Run Modes

| Mode | Behavior |
|---|---|
| `transport = "http", http_mode = "embedded"` | Mounted into the main app router at `path` through `app.add_router_layer` |
| `transport = "http", http_mode = "standalone"` | Listens independently on `binding:port` and mounts `path` |
| `transport = "stdio"` | Serves MCP over stdin/stdout |

In the default embedded HTTP mode, `path = "/mcp"`. If the web layer also has a global prefix, the final path includes that prefix; otherwise it is `/mcp` on the main app. System business APIs are mounted under `/api`, while MCP serves MCP clients.

Standalone binary example:

```bash
cargo run -p summer-mcp --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin' \
  --transport http \
  --http-mode standalone
```

stdio mode is useful for local AI tools connecting through a subprocess:

```bash
cargo run -p summer-mcp --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin' \
  --transport stdio
```

## Capability Overview

Call `server_capabilities` when a client first connects. It returns:

| Section | Content |
|---|---|
| `health` | Database backend, connection status, public table count |
| `server` | Name, version, title, description |
| `runtime` | transport, http_mode, path, port, Host/Origin restrictions, session config |
| `capabilities.tools` | Published tool list |
| `capabilities.resources` | Resource list |
| `capabilities.resource_templates` | Resource templates |
| `capabilities.generators` | Backend/frontend generators and target presets |

This is a runtime snapshot for AI clients and is more reliable than making the client guess which tools are available.

## Resources

`AdminMcpServer` publishes one resource and one resource template:

| Type | URI | Description |
|---|---|---|
| Resource | `schema://tables` | Runtime-discovered table list |
| Resource Template | `schema://table/{table}` | Single-table schema metadata |

Recommended workflow:

```text
1. Read schema://tables
2. Read schema://table/sys_user
3. Confirm primary keys, fields, enums, and writable columns
4. Then call table_query / generate_* / menu_tool
```

Do not let AI guess field names without reading schema first.

## Generic Table Tools

`summer-mcp/src/table_tools/router.rs` provides generic CRUD:

| Tool | Purpose |
|---|---|
| `schema_list_tables` | List tables in a PostgreSQL schema |
| `schema_describe_table` | Describe table structure |
| `table_get` | Read one row by primary key |
| `table_query` | Query with filters, sorting, and pagination |
| `table_insert` | Insert one row and return the new row |
| `table_update` | Update by primary key and return the latest row |
| `table_delete` | Delete by primary key |

These tools target PostgreSQL by default. Many parameters support explicit `schema`; when a schema is provided, tools either set `search_path` inside the transaction or generate schema-qualified SQL.

## SQL Tools

MCP also provides two SQL escape hatches:

| Tool | Use |
|---|---|
| `sql_query_readonly` | Complex read-only queries |
| `sql_exec` | Explicit DDL/DML |

`sql_query_readonly` normalizes user SQL into a read-only subquery and adds a limit. `sql_exec` is for explicit writes or DDL and should not be used for ordinary reads.

Both are riskier than table tools. Recommended priority:

```text
schema resource -> table_* tools -> sql_query_readonly -> sql_exec
```

## Code Generation Tools

Backend generators:

| Tool | Purpose |
|---|---|
| `generate_entity_from_table` | Generate or update a SeaORM Entity from a real table |
| `upgrade_entity_enums_from_table` | Preview or upgrade field enum semantics |
| `generate_admin_module_from_table` | Generate a backend CRUD module draft |

Frontend generators:

| Tool | Purpose |
|---|---|
| `generate_frontend_api_from_table` | Generate a frontend API call file |
| `generate_frontend_page_from_table` | Generate list/form page drafts |
| `generate_frontend_bundle_from_table` | Generate API, types, and page bundle in one run |

`generator_capability_catalog` declares two target presets:

| Preset | Description |
|---|---|
| `summer_mcp` | MCP self-test or temporary output scenarios |
| `art_design_pro` | Art Design Pro project structure |

Generation tools support temporary output directories. Prefer outputting to `/tmp/...` first, review the generated files, then move them into the target project.

## Menu And Dictionary Tools

Manage menus and dictionaries through MCP business tools instead of asking AI to write SQL against tree structures and enum data:

| Tool | Purpose |
|---|---|
| `menu_tool` | Plan, export, apply, and query menus/button permissions |
| `dict_tool` | Plan, export, apply, and query dictionary types and values |

Recommended flow:

```text
1. generate_* returns menu_config_draft / dict_bundle_drafts
2. Run menu_tool or dict_tool plan
3. Export to a temporary directory when human review is needed
4. Apply after confirmation
5. Verify with list_tree / get_by_type
```

This is less likely to break tree structure, sort order, permission identifiers, and dictionary constraints than hand-written SQL.

## Prompt Templates

The MCP Server publishes three prompts:

| Prompt | Use |
|---|---|
| `discover_table_workflow` | Guide AI to read schema before choosing table tools or SQL tools |
| `generate_crud_bundle_workflow` | Guide table-to-Entity, backend CRUD, and frontend bundle generation |
| `rollout_menu_dict_workflow` | Guide menu/dictionary plan/export before apply |

If the client supports MCP prompts, prefer them. They reduce the chance that AI skips resource reads and guesses structure.

## Security Boundary

MCP is a development and operations tool, not a tenant-user API.

Deployment notes:

- Only PostgreSQL is supported; non-PostgreSQL backends fail at startup.
- Embedded HTTP runs in the same process as the main app, but it does not automatically inherit `summer-system` JWT/RBAC.
- Standalone mode binds to `127.0.0.1:9090` by default; do not casually change it to `0.0.0.0`.
- `sql_exec` can execute DDL/DML and should only be available in trusted environments.
- Production should configure Host/Origin allowlists and restrict access with the network layer or reverse proxy.
- In multi-tenant scenarios, MCP sees the real database structure and should not be exposed as a normal tenant tool.

## Relationship To The System Backend

MCP shares the database connection with the system backend and also reuses menu and dictionary domain services from `summer-domain`. But MCP itself is not a normal business endpoint under `summer-system/src/router`.

```mermaid
flowchart LR
    A[MCP Client] --> B[summer-mcp]
    B --> C[PostgreSQL schema]
    B --> D[table tools]
    B --> E[code generators]
    B --> F[menu_tool / dict_tool]
    G[Admin UI] --> H[/api system router]
    H --> I[JWT / RBAC / resource permission]
```

The system backend provides human-facing admin UI and APIs. MCP gives AI tools a structured and controlled engineering entrypoint.
