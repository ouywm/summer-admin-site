---
description: 启动服务后依次验证 OpenAPI、认证接口、受保护接口与嵌入式 MCP 路径。
published_at: 2026-04-26 09:30:00
---

# 启动后验证

当 `cargo run -p app` 已经跑起来后，建议按下面的顺序做验证。这样能最快确认“服务活着、认证可用、MCP 路径已挂载”这三件事。

## 1. 先打开 OpenAPI

浏览器访问：

```text
http://localhost:8080/api/docs
```

如果页面能打开，至少说明下面这些基础链路已经通了：

- Web 服务已经监听在 `8080`
- `config/app-dev.toml` 中的 API 全局前缀 `/api` 已生效
- OpenAPI 文档路由已经被主应用挂载

## 2. 验证登录接口

认证接口路由定义在 `crates/summer-system/src/router/auth.rs`，实际入口是：

```text
POST /api/auth/login
```

可以直接用默认测试账号发一条请求：

```bash
curl -X POST 'http://localhost:8080/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "userName": "Admin",
    "password": "123456"
  }'
```

如果请求成功，返回体里会直接包含：

- `accessToken`
- `refreshToken`
- `expiresIn`

## 3. 带上 access token 访问受保护接口

拿到 token 后，再去调用系统域里的一个鉴权接口，最直接的是：

```text
GET /api/user/info
```

示例：

```bash
curl 'http://localhost:8080/api/user/info' \
  -H 'Authorization: Bearer <your-access-token>'
```

这一步主要是验证：

- JWT 发放与解析链路正常
- `summer-auth` 的鉴权中间件生效
- 当前数据库里的用户、角色和权限基础数据已经能被读取

## 4. 确认嵌入式 MCP 路径

当前开发配置里，MCP 采用 embedded HTTP 模式，组合后的默认访问路径是：

```text
http://localhost:8080/api/mcp
```

这里和 OpenAPI 不一样，它不是拿来直接在浏览器里浏览页面的，而是给 MCP 客户端接入使用的。你可以把这一步理解为：

- 主应用已经把 `summer-mcp` 一起挂进来
- 后面无论是走嵌入式 MCP，还是切换成 standalone 模式，文档里提到的那些表工具和生成工具都来自同一套 crate

如果你准备单独验证 MCP，也可以直接运行：

```bash
cargo run -p summer-mcp --features standalone --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin'
```

默认 standalone 模式会监听：

```text
http://127.0.0.1:9090/mcp
```

## 5. 可选：验证 AI 兼容入口

主应用里已经挂载了 `SummerAiRelayPlugin`，仓库中也能看到 OpenAI 兼容入口，例如：

```text
POST /v1/chat/completions
```

但这条路径通常还依赖：

- `ai` schema 相关表已经初始化
- 至少有一组可用的 channel / account / key 等运行时数据

所以首版文档不把它作为“后台启动成功”的硬性检查项。更稳妥的顺序是先把系统域与 MCP 路径验证完，再继续验证 AI 路由。

## 6. 常见卡点

- OpenAPI 打不开：先检查 `config/app-dev.toml` 的 `[web]` 和 `[web.openapi]` 配置，再看应用是否真的监听在 `8080`
- 登录失败且数据库报错：优先确认 `sql/sys/*.sql` 是否已经导入，尤其是 `user.sql`、`role.sql`、`user_role.sql`
- 一启动就报对象存储错误：检查 `S3_ACCESS_KEY`、`S3_SECRET_KEY` 是否已设置，以及 `http://localhost:9000` 是否可连
- MCP 客户端连不上：先区分你使用的是嵌入式路径 `/api/mcp`，还是 standalone 的 `:9090/mcp`

接下来建议继续看 [模块概览](/guide/start/module-overview)。
