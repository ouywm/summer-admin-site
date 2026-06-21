---
title: 多租户与分片
description: summer-sharding 的设计思路——从显式传递租户连接，到 sqlparser AST 改写，再到可扩展的 SQL 改写插件体系。
published_at: 2026-06-16 15:00:00
---

# 多租户与分片

Summerrs Admin 的多租户和分库分表能力由 `crates/summer-sharding` 提供。它是一套**基于 sqlparser AST 改写的 SQL 中间件**：业务代码照常用 SeaORM 写查询，中间件在 SQL 真正执行前完成租户隔离、分片路由和各种业务改写。

这篇文档先讲清楚它是怎么一步步设计出来的，再贴出关键代码。

## 设计缘起

最初的目标很朴素：**不想手动拼接 SQL、手动传递查询参数**。

复用 SeaORM 的实体映射能力可以用代码构建查询，但租户、分片这类信息要怎么带进去？在 Java 里通常用 `ThreadLocal` 存租户上下文，Rust 也有 `thread_local!()` 宏，但在 tokio 的异步运行时下跨 `.await` 会丢数据——官方建议改用 `task_local!()`。

不过这个项目本身的风格更偏向**显式传递**：数据库连接从 axum 的 state 里提取出来，一路作为参数传下去，很少用全局 `static` 或 `lazy_static` 之类的隐式全局变量。所以最终放弃了隐式上下文，选择了一条更显式的路。

突破口在 SeaORM **最终执行数据库操作的那个 trait**（`ConnectionTrait`）：只要实现了它，就能把自定义的连接结构传进 SeaORM 的执行流程。沿着这个思路，方案逐渐成形：

1. 在 handler 里从用户信息提取租户信息，绑定到一个**租户连接**上；这个连接传到哪里，哪里就能做租户隔离。
2. 在实现 `ConnectionTrait` 时加一层 **sqlparser**：拿到 SeaORM 构建好的完整 SQL 后，解析成 AST，再用 AST API 重新拼回 SQL（不手动拼字符串，字符串太容易出错）。
3. 为了优雅和扩展性，把改写能力**抽象成一个 trait**——按顺序注册并执行这些「SQL 改写插件」。这样以后要加数据权限（只看本部门 / 只看本人 / 看部门加子部门）等新能力，不用改中间件代码，实现一个 trait 即可。

## 执行流程

一条 SeaORM 查询在 `summer-sharding` 里的完整轨迹：

```text
应用层 SeaORM 查询
        │
        ▼
ShardingConnection.execute_raw / query_*_raw   ← 实现了 SeaORM 的 ConnectionTrait
        │
        ▼
analyze_statement()    ← sqlparser 解析 SQL，抽取表 / WHERE 条件 / hint / tenant
        │
        ▼
DefaultSqlRouter       ← 路由决策：单分片 / 跨分片 / 广播
        │
        ▼
DefaultSqlRewriter     ← 改写 SQL（每个目标分片）：表名替换 / 租户注入 / 插件管道
        │
        ▼
ScatterGatherExecutor  ← 单 / 多目标并行执行
        │
        ▼
DefaultResultMerger    ← 跨分片结果合并
        │
        ▼
QueryResult 返回上层
```

整套中间件分三层，下层不感知上层的业务概念：

| 层 | 职责 |
|---|---|
| `sql_rewrite`（插件层） | `SqlRewritePlugin` trait + `PluginRegistry`，只提供改写管道和表名过滤，不懂「分片 / 租户」 |
| `summer-sharding`（分片层） | 分库分表路由、多租户隔离、内置表名改写和租户条件注入 |
| 应用代码 | 业务 Service、用户自定义的 `SqlRewritePlugin`（乐观锁 / 自动填充 / 数据权限等） |

## 第一步：实现 SeaORM 的 ConnectionTrait

`ShardingConnection` 实现了 SeaORM 的 `ConnectionTrait`，所以可以直接当数据库连接传给任何 SeaORM 查询。它内部持有路由器、改写器、执行器、合并器和租户元数据：

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
    /// SQL 改写插件注册表
    pub(crate) plugin_registry: OnceLock<PluginRegistry>,
}
```

SeaORM 执行查询时调用的 `execute_raw` / `query_*_raw` 方法被转发到内部的准备和执行流程：

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
    // query_one_raw 等同理
}
```

到这一步，SeaORM 已经把查询构建成了完整的 `Statement`（SQL 字符串 + 参数）。**拿到完整 SQL，后面就能任意改写。**

