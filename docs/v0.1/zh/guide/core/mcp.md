---
title: MCP 服务器
description: 嵌入式与独立模式、库表发现、表级 CRUD、SQL 工具、代码生成器与业务工具。
published_at: 2026-05-04 12:30:00
---

# MCP 服务器

`summer-mcp` 是一个内嵌的 [MCP (Model Context Protocol)](https://modelcontextprotocol.io) 服务器,基于 [rmcp](https://github.com/modelcontextprotocol/rust-sdk) (Rust 官方 SDK) 实现。它把项目内部的**数据库 schema、CRUD 工具、代码生成器、菜单/字典业务工具**,以 MCP 协议暴露给 AI 助手(Claude Desktop / Cursor / Cline / Continue 等)。

## 两种运行模式

由 `[mcp]` 配置段的 `http_mode` 决定:

| 模式 | 启动方式 | 路径 | 适合 |
|---|---|---|---|
| **embedded** | 跟主应用一起跑(挂在 axum router) | `http://localhost:8080/api/mcp` | 开发调试 / 与主后台共部署 |
| **standalone** | 独立二进制 | `http://127.0.0.1:9090/mcp` | AI 工具单独连接 / 不需要业务 API |

```toml
[mcp]
enabled = true
transport = "http"          # http | stdio
http_mode = "embedded"      # embedded | standalone
path = "/mcp"
binding = "127.0.0.1"
port = 9090

# 服务器元信息(MCP 协议中上报给客户端)
server_name = "summerrs-admin-mcp"
server_version = "0.0.1"
title = "Summerrs Admin MCP"
description = "summerrs-admin 后台管理系统 MCP Server,提供库表发现、通用表工具、代码生成和菜单/字典业务工具"
instructions = """..."""    # 写给 AI Agent 看的使用说明,见配置文件

# Streamable HTTP 模式专用
stateful_mode = true
json_response = false       # 无状态模式下返回 JSON 而非 SSE
sse_keep_alive = 15
sse_retry = 3
session_channel_capacity = 16
```

## standalone 启动

```bash
cargo run -p summer-mcp --features standalone --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin'
```

## 暴露的能力

`AdminMcpServer` (`crates/summer-mcp/src/server.rs`) 提供三大类:

### 1. 资源(Resource)

| URI | 内容 |
|---|---|
| `schema://tables` | 所有表的列表(运行时发现) |
| `schema://table/{table}` | 单张表的字段、类型、注释、索引、外键 |

> AI 调用工具前,**先让它读资源**确认真实表结构。这样不容易凭空捏造字段名。

### 2. 工具(Tool)

`crates/summer-mcp/src/tools/` 与 `crates/summer-mcp/src/table_tools/`:

#### 通用表工具(table_tools/)

| 工具 | 作用 |
|---|---|
| `table_get` | 按主键读单条 |
| `table_query` | 多条件 + 排序 + 分页 |
| `table_insert` | 单条插入 |
| `table_update` | 按主键更新 |
| `table_delete` | 按主键删除 |

> 这些是**通用 CRUD**,不需要为每张表单独建工具。AI 拿到 `schema://table/xxx` 之后就能直接调。

#### SQL 逃生口

| 工具 | 作用 |
|---|---|
| `sql_query_readonly` | 复杂只读 SQL,不能 DDL/DML |
| `sql_exec` | 显式 DDL/DML,只用于"AI 知道自己在做什么"的场景 |

#### 代码生成器(tools/)

| 工具 | 作用 |
|---|---|
| `generate_entity_from_table` | 表 → SeaORM Entity(自动识别注释枚举,生成 `DeriveActiveEnum`) |
| `upgrade_entity_enums_from_table` | 预览 / 微调枚举升级方案 |
| `generate_admin_module_from_table` | 表 → 后端 CRUD 模块(router + service + dto + vo) |
| `generate_frontend_bundle_from_table` | 表 → 前端 api/types/page bundle(支持 Art Design Pro 预设) |

#### 业务工具

| 工具 | 作用 |
|---|---|
| `menu_tool` | 菜单批量管理 (plan/export/apply),不要让 AI 直接 SQL 改菜单 |
| `dict_tool` | 字典批量管理 (plan/export/apply) |

### 3. Prompt 模板

`crates/summer-mcp/src/prompts.rs`:

| Prompt | 引导工作流 |
|---|---|
| `discover_table_workflow` | 拿到一张陌生表,从 schema 资源开始一步步摸 |
| `generate_crud_bundle_workflow` | 表 → 后端模块 + 前端 bundle 的完整生成流程 |
| `rollout_menu_dict_workflow` | 用 menu_tool / dict_tool 部署菜单和字典的安全流程 |

## 用 Claude Desktop 接入

`~/Library/Application Support/Claude/claude_desktop_config.json`:

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

或者用 stdio:

```bash
# 启动 standalone stdio
cargo run -p summer-mcp --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin' \
  --transport stdio
```

```json
{
  "mcpServers": {
    "summerrs-admin": {
      "command": "/path/to/summerrs-mcp",
      "args": ["--database-url", "postgres://...", "--transport", "stdio"]
    }
  }
}
```

## 用 Cursor / Cline 接入

Cursor `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "summerrs-admin": {
      "url": "http://localhost:8080/api/mcp"
    }
  }
}
```

## 实战:用 AI 生成一个 CRUD 模块

假设你刚加了 `sys.tag` 表,想让 AI 把整套代码生成出来:

1. 在 Claude Desktop / Cursor 里打开项目
2. 让 AI 用 `discover_table_workflow` prompt 探查表
3. AI 会先读 `schema://table/sys.tag`
4. 让它执行 `generate_entity_from_table(table="sys.tag")` 生成 Entity
5. `generate_admin_module_from_table(table="sys.tag")` 生成后端 router/service/dto/vo
6. `generate_frontend_bundle_from_table(table="sys.tag", target_preset="art_design_pro")` 生成前端
7. AI 把代码写到对应文件夹
8. 你跑 `cargo build` 验证编译通过

整个过程**不需要写一行 boilerplate**。

## 实战:批量改菜单

不要让 AI 写 SQL 改 `sys.menu` 表(容易破坏关系树)。让它用 `menu_tool`:

```text
用 menu_tool plan 动作,准备给"AI 网关"模块加 5 个子菜单和 12 个按钮权限
然后用 export 看看 plan 生成的 SQL/JSON
确认无误后 apply
```

`menu_tool` 内部:

- 检查父菜单是否存在
- 检查 `perm` 是否冲突
- 排序自动算
- 失败时回滚

## 与 SQL 改写的协作

`McpPlugin::build` 会校验 `DatabaseConnection` 是 PostgreSQL,然后挂上 axum router。**MCP 操作不走租户隔离**——它是开发工具,看的是真实 schema,不要让租户上下文污染它。

如果生产部署里担心 MCP 被滥用,直接 `[mcp].enabled = false` 关掉,或者只在 dev profile 里开。

## 服务器能力快照

调用 `server_capabilities` 工具能拿到一份运行时快照:

```json
{
  "version": "0.0.1",
  "transport": "http",
  "mode": "embedded",
  "path": "/api/mcp",
  "tools": ["table_get", "table_query", "..."],
  "resources": ["schema://tables"],
  "prompts": ["discover_table_workflow", "..."],
  "generator_presets": ["art_design_pro", "..."],
  "database_connected": true
}
```

适合 AI 第一次连接时用来"自我介绍",省得它去猜你启用了什么。

## 安全考量

- **生产慎开 SQL 工具** —— `sql_exec` 能跑任意 DDL/DML,只在内网 / 信任环境用
- **MCP 监听地址** —— standalone 默认 `127.0.0.1:9090`,不要绑 `0.0.0.0`
- **认证** —— 当前 embedded 模式不要求 token(走主应用的网络层访问控制),standalone 模式建议套一层反代或网络隔离
- **审计** —— 所有工具调用应该走主应用的操作日志(后续会接入 `LogBatchCollectorPlugin`)

## 参考源码

- 入口:`crates/summer-mcp/src/lib.rs`
- 插件:`crates/summer-mcp/src/plugin.rs`
- Server:`crates/summer-mcp/src/server.rs`
- 运行时(embedded/standalone):`crates/summer-mcp/src/runtime.rs`
- 配置:`crates/summer-mcp/src/config.rs`
- Prompt:`crates/summer-mcp/src/prompts.rs`
- 通用表工具:`crates/summer-mcp/src/table_tools/`
- 代码生成器:`crates/summer-mcp/src/tools/`
- skill 文档:`skills/summerrs-admin/references/mcp-generator.md`
