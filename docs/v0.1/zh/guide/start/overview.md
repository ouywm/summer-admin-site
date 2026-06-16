---
title: 概述
description: Summerrs Admin 是什么、它的定位、为什么把这些能力装进同一个二进制。
published_at: 2026-05-04 10:00:00
---

# Summerrs Admin 是什么

`summerrs-admin` 是一套**完全用 Rust 写**的生产级后台管理系统,它将身份鉴权、多租户、AI 网关、消息推送、对象存储、声明式审计等能力以**插件组合**的形式集成,开箱即用、按需启用。

它不是一个 demo,也不是某个独立组件的展示——它是一个**完整、自洽、可部署**的后台底座。

## 技术栈速览

| 层 | 选型 |
|---|---|
| 语言 | **Rust 1.93+ / Edition 2024** |
| HTTP | Axum
| ORM | SeaORM 2.0|
| 主存储 | PostgreSQL 17+ |
| 缓存 / 会话 | Redis 7+ |
| 对象存储 | AWS S3 / MinIO / RustFS (S3 兼容) |
| MCP 协议 | [rmcp](https://github.com/modelcontextprotocol/rust-sdk) |
| AI Agent | [rig](https://github.com/0xPlaygrounds/rig) |

## 阅读路线

- 想先跑起来 → [快速开始](./quick-start)
- 想搞清楚架构 → [项目结构](../architecture/directory) → [17 个插件](../architecture/plugins)
- 想看核心机制 → [认证授权](../core/auth) / [多租户](../core/multi-tenancy) / [AI 网关](../core/ai-gateway) / [MCP](../core/mcp) / [限流](../core/rate-limit)
- 想看 API 入口 → [API 概览](/api/)

## 核心仓库链接

- 后端:<https://github.com/ouywm/summerrs-admin>
- 前端:<https://github.com/ouywm/art-design-pro>
- 文档站本身:<https://github.com/ouywm/summer-admin-site>