## 第二步：用 sqlparser 解析为 AST，再改写

`prepare_statement` 是路由 + 改写的核心。它先用 `analyze_statement` 把 SQL 解析成 AST 并抽取元信息，然后路由、再交给改写器：

```rust
// crates/summer-sharding/src/connector/connection/exec.rs
pub(crate) async fn prepare_statement(/* ... */) -> Result<(...)> {
    // 1. sqlparser 解析 SQL，抽取表 / WHERE 条件 / hint / 租户
    let mut analysis = analyze_statement(stmt)?;
    analysis.tenant = overrides.tenant;

    // 2. 路由决策：单分片 / 跨分片 / 广播
    let mut plan = self.router.route(&analysis, force_primary)?;

    // 3. 按租户隔离级别微调路由（表名后缀、schema、数据源）
    self.apply_tenant_route(&mut plan, analysis.tenant.as_ref());

    // 4. 改写：在这里 sqlparser 介入
    let statements =
        self.rewriter
            .rewrite(stmt, &analysis, &plan, self.plugin_registry.get())?;
    // ...
}
```

改写器 `DefaultSqlRewriter::rewrite` 对每个目标分片克隆一份 AST，全程**用 sqlparser 的 AST API 改写**——替换表名、注入租户条件、放大 LIMIT，最后才 `to_string()` 转回 SQL：

```rust
// crates/summer-sharding/src/rewrite/mod.rs
for target in &plan.targets {
    // analysis.ast 是 analyze_statement() 用 sqlparser 解析出的 AST
    let mut parsed = analysis.ast.clone();

    // 逻辑表 → 物理表（改 AST，不拼字符串）
    for rewrite in &target.table_rewrites {
        rewrite_table_names(&mut parsed, &rewrite.logic_table, &rewrite.actual_table);
        apply_schema_rewrite(&mut parsed, &rewrite.logic_table, &rewrite.actual_table);
    }

    // 跨分片时放大 LIMIT
    if plan.targets.len() > 1 {
        inflate_limit_for_fanout(&mut parsed, plan.limit, plan.offset);
    }

    // 注入租户条件（改 WHERE 子句）
    if let Some(tenant) = analysis.tenant.as_ref() {
        apply_tenant_rewrite(&mut parsed, tenant, &self.config, &plan.logic_tables);
    }

    // 执行插件管道（见第三步）
    if let Some(registry) = plugin_registry {
        // ... 构造 SqlRewriteContext，registry.rewrite_all(&mut ctx)?
    }

    // 改写后的 AST 转回 SQL 字符串
    statement.sql = format_with_comments(&parsed.to_string(), &comments);
}
```

## 第三步：把改写抽象成插件 trait

内置改写（表名替换、租户注入）解决了分片和租户隔离，但要加新能力（比如数据权限）总不能每次改库代码。所以核心改写能力被抽象成 `SqlRewritePlugin` trait——实现它、注册它，就能加入改写管道：

```rust
// crates/summer-sharding/src/sql_rewrite/plugin.rs
pub trait SqlRewritePlugin: Send + Sync + 'static {
    /// 插件名字（默认用 type_name）
    fn name(&self) -> &str { std::any::type_name::<Self>() }

    /// 执行顺序，越小越先执行。默认 100，内置用 0-99，用户插件建议 100+
    fn order(&self) -> i32 { 100 }

    /// 只对这些表生效。空 = 全部表。框架在调用 matches() 前自动检查
    fn tables(&self) -> &[QualifiedTableName] { &[] }

    /// 始终跳过这些表，优先级高于 tables()
    fn skip_tables(&self) -> &[QualifiedTableName] { &[] }

    /// 插件自身的匹配逻辑（操作类型、extensions 等）
    fn matches(&self, ctx: &SqlRewriteContext) -> bool;

    /// 改写 AST 或写注释
    fn rewrite(&self, ctx: &mut SqlRewriteContext) -> Result<()>;
}
```

插件拿到的上下文 `SqlRewriteContext` 直接暴露可变的 sqlparser AST，还有一个类型化的 `extensions` 容器供插件之间传数据：

```rust
// crates/summer-sharding/src/sql_rewrite/context.rs
pub struct SqlRewriteContext<'a> {
    pub statement: &'a mut AstStatement,  // sqlparser AST，可直接改
    pub operation: SqlOperation,          // Select/Insert/Update/Delete/Other
    pub tables: Vec<String>,              // SQL 涉及的所有表
    pub original_sql: &'a str,            // 原始 SQL（只读）
    pub extensions: &'a mut Extensions,   // 类型化上下文容器
    pub comments: Vec<String>,            // 写注释（附到最终 SQL）
}
```

