---
description: 认识 Summerrs Admin 的仓库定位、已落地能力和首版文档阅读顺序。
published_at: 2026-04-26 09:00:00
---

# 项目介绍

`Summerrs Admin` 是一个基于 Rust 和 Summer 生态构建的多 crate 工作区。它不是单一的“后台模板”，而是把后台系统接口、MCP Server、AI Relay、多租户与 SQL 重写能力放在同一个仓库里，方便在同一套基础设施上持续演进。

当前仓库里已经能直接看到几类核心能力：

- 系统域后台接口：认证、用户、角色、菜单、字典、配置、文件、通知、日志、监控
- 嵌入式 MCP Server：库表发现、表级 CRUD、SQL 工具、后端/前端代码生成、菜单与字典业务工具
- AI 相关模块：OpenAI 兼容入口、AI 管理接口、路由、计费、平台与治理模型
- 多租户与底层基础设施：租户元数据、SQL 重写、路由隔离、分片与扩展插件

## 这份首版文档面向谁

首版文档默认服务两类需求中的第一类，并优先照顾它：

- 想把 `summerrs-admin` 主仓库在本地跑起来，并继续开发这个工作区的人
- 想先理解仓库入口、配置文件和 SQL 布局，再决定从哪个模块切入的人

## 当前文档的重点

这一版先解决“如何上手”，不追求一次性覆盖全部模块细节：

- 先说明本地启动一套开发环境至少需要哪些依赖
- 先跑通主应用 `cargo run -p app`
- 启动后优先验证 OpenAPI、认证接口和嵌入式 MCP 路径
- 再用一页把工作区模块边界说明白，方便继续深入

:::tip
当前仓库主要是后端工作区。虽然 `sql/sys/menu_data_all.sql` 中包含了菜单与前端组件路由约定，但完整前端工程并不在这个仓库里，所以首版文档会把验证重点放在 API、OpenAPI 与 MCP 上。
:::

## 你会先接触到的几个入口

- `crates/app`：主应用入口，负责把 system、mcp、ai、auth、redis、s3 等插件组装起来
- `config/app-dev.toml`：开发环境基线配置，端口、数据库、Redis、S3、MCP 路径都能在这里找到
- `sql/`：数据库结构的 source of truth，按 `sys`、`tenant`、`ai` 等业务域分目录维护
- `docs/`：仓库内部已有的设计说明和调研文档，适合进一步理解某个子模块

## 建议的阅读顺序

1. 先看 [快速开始](/guide/start/getting-started)，把服务跑起来
2. 再看 [启动后验证](/guide/start/verify-after-start)，确认 OpenAPI、登录接口和 MCP 路径都通了
3. 最后看 [模块概览](/guide/start/module-overview)，建立对整个工作区的整体认知
