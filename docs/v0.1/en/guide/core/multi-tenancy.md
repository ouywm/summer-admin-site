---
title: Multi-Tenancy & Sharding
description: The design story behind summer-sharding — from explicit tenant-connection passing, to sqlparser AST rewriting, to an extensible SQL rewrite plugin system.
published_at: 2026-06-16 15:00:00
---

# Multi-Tenancy & Sharding

Summerrs Admin's multi-tenancy and sharding capabilities live in `crates/summer-sharding`. It is a **SQL middleware built on sqlparser AST rewriting**: business code writes queries with SeaORM as usual, and the middleware applies tenant isolation, shard routing, and various business rewrites right before the SQL executes.

This document first walks through how it was designed step by step, then shows the key code.

## Design Origins

The initial goal was modest: **avoid manually concatenating SQL and passing query parameters by hand.**

Reusing SeaORM's entity mapping lets you build queries in code, but how do you carry tenant and shard info into them? In Java this is usually a `ThreadLocal` holding the tenant context. Rust has the `thread_local!()` macro too, but under tokio's async runtime it loses data across `.await` points — the official recommendation is `task_local!()` instead.

However, this project leans toward **explicit passing**: the database connection is pulled from axum's state and passed down as a parameter, rarely relying on global `static` or `lazy_static`-style implicit globals. So implicit context was dropped in favor of a more explicit path.

The breakthrough was SeaORM's **trait that ultimately executes database operations** (`ConnectionTrait`): implement it, and you can pass your own connection struct into SeaORM's execution flow. Following this thread, the design took shape:

1. In the handler, extract tenant info from the user and bind it to a **tenant connection**; wherever that connection goes, tenant isolation follows.
2. When implementing `ConnectionTrait`, insert a **sqlparser** layer: take the complete SQL that SeaORM built, parse it into an AST, then rebuild the SQL using the AST API (no string concatenation — strings are too error-prone).
3. For elegance and extensibility, **abstract rewriting into a trait** — register and run these "SQL rewrite plugins" in order. Adding new capabilities later (data permissions: see only your dept / yourself / dept-and-children) needs no middleware changes, just a trait implementation.

## Execution Flow

The full path of a SeaORM query through `summer-sharding`:

```text
Application SeaORM query
        │
        ▼
ShardingConnection.execute_raw / query_*_raw   ← implements SeaORM's ConnectionTrait
        │
        ▼
analyze_statement()    ← sqlparser parses SQL, extracts tables / WHERE / hint / tenant
        │
        ▼
DefaultSqlRouter       ← routing decision: single shard / cross-shard / broadcast
        │
        ▼
DefaultSqlRewriter     ← rewrite SQL (per target shard): table swap / tenant injection / plugins
        │
        ▼
ScatterGatherExecutor  ← single / multi-target parallel execution
        │
        ▼
DefaultResultMerger    ← cross-shard result merge
        │
        ▼
QueryResult returned upstream
```

The middleware has three layers; lower layers are unaware of upper-layer business concepts:

| Layer | Responsibility |
|---|---|
| `sql_rewrite` (plugin layer) | `SqlRewritePlugin` trait + `PluginRegistry`; only the rewrite pipeline and table filtering, knows nothing about "shard / tenant" |
| `summer-sharding` (shard layer) | Sharding routing, tenant isolation, built-in table rewriting and tenant condition injection |
| Application code | Business services, user-defined `SqlRewritePlugin`s (optimistic lock / auto-fill / data scope) |

## Step 1: Implement SeaORM's ConnectionTrait

`ShardingConnection` implements SeaORM's `ConnectionTrait`, so it can be passed directly as the database connection to any SeaORM query. Internally it holds the router, rewriter, executor, merger, and tenant metadata:

```rust
// crates/summer-sharding/src/connector/connection.rs
#[derive(Clone)]
pub struct ShardingConnection {
    pub(crate) inner: Arc<ShardingConnectionInner>,
    pub(crate) hint_override: Option<ShardingHint>,
    pub(crate) access_context_override: Option<ShardingAccessContext>,
    pub(crate) tenant_override: Option<crate::tenant::TenantContext>,
}

pub(crate) struct ShardingConnectionInner {
    pub(crate) config: Arc<ShardingConfig>,
    pub(crate) pool: DataSourcePool,
    pub(crate) router: Box<dyn SqlRouter>,
    pub(crate) rewriter: Box<dyn SqlRewriter>,
    pub(crate) executor: Box<dyn Executor>,
    pub(crate) merger: Box<dyn ResultMerger>,
    pub(crate) tenant_metadata: Arc<TenantMetadataStore>,
    pub(crate) tenant_router: TenantRouter,
    /// SQL rewrite plugin registry
    pub(crate) plugin_registry: OnceLock<PluginRegistry>,
}
```

