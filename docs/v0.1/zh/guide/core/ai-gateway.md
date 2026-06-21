---
title: AI 网关接入
description: 介绍 AI 管理后台、模型渠道、API Key、限流计费、请求日志、MCP 工具和 relay 协议入口的推荐边界。
published_at: 2026-05-04 12:20:00
---

# AI 网关接入

Summerrs Admin 可以作为 AI 网关的管理后台底座:用系统的登录认证、RBAC、菜单按钮、资源权限、字典、操作日志和 MCP 工具来承载 AI 渠道、模型、API Key、用量、审计和运维能力。

AI 网关通常由两部分组成:

| 部分 | 面向对象 | 典型职责 |
|---|---|---|
| AI 管理后台 | 管理员、运营、开发人员 | 管理渠道、模型、API Key、配额、路由、日志和告警 |
| AI relay | 应用程序、外部调用方、Agent | 接收 OpenAI/Claude/Gemini 等协议请求,鉴权后转发到上游模型 |

后台管理接口适合放进 `/api` 体系,复用管理员 JWT、按钮权限、资源权限和 `ApiResult` 响应。relay 协议入口建议作为独立路由组接入,例如 `/v1/chat/completions`、`/v1/messages`、`/v1beta/models/*`,并使用 API Key、模型路由、流式响应和专用错误模型。

## 可以复用的后台能力

AI 网关管理侧可以直接复用 Summerrs Admin 的基础能力:

| 能力 | 用途 |
|---|---|
| 登录认证 | 管理员通过 JWT 登录后台,管理 AI 资源 |
| RBAC | 用 `ai:*` 权限控制渠道、模型、Key、日志等操作 |
| 后端资源权限 | 将 AI 管理 API 登记到 `sys.resource`,再绑定按钮权限 |
| 操作日志 | 管理动作通过 `#[log]` 写入 `sys.operation_log` |
| 字典 | 管理模型状态、渠道类型、计费单位、日志状态等枚举 |
| 菜单 | 在后台侧增加 AI 管理页面和按钮 |
| 限流 | 对管理接口或 relay 请求按用户、Header、API Key 进行保护 |
| MCP | 让 AI 助手读取 schema、生成 CRUD、规划菜单和字典 |

这意味着 AI 模块可以专注在模型网关自身的领域能力上,后台通用能力继续沿用系统已有机制。

## 推荐模块边界

AI 管理后台和 relay 协议入口的鉴权方式、错误格式和响应类型不同,推荐拆成清晰的模块:

```text
crates/
  summer-ai-core/        # 协议类型、错误模型、共享 trait
  summer-ai-admin/       # /api/ai/* 管理后台接口
  summer-ai-relay/       # /v1/* 协议入口和上游转发
  summer-ai-model/       # SeaORM 实体、DTO、VO
  summer-ai-billing/     # 配额、计费、request log
```

主应用可以同时注册管理侧和 relay 侧:

```rust
app.add_plugin(SummerAuthPlugin)
   .add_plugin(ResourcePermissionPlugin)
   .add_plugin(AiAdminPlugin)
   .add_plugin(AiRelayPlugin);
```

两类入口建议分开设计:

| 入口 | 鉴权方式 | 路径 | 响应风格 |
|---|---|---|---|
| AI 管理后台 | 管理员 JWT + RBAC | `/api/ai/*` | `ApiResult` / JSON |
| OpenAI 兼容 relay | API Key | `/v1/chat/completions` 等 | OpenAI 风格错误 JSON/SSE |
| Claude 兼容 relay | API Key | `/v1/messages` | Anthropic 风格错误 JSON/SSE |
| Gemini 兼容 relay | API Key 或 query key | `/v1beta/models/*` | Gemini 风格错误 JSON |

这样可以避免把管理员登录态、按钮权限、API Key、流式响应和第三方协议错误模型混在一条链路里。

## 管理后台功能

AI 管理后台通常包含这些页面:

| 页面 | 能力 |
|---|---|
| 渠道管理 | 配置 OpenAI、Claude、Gemini、自建模型等上游渠道 |
| 模型管理 | 维护模型名称、上游映射、上下文长度、价格和能力标签 |
| API Key 管理 | 创建、禁用、轮换、过期、绑定调用方和配额 |
| 路由规则 | 按模型、租户、Key、权重、优先级或健康状态选择上游 |
| 用量统计 | 查看请求数、token、费用、延迟、成功率 |
| 请求日志 | 检索 request id、调用方、模型、状态、错误摘要 |
| 告警配置 | 对错误率、余额、渠道不可用等事件发出提醒 |

后台接口可以沿用系统路由风格:

```rust
#[log(module = "AI 渠道", action = "创建渠道", biz_type = Create)]
#[has_perm("ai:channel:create")]
#[post_api("/ai/channel")]
pub async fn create_channel(...) -> ApiResult<()> {
    // ...
}
```

菜单按钮可以按业务对象组织:

```text
ai:channel:list
ai:channel:create
ai:channel:update
ai:channel:delete
ai:model:list
ai:model:update
ai:token:list
ai:token:create
ai:token:disable
ai:request-log:list
ai:usage:list
```

如果希望资源权限层也生效,需要把 AI 管理 API 登记到 `sys.resource`,再通过 `sys.action_resource` 绑定到对应 Button。策略更新可以调用:

```http
POST /api/system/resource-permission/reload
```

## API Key 鉴权

relay 面向程序调用,建议使用独立 API Key,不要复用管理员 JWT。

常见请求格式:

```http
Authorization: Bearer sk-xxxx
```

API Key 至少需要包含这些信息:

