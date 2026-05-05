---
title: 概述
description: Summerrs Admin 是什么、它的定位、为什么把这些能力装进同一个二进制。
published_at: 2026-05-04 10:00:00
---

# Summerrs Admin 是什么

`summerrs-admin` 是一套**完全用 Rust 写**的生产级后台管理系统,构建在 [Summer 框架](https://github.com/ouywm/spring-rs)(Spring 风格的 Rust 应用骨架) 之上。它把通常分布在多个项目里的能力——身份鉴权、多租户、AI 网关、消息推送、对象存储、声明式审计——以**插件组合**的形式集成到**一个二进制**中,开箱即用、按需启用。

它不是一个 demo,也不是某个独立组件的展示——它是一个**完整、自洽、可部署**的后台底座。

## 与同类项目的差异

市面上的后台框架要么是 **业务后台(CRUD 脚手架)**,要么是 **AI 网关**,要么是 **分片中间件**,但很少把这些能力放在同一个工程里。`summerrs-admin` 把四件事拧到了一起:

| 能力 | 通常情况 | 本项目 |
|---|---|---|
| **LLM 中转网关** | 单独项目 (one-api / new-api / AxonHub) | 内嵌为 `summer-ai` crate,与后台共用鉴权、计费、审计 |
| **数据库分片** | 接 ShardingSphere / Vitess 等独立中间件 | `summer-sharding` 在 SQL 层透明改写,业务代码无感 |
| **MCP 服务** | 单独的 MCP server 进程 | `summer-mcp` 直接和业务 schema 联动,AI 助手可生成 CRUD |
| **声明式审计与限流** | 中间件 + 手写代码 | `#[login]` `#[has_perm]` `#[rate_limit]` `#[log]` 单行宏搞定 |

不是每个项目都需要全部这些能力,但当你需要其中任意两个时,**把它们装在同一个进程里能省一整层运维**。

## 项目里现成可用的能力

打开仓库就能看到这些已经实现的能力:

- **系统域后台 API** —— 认证、用户、角色、菜单、字典、配置、文件、通知、日志、监控
- **嵌入式 MCP Server** —— 库表发现、表级 CRUD、SQL 工具、后端代码生成、前端代码生成、菜单与字典业务工具
- **AI 相关模块** —— OpenAI / Claude / Gemini 兼容入口、AI 管理后台、6 维路由、三阶段计费、平台与治理模型
- **多租户与底层基础设施** —— 租户元数据、SQL 改写、路由隔离、四级隔离模式、CDC 管道、加密 / 脱敏 / 审计
- **运行时插件** —— Socket.IO 网关、IP2Region 地理定位、S3 兼容存储、后台任务队列、批量日志写入、动态定时任务

## 技术栈速览

| 层 | 选型 |
|---|---|
| 语言 | **Rust 1.93+ / Edition 2024** |
| 框架 | [Summer 0.5](https://github.com/ouywm/spring-rs) (Spring 风格的 Rust 应用骨架) |
| HTTP | Axum + Tower + tower-http |
| ORM | SeaORM 2.0 (定制 fork,支持租户 SQL 改写) |
| 主存储 | PostgreSQL 17+ |
| 缓存 / 会话 | Redis 7+ |
| 对象存储 | AWS S3 / MinIO / RustFS (S3 兼容) |
| MCP 协议 | [rmcp](https://github.com/modelcontextprotocol/rust-sdk) (Rust 官方 SDK) |
| AI Agent | [rig-core](https://github.com/0xPlaygrounds/rig) |

## 阅读路线

- 想先跑起来 → [安装环境](./installation) → [Docker 一键启动](./docker) → [首次启动](./first-run) → [默认账号](./default-account)
- 想搞清楚架构 → [整体架构](../architecture/overview) → [17 个插件](../architecture/plugins) → [项目结构](../architecture/directory)
- 想看核心机制 → [认证授权](../core/auth) / [多租户](../core/multi-tenancy) / [AI 网关](../core/ai-gateway) / [MCP](../core/mcp) / [限流](../core/rate-limit)
- 想看 API 入口 → [API 概览](/api/)

## 核心仓库链接

- 后端工作区:<https://github.com/ouywm/summerrs-admin>
- 框架(Summer / spring-rs):<https://github.com/ouywm/spring-rs>
- 文档站本身:<https://github.com/ouywm/summer-admin-site>
