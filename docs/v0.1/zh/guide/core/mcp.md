---
title: MCP 服务器
description: 介绍 MCP Server 的 schema 发现、表工具、代码生成、菜单/字典工具和部署边界。
published_at: 2026-05-04 12:30:00
---

# MCP 服务器

`summer-mcp` 是 Summerrs Admin 面向 AI 工具的工程入口。它基于 `rmcp` 实现 MCP Server,可以把数据库 schema、通用表工具、代码生成器、菜单/字典业务工具暴露给支持 MCP 的客户端。

主应用在 `crates/app/src/main.rs` 中注册:

```rust
app.add_plugin(McpPlugin)
```

`McpPlugin` 依赖 `SeaOrmPlugin`,启动时会:

1. 读取 `[mcp]` 配置。
2. 检查 `enabled`。
3. 取得 `DatabaseConnection`。
4. 校验数据库后端必须是 PostgreSQL。
5. 根据 `transport` 和 `http_mode` 选择嵌入主路由或独立启动。

## 配置

开发和生产环境可以通过 `[mcp]` 配置启用 MCP:

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

默认 Host 白名单在代码中是:

```text
localhost
127.0.0.1
::1
```

可以通过 `allowed_hosts`、`allowed_origins` 收紧 HTTP 访问来源。生产环境不要把 MCP 直接暴露到公网。

## 运行模式

| 模式 | 行为 |
|---|---|
| `transport = "http", http_mode = "embedded"` | 通过 `app.add_router_layer` 挂到主应用 router 的 `path` |
| `transport = "http", http_mode = "standalone"` | 独立监听 `binding:port` 并挂载 `path` |
| `transport = "stdio"` | 通过 stdin/stdout 提供 MCP 服务 |

默认以 embedded HTTP 运行时,`path = "/mcp"`。如果 Web 层另外配置了全局前缀,最终路径会叠加该前缀;否则就是主应用上的 `/mcp`。系统业务 API 由 app router 挂在 `/api` 下,这两个路径分别服务 MCP 客户端和后台业务接口。

standalone 二进制入口是:

```bash
cargo run -p summer-mcp --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin' \
  --transport http \
  --http-mode standalone
```

stdio 模式适合本地 AI 工具通过子进程连接:

```bash
cargo run -p summer-mcp --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin' \
  --transport stdio
```

## 能力总览

第一次连接时建议调用 `server_capabilities`。它会返回:

| 区块 | 内容 |
|---|---|
| `health` | 数据库后端、连接状态、公开表数量 |
| `server` | 名称、版本、标题、描述 |
| `runtime` | transport、http_mode、path、port、Host/Origin 限制、会话配置 |
| `capabilities.tools` | 已发布的工具列表 |
| `capabilities.resources` | 资源列表 |
| `capabilities.resource_templates` | 资源模板 |
| `capabilities.generators` | 后端/前端生成器与 target preset |

这是给 AI 客户端的运行时快照,比让客户端猜工具是否可用更稳。

## 资源

`AdminMcpServer` 发布了一个资源和一个资源模板:

| 类型 | URI | 说明 |
|---|---|---|
| Resource | `schema://tables` | 运行时发现的表列表 |
| Resource Template | `schema://table/{table}` | 单表 schema 元数据 |

推荐工作流是先读资源再调用工具:

```text
1. 读 schema://tables
2. 读 schema://table/sys_user
3. 确认主键、字段、枚举、可写列
4. 再调用 table_query / generate_* / menu_tool
```

不要让 AI 在没读 schema 的情况下猜字段名。

## 通用表工具

`summer-mcp/src/table_tools/router.rs` 提供通用 CRUD:

| 工具 | 作用 |
|---|---|
| `schema_list_tables` | 列出某个 PostgreSQL schema 下的表 |
| `schema_describe_table` | 描述表结构 |
| `table_get` | 按主键读单条 |
| `table_query` | 条件、排序、分页查询 |
| `table_insert` | 插入一行并返回新行 |
| `table_update` | 按主键更新并返回最新行 |
| `table_delete` | 按主键删除 |