| 字段 | 说明 |
|---|---|
| token hash | 只保存 hash,避免明文 Key 落库 |
| owner | 所属用户、租户或应用 |
| enabled | 是否启用 |
| quota | 调用次数、token 或金额配额 |
| allowed models | 可调用的模型范围 |
| rate limit | Key 级限流策略 |
| expires_at | 过期时间 |
| last_used_at | 最近使用时间 |

鉴权流程可以设计为:

```text
解析 Authorization -> hash 查 Key -> 校验启用/过期/模型范围 -> 计算限流和配额 -> 注入调用上下文
```

管理后台展示 Key 时只显示前后缀,创建后只返回一次明文,后续通过轮换机制替换。

## 模型路由

模型路由负责把客户端请求的模型映射到真实上游:

```text
client model: gpt-4o-mini
        |
        v
routing rule: openai-primary 80%, openai-backup 20%
        |
        v
upstream model: gpt-4o-mini / gpt-4.1-mini / custom alias
```

常见路由维度:

| 维度 | 用途 |
|---|---|
| 模型别名 | 对外暴露稳定模型名,内部可切换上游 |
| 权重 | 多渠道按比例分流 |
| 优先级 | 主备切换 |
| 健康状态 | 跳过不可用渠道 |
| 租户或 Key | 给不同客户配置不同渠道 |
| 成本策略 | 优先低价模型,必要时升级 |

路由结果建议写入请求日志,方便排查“客户端请求的是哪个模型,最终打到了哪个上游”。

## 流式响应

LLM relay 经常返回 SSE 或 chunked body。流式响应和普通后台 JSON 有几个差异:

| 差异 | 处理建议 |
|---|---|
| usage 可能在结尾才出现 | 结束时补写 request log |
| 上游可能中途断开 | 记录 canceled 或 upstream_error |
| 已经返回 200 后仍可能失败 | 用流内错误事件表达,日志记录最终状态 |
| 响应体可能很大 | 不把完整响应写入操作日志 |

管理动作继续使用 `#[log]`; relay 请求建议写入专门的 AI request log,例如:

| 字段 | 说明 |
|---|---|
| request_id | 链路 ID |
| protocol | openai / claude / gemini |
| endpoint | chat_completions / messages 等 |
| client_model | 客户端请求模型 |
| upstream_model | 实际上游模型 |
| token_id | 调用方 API Key |
| status | success / error / canceled |
| prompt_tokens / completion_tokens | usage |
| latency_ms | 总耗时 |
| error_detail | 错误摘要 |

这样既能保留后台操作审计,也能满足 relay 的高频、流式、计费型日志需求。

## 限流与配额

`summer-common::rate_limit` 提供 `#[rate_limit]`、`RateLimitEngine` 和 cost-based 限流能力。管理接口可以使用声明式限流,relay 更适合按 API Key 和 token 成本做控制。

对 LLM 请求,推荐在真正调用上游前预扣额度:

```rust
let reservation = rate_limit_ctx
    .reserve(&token_key, config, estimated_tokens, "请求过于频繁")
    .await?;

// 上游成功后按真实 usage commit;失败或估算过高时 release/refund。
```

常见策略:

| 策略 | 说明 |
|---|---|
| Key 级 QPS | 防止单个 Key 打爆服务 |
| 模型级并发 | 保护昂贵模型或低并发上游 |
| token 预扣 | 适合按 token 配额控制 |
| 租户总额 | 多个 Key 共享租户级额度 |
| 渠道熔断 | 上游异常时自动降级或切换 |

如果 API Key 放在 `Authorization` 中,可以先由 relay 鉴权层解析 Key,再用解析后的 token 标识调用 `RateLimitContext`。

## 与 MCP 的关系

MCP 和 AI relay 解决的是不同问题:

| 能力 | 面向对象 | 作用 |
|---|---|---|
| `summer-mcp` | AI 助手、开发工具、运维工具 | 读取 schema、调用表工具、生成代码、管理菜单/字典 |
| AI relay | 应用程序、Agent、外部客户端 | 接收模型请求并转发到 OpenAI/Claude/Gemini 等上游 |

MCP 可以帮助开发 AI 管理模块,例如生成 Entity、CRUD、前端 bundle,再用 `menu_tool` 和 `dict_tool` 规划菜单/字典。relay 则负责线上模型调用链路、API Key、配额、路由、日志和流式响应。

```mermaid
flowchart LR
    A[AI 助手 / 开发工具] --> B[summer-mcp]
    B --> C[数据库 schema / CRUD / 代码生成]
    D[应用程序 / Agent] --> E[AI relay]
    E --> F[OpenAI / Claude / Gemini / 自建模型]
    G[Admin UI] --> H[/api/ai/* 管理接口]
    H --> I[JWT / RBAC / 资源权限]
```

## 接入清单

可以按这个顺序推进 AI 网关模块:

1. 定义 AI 领域模型:渠道、模型、API Key、路由规则、请求日志、用量统计。
2. 创建后台菜单和按钮权限,统一使用 `ai:*` 权限码。
3. 接入管理接口,使用 `#[log]`、`#[has_perm]` 和资源权限绑定。
4. 设计 API Key 鉴权链路,只保存 hash,创建后只展示一次明文。
5. 实现模型路由,把客户端模型映射到真实上游渠道。
6. 接入限流和配额,对 Key、租户、模型和 token 成本分别保护。
7. 为流式响应建立专门 request log,记录最终状态和 usage。
8. 使用 MCP 生成或校验 CRUD、菜单、字典和前端页面草稿。

这样可以让 AI 网关既融入后台管理体系,又保持 relay 协议入口的独立性。