表名过滤（`tables()` / `skip_tables()`）由框架统一做，插件的 `matches()` 只关心操作类型和 extensions，不用每个插件都重写一遍「这张表归不归我管」的逻辑。

### 执行顺序约定

为避免插件互相打架，约定了 order 段位：

| order 段位 | 用途 | 示例 |
|---|---|---|
| 0-9 | 最早期预处理 | 解析后处理 |
| 10-29 | 租户改写 | sharding 内部 `apply_tenant_rewrite`（不走插件） |
| 30-49 | 分片标记 | `TableShardingPlugin`（写分片路由注释，order=30） |
| 50-99 | 安全增强 | 乐观锁、审计字段自动填充 |
| 100+ | 业务定制 | 数据权限、其他业务插件 |

### 最小示例：ProbePlugin

库内自带的 `ProbePlugin` 是最小模板——不改 SQL，只统计命中次数、写一条注释，常用于验证插件管道是否真的被执行：

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

### 注册插件

在 `main.rs` 启动时通过 `sql_rewrite_configure` 注册，所有插件共享同一个 `PluginRegistry`：

```rust
// crates/app/src/main.rs
use summer_sharding::{ProbePlugin, SqlRewriteConfigurator, SummerShardingPlugin};

app.add_plugin(SummerShardingPlugin)
    // ... 其他插件
    .add_router(router::router())
    .sql_rewrite_configure(|registry| registry.register(ProbePlugin::new()))
    .run()
    .await;
```

注册后，每条经过 `ShardingConnection` 的 SQL 都会按 order 顺序应用所有匹配的插件。

## 租户连接：显式绑定

回到最初那个「在 handler 里绑定租户连接」的想法。`TenantContextLayer` 中间件从请求里解析出 `TenantContext`，用 `with_tenant_context` 派生出一个**绑定了租户的连接**，放进请求 extension：

```rust
// crates/summer-sharding/src/connector/connection/overrides.rs
pub fn with_tenant_context(&self, tenant: TenantContext) -> Self {
    let resolved = self.inner.tenant_router.resolve_context(tenant);
    let mut clone = self.clone();
    clone.tenant_override = Some(resolved);  // 只覆盖租户，共享底层连接池
    clone
}
```

handler 通过提取器拿到这个连接，之后所有查询都自动带上租户隔离：

```rust
use summer_sharding::{CurrentTenant, TenantShardingConnection};

async fn list_orders(
    CurrentTenant(tenant): CurrentTenant,                 // 当前租户上下文
    TenantShardingConnection(db): TenantShardingConnection, // 已绑定租户的连接
) -> ApiResult<Json<Vec<OrderVo>>> {
    // db 已绑定 tenant，这条查询会自动注入租户隔离
    let orders = order::Entity::find().all(&db).await?;
    Ok(Json(orders.into_iter().map(Into::into).collect()))
}
```

租户 ID 从哪里取由配置的 `TenantIdSource` 决定：`RequestExtension`（默认，从上游 layer 注入）、`Header`、`JwtClaim`、`QueryParam` 或自定义 `Context`。**不要直接相信客户端随意传入的租户 ID**，应由可信来源（登录态、网关上下文）生成。

## 四种隔离级别

`TenantIsolationLevel` 定义了四种隔离强度，由 `apply_tenant_rewrite` / 租户路由按级别改写：

| 级别 | 含义 | 实现方式 | 适用场景 |
|---|---|---|---|
| `SharedRow` | 同表共享，行级隔离 | WHERE 注入 `tenant_id = ?` | 租户多、量小、SaaS 通用 |
| `SeparateTable` | 同库同 schema，表名后缀 | `order` → `order_t<tenant>` | 中等隔离，迁移容易 |
| `SeparateSchema` | 同库不同 schema | `public.order` → `tenant_<id>.order` | 强隔离，备份恢复独立 |
| `SeparateDatabase` | 不同物理库 | 路由到该租户独立的 datasource | 最强隔离，合规场景 |

租户配置存在 `TenantMetadataStore` 里：启动时由 `TenantMetadataLoader` 从 `sys_tenant` 表加载；运行期通过 PG `NOTIFY` 监听变更，热更新所有进程的元数据。`TenantLifecycleManager` 负责 onboard / offboard——`SeparateTable` 自动 `CREATE TABLE ... (LIKE base_table)`，`SeparateSchema` 自动 `CREATE SCHEMA tenant_<id>`。