The `execute_raw` / `query_*_raw` methods SeaORM calls are forwarded to the internal prepare-and-execute flow:

```rust
// crates/summer-sharding/src/connector/connection.rs
#[async_trait::async_trait]
impl ConnectionTrait for ShardingConnection {
    async fn execute_raw(&self, stmt: Statement) -> Result<ExecResult, DbErr> {
        self.execute_with_raw(&self.inner.pool, stmt, false).await
    }

    async fn query_all_raw(&self, stmt: Statement) -> Result<Vec<QueryResult>, DbErr> {
        self.query_all_with_raw(&self.inner.pool, stmt, false).await
    }
    // query_one_raw, etc. follow the same pattern
}
```

By this point SeaORM has already built the query into a complete `Statement` (SQL string + params). **Once you have the full SQL, you can rewrite it however you like.**

## Step 2: Parse to AST with sqlparser, then rewrite

`prepare_statement` is the heart of routing + rewriting. It first uses `analyze_statement` to parse the SQL into an AST and extract metadata, then routes, then hands off to the rewriter:

```rust
// crates/summer-sharding/src/connector/connection/exec.rs
pub(crate) async fn prepare_statement(/* ... */) -> Result<(...)> {
    // 1. sqlparser parses SQL, extracts tables / WHERE / hint / tenant
    let mut analysis = analyze_statement(stmt)?;
    analysis.tenant = overrides.tenant;

    // 2. routing decision: single shard / cross-shard / broadcast
    let mut plan = self.router.route(&analysis, force_primary)?;

    // 3. adjust routing by tenant isolation level (table suffix, schema, datasource)
    self.apply_tenant_route(&mut plan, analysis.tenant.as_ref());

    // 4. rewrite: sqlparser steps in here
    let statements =
        self.rewriter
            .rewrite(stmt, &analysis, &plan, self.plugin_registry.get())?;
    // ...
}
```

`DefaultSqlRewriter::rewrite` clones the AST per target shard and rewrites **entirely via sqlparser's AST API** — swapping table names, injecting tenant conditions, inflating LIMIT — only calling `to_string()` at the end to turn it back into SQL:

```rust
// crates/summer-sharding/src/rewrite/mod.rs
for target in &plan.targets {
    // analysis.ast is the AST produced by analyze_statement() via sqlparser
    let mut parsed = analysis.ast.clone();

    // logical table → physical table (rewrite AST, no string concat)
    for rewrite in &target.table_rewrites {
        rewrite_table_names(&mut parsed, &rewrite.logic_table, &rewrite.actual_table);
        apply_schema_rewrite(&mut parsed, &rewrite.logic_table, &rewrite.actual_table);
    }

    // inflate LIMIT for cross-shard fan-out
    if plan.targets.len() > 1 {
        inflate_limit_for_fanout(&mut parsed, plan.limit, plan.offset);
    }

    // inject tenant condition (rewrite WHERE clause)
    if let Some(tenant) = analysis.tenant.as_ref() {
        apply_tenant_rewrite(&mut parsed, tenant, &self.config, &plan.logic_tables);
    }

    // run plugin pipeline (see Step 3)
    if let Some(registry) = plugin_registry {
        // ... build SqlRewriteContext, registry.rewrite_all(&mut ctx)?
    }

    // turn the rewritten AST back into a SQL string
    statement.sql = format_with_comments(&parsed.to_string(), &comments);
}
```

## Step 3: Abstract rewriting into a plugin trait

Built-in rewriting (table swap, tenant injection) handles sharding and tenant isolation, but adding new capabilities (like data permissions) shouldn't require editing the library every time. So the core rewriting capability is abstracted into the `SqlRewritePlugin` trait — implement it, register it, and it joins the rewrite pipeline:

```rust
// crates/summer-sharding/src/sql_rewrite/plugin.rs
pub trait SqlRewritePlugin: Send + Sync + 'static {
    /// plugin name (defaults to type_name)
    fn name(&self) -> &str { std::any::type_name::<Self>() }

    /// execution order, smaller runs first. Default 100; built-ins 0-99, user plugins 100+
    fn order(&self) -> i32 { 100 }

    /// only applies to these tables. Empty = all. Framework checks before calling matches()
    fn tables(&self) -> &[QualifiedTableName] { &[] }

    /// always skip these tables, higher priority than tables()
    fn skip_tables(&self) -> &[QualifiedTableName] { &[] }

    /// the plugin's own match logic (operation type, extensions, etc.)
    fn matches(&self, ctx: &SqlRewriteContext) -> bool;

    /// rewrite the AST or write comments
    fn rewrite(&self, ctx: &mut SqlRewriteContext) -> Result<()>;
}
```

The context `SqlRewriteContext` exposes the mutable sqlparser AST directly, plus a typed `extensions` container for plugins to pass data between each other:

```rust
// crates/summer-sharding/src/sql_rewrite/context.rs
pub struct SqlRewriteContext<'a> {
    pub statement: &'a mut AstStatement,  // sqlparser AST, mutable
    pub operation: SqlOperation,          // Select/Insert/Update/Delete/Other
    pub tables: Vec<String>,              // all tables in the SQL
    pub original_sql: &'a str,            // original SQL (read-only)
    pub extensions: &'a mut Extensions,   // typed context container
    pub comments: Vec<String>,            // write comments (appended to final SQL)
}
```

Table filtering (`tables()` / `skip_tables()`) is handled uniformly by the framework, so a plugin's `matches()` only cares about operation type and extensions — no need for every plugin to reimplement "does this table belong to me."

### Order conventions

To keep plugins from clashing, order bands are agreed upon:

| Order band | Purpose | Example |
|---|---|---|
| 0-9 | Earliest preprocessing | post-parse handling |
| 10-29 | Tenant rewriting | sharding's internal `apply_tenant_rewrite` (not a plugin) |
| 30-49 | Shard tagging | `TableShardingPlugin` (writes shard route comment, order=30) |
| 50-99 | Security enhancements | optimistic lock, audit field auto-fill |
| 100+ | Business customization | data permissions, other business plugins |

### Minimal example: ProbePlugin

The built-in `ProbePlugin` is the minimal template — it doesn't change SQL, just counts hits and writes a comment, handy for verifying the pipeline actually runs:

```rust
// crates/summer-sharding/src/sql_rewrite/builtin/probe.rs
#[derive(Clone, Default)]
pub struct ProbePlugin {
    counter: Arc<AtomicUsize>,
}

impl SqlRewritePlugin for ProbePlugin {
    fn name(&self) -> &str { "probe" }
    fn matches(&self, _ctx: &SqlRewriteContext) -> bool { true }
    fn rewrite(&self, ctx: &mut SqlRewriteContext) -> Result<()> {
        let n = self.counter.fetch_add(1, Ordering::Relaxed) + 1;
        ctx.append_comment(&format!("probe={n}"));
        Ok(())
    }
}
```

### Registering plugins

Register at startup in `main.rs` via `sql_rewrite_configure`; all plugins share one `PluginRegistry`:

```rust
// crates/app/src/main.rs
use summer_sharding::{ProbePlugin, SqlRewriteConfigurator, SummerShardingPlugin};

app.add_plugin(SummerShardingPlugin)
    // ... other plugins
    .add_router(router::router())
    .sql_rewrite_configure(|registry| registry.register(ProbePlugin::new()))
    .run()
    .await;
```

Afterward, every SQL going through `ShardingConnection` applies all matching plugins in order.

## Tenant Connection: Explicit Binding

Back to that original idea of "binding the tenant connection in the handler." The `TenantContextLayer` middleware resolves a `TenantContext` from the request and uses `with_tenant_context` to derive a **tenant-bound connection**, placing it in the request extension:

```rust
// crates/summer-sharding/src/connector/connection/overrides.rs
pub fn with_tenant_context(&self, tenant: TenantContext) -> Self {
    let resolved = self.inner.tenant_router.resolve_context(tenant);
    let mut clone = self.clone();
    clone.tenant_override = Some(resolved);  // override tenant only, share the pool
    clone
}
```

The handler receives this connection via an extractor; all subsequent queries automatically carry tenant isolation:

```rust
use summer_sharding::{CurrentTenant, TenantShardingConnection};

async fn list_orders(
    CurrentTenant(tenant): CurrentTenant,                 // current tenant context
    TenantShardingConnection(db): TenantShardingConnection, // tenant-bound connection
) -> ApiResult<Json<Vec<OrderVo>>> {
    // db is bound to the tenant; this query auto-injects tenant isolation
    let orders = order::Entity::find().all(&db).await?;
    Ok(Json(orders.into_iter().map(Into::into).collect()))
}
```

Where the tenant ID comes from is configured by `TenantIdSource`: `RequestExtension` (default, injected by an upstream layer), `Header`, `JwtClaim`, `QueryParam`, or a custom `Context`. **Never trust a tenant ID passed freely by the client** — it should come from a trusted source (login state, gateway context).

## Four Isolation Levels

`TenantIsolationLevel` defines four isolation strengths, applied by `apply_tenant_rewrite` / tenant routing per level:

| Level | Meaning | How | Use case |
|---|---|---|---|
| `SharedRow` | Shared table, row-level | inject `WHERE tenant_id = ?` | many tenants, small volume, common SaaS |
| `SeparateTable` | Same schema, table suffix | `order` → `order_t<tenant>` | medium isolation, easy migration |
| `SeparateSchema` | Same DB, different schema | `public.order` → `tenant_<id>.order` | strong isolation, independent backup |
| `SeparateDatabase` | Different physical DB | route to the tenant's dedicated datasource | strongest isolation, compliance |

