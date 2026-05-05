---
pageType: home
description: Summerrs Admin —— 全栈 Rust 后台管理系统，内置 LLM 中转网关、数据库分片、多租户隔离、MCP 服务、声明式宏。
link-rss: updates

hero:
  name: Summerrs Admin
  text: 全栈 Rust 后台管理系统
  tagline: 把 LLM 网关、多租户分片、MCP 工具、声明式审计装进同一个 Rust 二进制
  actions:
    - theme: brand
      text: 5 分钟跑起来
      link: /guide/start/overview
    - theme: alt
      text: 架构总览
      link: /guide/architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/ouywm/summerrs-admin
  image:
    src: /logo-dark.png
    alt: Summerrs Admin
features:
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
    title: 单二进制 17 插件
    details: WebPlugin / SeaOrm / Redis / 分片 / SQL 改写 / Job / Mail / Auth / S3 / MCP / AI Relay 全部装进 app/src/main.rs，按需启停
    link: /guide/architecture/plugins
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
    title: 声明式鉴权
    details: '#[login] / #[has_perm] / #[has_role] / #[rate_limit] / #[log] —— 单行属性宏，编译期生成 extractor'
    link: /guide/core/auth
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>'
    title: 三协议 AI 网关
    details: OpenAI / Claude / Gemini 原生兼容入口，40+ 上游、6 维路由、三阶段计费、数据库热更新
    link: /guide/core/ai-gateway
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'
    title: 嵌入式 MCP
    details: 库表发现、CRUD 工具、SQL 逃生口、Entity / Admin 模块 / 前端代码生成器，AI 助手开箱可用
    link: /guide/core/mcp
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>'
    title: 四级多租户
    details: shared_row / separate_table / separate_schema / separate_database，SQL 层透明改写，业务代码无感
    link: /guide/core/multi-tenancy
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 12l3-3 4 4 5-5"/></svg>'
    title: 五种限流算法
    details: GCRA / 令牌桶 / 漏桶 / 排队漏桶 / 固定窗口 / 滑动窗口，内存与 Redis 双后端
    link: /guide/core/rate-limit
---