## 分片路由

`DefaultSqlRouter` 按这个顺序决策路由目标：

```text
解析后的 StatementContext
   ├─ 无主表 → 默认 datasource（系统表 / 元数据）
   ├─ 主表不在分片规则 → 单分片直发
   └─ 主表命中分片规则
        ├─ 有 hint → 显式指定目标
        ├─ INSERT → 从 VALUES 取 sharding_column 值定位
        └─ SELECT/UPDATE/DELETE
             ├─ WHERE 有分片键精确条件 → 定位单 / 多分片
             ├─ WHERE 有分片键范围条件 → 范围分片
             └─ 都没有 → 广播（fan-out 到所有分片）
```

内置 6 种分片算法：

| 算法 | 适用 | 行为 |
|---|---|---|
| `hash_mod` | 均匀打散 | `hash(value) % count` |
| `inline` | 表达式分片 | 配置表达式 `t_user_${id % 4}` 渲染 |
| `tenant` | 租户路由 | 直接以 `tenant_id` 当目标 key |
| `time_range` | 时间归档 | 按月 / 日切，自动过滤近 N 个月 |
| `hash_range` | 哈希区间 | hash 落点范围匹配 |
| `complex` | 复合算法 | 多列组合参与分片 |

跨分片查询由 `ScatterGatherExecutor` 并行发到各数据源，`DefaultResultMerger` 负责 LIMIT / ORDER BY 的合并。

## 配置示例

```toml
[summer-sharding]
enabled = true

# 数据源（可配多个，各自独立连接池）
[summer-sharding.datasources.ds_main]
uri = "postgres://user:pass@localhost:5432/main"
schema = "public"
role = "primary"

# 租户配置
[summer-sharding.tenant]
enabled = true
default_isolation = "shared_row"
shared_tables = ["sys_dict", "sys_config"]   # 跨租户共享的表
tenant_id_source = "request_extension"
tenant_id_field = "x-tenant-id"

[summer-sharding.tenant.row_level]
column_name = "tenant_id"
strategy = "sql_rewrite"

# 分片规则：按 tenant_id 哈希取模分 4 张表
[[summer-sharding.sharding.tables]]
logic_table = "ai.request"
actual_tables = ["ai.request_0", "ai.request_1", "ai.request_2", "ai.request_3"]
sharding_column = "tenant_id"
algorithm = "hash_mod"
  [summer-sharding.sharding.tables.algorithm_props]
  count = 4
```

## 业务插件模式

这套插件机制最初就是为了「以后加数据权限不用改库代码」而设计的。这类插件与具体业务强相关（列名约定、用户上下文模型、部门树结构），所以库**不内置**，由业务方实现。几个常见模式：

**乐观锁（order≈50）**：UPDATE 自动加 `version` 字段。

```sql
-- 原 SQL
UPDATE user SET nick_name = 'foo' WHERE id = 1
-- 改写后
UPDATE user SET nick_name = 'foo', version = version + 1
WHERE id = 1 AND version = <ctx 中传入的旧 version>
```

**审计字段自动填充（order≈60）**：INSERT 填 `create_time` / `create_by`，UPDATE 填 `update_time` / `update_by`，数据从 `ctx.extension::<CurrentUser>()` 读取（需 web 中间件先注入）。

**数据权限（order≈70）**：从 `ctx.extension::<DataScope>()` 读取当前用户的可见范围，注入相应的 WHERE 条件：

```rust
pub enum DataScope {
    Self_,            // creator_id = current_user_id
    Dept,             // dept_id = current_user.dept_id
    DeptAndChildren,  // dept_id IN (子树)
    Custom(Vec<i64>), // dept_id IN (...)
    All,              // 不加条件
}
```

这正是设计之初设想的场景——「只看本人 / 本部门 / 部门加子部门」。`DeptAndChildren` 的子树查询结果建议在中间件层缓存，而不是每条 SQL 都查一次数据库。

## 小结

整套设计的关键决策串起来就是：

1. **显式优于隐式** —— 不用 `task_local`，而是把租户连接作为参数显式传递。
2. **从 SeaORM 的执行 trait 切入** —— `ShardingConnection` 实现 `ConnectionTrait`，无缝接入现有查询代码。
3. **AST 改写优于字符串拼接** —— sqlparser 解析后用 AST API 重写，避免字符串出错。
4. **trait 抽象换扩展性** —— 改写能力做成 `SqlRewritePlugin`，新需求实现 trait 即可，不动中间件。