这些工具默认面向 PostgreSQL。很多参数都支持显式 `schema`;指定 schema 时,工具会在事务内设置 search_path 或生成带 schema 的 SQL。

## SQL 工具

MCP 还提供两个 SQL 逃生口:

| 工具 | 用途 |
|---|---|
| `sql_query_readonly` | 复杂只读查询 |
| `sql_exec` | 显式 DDL/DML |

`sql_query_readonly` 会把用户 SQL 规范化成只读子查询并加 limit。`sql_exec` 用于明确的写入或 DDL,不应该拿来做普通查询。

这两个工具都比通用表工具危险。优先级建议是:

```text
schema resource -> table_* 工具 -> sql_query_readonly -> sql_exec
```

## 代码生成工具

后端生成器:

| 工具 | 作用 |
|---|---|
| `generate_entity_from_table` | 从真实表生成或更新 SeaORM Entity |
| `upgrade_entity_enums_from_table` | 预览/升级字段枚举语义 |
| `generate_admin_module_from_table` | 生成后端 CRUD 模块草稿 |

前端生成器:

| 工具 | 作用 |
|---|---|
| `generate_frontend_api_from_table` | 生成前端 API 调用文件 |
| `generate_frontend_page_from_table` | 生成列表/表单页面草稿 |
| `generate_frontend_bundle_from_table` | 一次性生成 API、类型、页面 bundle |

`generator_capability_catalog` 里声明了两个 target preset:

| Preset | 说明 |
|---|---|
| `summer_mcp` | MCP 自身测试/临时输出场景 |
| `art_design_pro` | 面向 Art Design Pro 项目结构 |

生成工具支持临时输出目录。建议先输出到 `/tmp/...` 检查,确认后再移动到目标项目。

## 菜单和字典工具

菜单和字典建议通过 MCP 业务工具管理,避免让 AI 直接写 SQL 修改树结构和枚举数据:

| 工具 | 作用 |
|---|---|
| `menu_tool` | 菜单/按钮权限的 plan、export、apply、查询 |
| `dict_tool` | 字典类型和字典数据的 plan、export、apply、查询 |

推荐流程:

```text
1. generate_* 工具返回 menu_config_draft / dict_bundle_drafts
2. 用 menu_tool 或 dict_tool plan
3. 需要人工检查时 export 到临时目录
4. 确认后 apply
5. 再用 list_tree / get_by_type 验证
```

这样比手写 SQL 更不容易破坏树结构、排序、权限标识和字典约束。

## Prompt 模板

MCP Server 发布了三套 prompt:

| Prompt | 用途 |
|---|---|
| `discover_table_workflow` | 引导 AI 先读 schema,再选择 table 工具或 SQL 工具 |
| `generate_crud_bundle_workflow` | 引导从表生成 Entity、后端 CRUD 和前端 bundle |
| `rollout_menu_dict_workflow` | 引导菜单/字典配置先 plan/export,再 apply |

如果客户端支持 MCP prompts,优先使用这些 prompt,可以减少 AI 越过资源读取直接猜结构的情况。

## 安全边界

MCP 是开发/运维工具,不是租户用户 API。

部署注意事项:

- 只支持 PostgreSQL,非 PostgreSQL 会在启动时失败。
- embedded HTTP 模式跟主应用同进程,但不等于自动套用 `summer-system` 的 JWT/RBAC。
- standalone 默认绑定 `127.0.0.1:9090`,不要随意改成 `0.0.0.0`。
- `sql_exec` 可以执行 DDL/DML,只应在可信环境开放。
- 生产环境应配置 Host/Origin 白名单,并通过网络层或反向代理限制访问。
- 多租户场景下,MCP 面向真实数据库结构,不适合作为普通租户工具开放。

## 和系统后台的关系

MCP 和系统后台共享数据库连接,也复用 `summer-domain` 中的菜单、字典领域服务。但 MCP 本身不是 `summer-system/src/router` 的一个普通业务接口。

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

系统后台负责给人使用的管理界面和 API;MCP 负责给 AI 工具提供结构化、受控的工程操作入口。
