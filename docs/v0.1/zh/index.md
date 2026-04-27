---
pageType: home
description: 面向本地开发者的 Summerrs Admin 文档站首页，重点提供快速开始、验证路径与模块导航。
link-rss: updates

hero:
  name: Summerrs Admin
  text: Rust 后台管理与开发支撑平台
  tagline: v0.1 开发版本。基于 Summer 生态构建的多 crate 工作区，当前已集成系统后台接口、OpenAPI、嵌入式 MCP Server，以及 AI Relay、多租户与 SQL 重写扩展能力。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/start/getting-started
    - theme: alt
      text: 项目介绍
      link: /guide/start/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/ouywm/summerrs-admin
  image:
    src: /logo-dark.png
    alt: Summerrs Admin
features:
  - title: 先跑通后台服务
    details: 文档优先覆盖本地开发者最关心的路径：准备依赖、初始化 SQL、启动服务、验证 OpenAPI 与 MCP 入口。
    link: /guide/start/getting-started
  - title: 系统后台基础能力
    details: 工作区已包含认证、用户、角色、菜单、字典、配置、文件、日志、通知与监控等系统域接口。
    link: /guide/start/introduction
  - title: 嵌入式 MCP Server
    details: summer-mcp 可随主应用一起暴露在 /api/mcp，也支持 standalone 方式独立运行，提供表工具与代码生成能力。
    link: /guide/start/verify-after-start
  - title: AI Relay 与管理能力
    details: 工作区同时包含 OpenAI 兼容入口、AI 后台管理接口、路由与计费相关模块，适合继续扩展 AI 控制面。
    link: /guide/start/module-overview
  - title: 多租户与 SQL 重写
    details: summer-sharding、summer-sql-rewrite 与 tenant schema 为租户隔离、行级注入与后续分片能力提供基础设施。
    link: /guide/start/module-overview
  - title: 面向二次开发的工作区
    details: 从 crates、config 到 sql 目录，文档会先帮助你建立工作区心智模型，再继续深入具体模块。
    link: /guide/start/module-overview
---