Tenant config lives in `TenantMetadataStore`: loaded from the `sys_tenant` table by `TenantMetadataLoader` at startup; updated at runtime via PG `NOTIFY` to hot-reload metadata across all processes. `TenantLifecycleManager` handles onboard / offboard — `SeparateTable` auto-runs `CREATE TABLE ... (LIKE base_table)`, `SeparateSchema` auto-runs `CREATE SCHEMA tenant_<id>`.

## Shard Routing

`DefaultSqlRouter` decides the route target in this order:

```text
parsed StatementContext
   ├─ no primary table → default datasource (system tables / metadata)
   ├─ primary table not in sharding rules → single shard direct
   └─ primary table matches a sharding rule
        ├─ has hint → explicitly specified target
        ├─ INSERT → locate via sharding_column value from VALUES
        └─ SELECT/UPDATE/DELETE
             ├─ WHERE has exact shard-key condition → single / multi shard
             ├─ WHERE has range shard-key condition → range sharding
             └─ neither → broadcast (fan-out to all shards)
```

Six built-in sharding algorithms:

| Algorithm | Use | Behavior |
|---|---|---|
| `hash_mod` | even spread | `hash(value) % count` |
| `inline` | expression | render configured expression `t_user_${id % 4}` |
| `tenant` | tenant routing | use `tenant_id` directly as the target key |
| `time_range` | time archiving | split by month / day, auto-filter recent N months |
| `hash_range` | hash range | match hash landing point to a range |
| `complex` | composite | multiple columns participate in sharding |

Cross-shard queries are dispatched in parallel by `ScatterGatherExecutor`, and `DefaultResultMerger` merges LIMIT / ORDER BY.

## Configuration Example

```toml
[summer-sharding]
enabled = true

# datasources (multiple allowed, each its own pool)
[summer-sharding.datasources.ds_main]
uri = "postgres://user:pass@localhost:5432/main"
schema = "public"
role = "primary"

# tenant config
[summer-sharding.tenant]
enabled = true
default_isolation = "shared_row"
shared_tables = ["sys_dict", "sys_config"]   # tables shared across tenants
tenant_id_source = "request_extension"
tenant_id_field = "x-tenant-id"

[summer-sharding.tenant.row_level]
column_name = "tenant_id"
strategy = "sql_rewrite"

# sharding rule: hash-mod tenant_id into 4 tables
[[summer-sharding.sharding.tables]]
logic_table = "ai.request"
actual_tables = ["ai.request_0", "ai.request_1", "ai.request_2", "ai.request_3"]
sharding_column = "tenant_id"
algorithm = "hash_mod"
  [summer-sharding.sharding.tables.algorithm_props]
  count = 4
```

## Business Plugin Patterns

This plugin mechanism was designed precisely so that "adding data permissions later needs no library changes." Such plugins are tightly coupled to business specifics (column conventions, user context model, dept tree structure), so the library does **not** bundle them — the business implements them. A few common patterns:

**Optimistic lock (order≈50)**: UPDATE auto-adds a `version` field.

```sql
-- original
UPDATE user SET nick_name = 'foo' WHERE id = 1
-- rewritten
UPDATE user SET nick_name = 'foo', version = version + 1
WHERE id = 1 AND version = <old version from ctx>
```

**Audit field auto-fill (order≈60)**: INSERT fills `create_time` / `create_by`, UPDATE fills `update_time` / `update_by`, read from `ctx.extension::<CurrentUser>()` (web middleware must inject it first).

**Data scope (order≈70)**: read the current user's visible range from `ctx.extension::<DataScope>()` and inject the matching WHERE condition:

```rust
pub enum DataScope {
    Self_,            // creator_id = current_user_id
    Dept,             // dept_id = current_user.dept_id
    DeptAndChildren,  // dept_id IN (subtree)
    Custom(Vec<i64>), // dept_id IN (...)
    All,              // no condition
}
```

This is exactly the scenario envisioned at design time — "see only yourself / your dept / dept-and-children." The `DeptAndChildren` subtree query result should be cached at the middleware layer rather than queried on every SQL.

## Summary

Stringing the key design decisions together:

1. **Explicit over implicit** — no `task_local`; pass the tenant connection explicitly as a parameter.
2. **Hook into SeaORM's execution trait** — `ShardingConnection` implements `ConnectionTrait`, integrating seamlessly with existing query code.
3. **AST rewriting over string concatenation** — parse with sqlparser, rewrite via the AST API, avoid string errors.
4. **Trait abstraction for extensibility** — rewriting becomes `SqlRewritePlugin`; new needs just implement the trait, the middleware stays untouched.
