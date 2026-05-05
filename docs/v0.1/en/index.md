---
pageType: home
description: Summerrs Admin — Full-stack Rust admin system with LLM gateway, sharding, multi-tenancy, MCP, and declarative macros built in.
link-rss: updates

hero:
  name: Summerrs Admin
  text: Full-stack Rust Admin Platform
  tagline: LLM gateway, multi-tenant sharding, MCP tools, and declarative audit — all in one Rust binary
  actions:
    - theme: brand
      text: Get Started in 5 min
      link: /en/guide/start/overview
    - theme: alt
      text: Architecture
      link: /en/guide/architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/ouywm/summerrs-admin
  image:
    src: /logo-dark.png
    alt: Summerrs Admin
features:
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
    title: 17 Plugins, One Binary
    details: 'Web / SeaOrm / Redis / Sharding / SQL rewrite / Job / Mail / Auth / S3 / MCP / AI Relay — all wired in app/src/main.rs, opt-in per env.'
    link: /en/guide/architecture/plugins
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
    title: Declarative Auth
    details: '#[login] / #[has_perm] / #[has_role] / #[rate_limit] / #[log] — single-line attribute macros that expand into extractors at compile time.'
    link: /en/guide/core/auth
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>'
    title: 3-Protocol AI Gateway
    details: 'Native OpenAI / Claude / Gemini endpoints. 40+ upstreams, 6-dimension routing, 3-stage billing, hot-reload from DB.'
    link: /en/guide/core/ai-gateway
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>'
    title: Embedded MCP
    details: 'Schema discovery, generic table CRUD, SQL escape hatches, entity / admin / frontend code generators — ready for AI assistants out of the box.'
    link: /en/guide/core/mcp
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>'
    title: 4-Level Multi-tenancy
    details: 'shared_row / separate_table / separate_schema / separate_database. Transparent SQL rewriting, zero changes to business code.'
    link: /en/guide/core/multi-tenancy
  - icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 12l3-3 4 4 5-5"/></svg>'
    title: Five Rate-limit Algorithms
    details: 'GCRA / token bucket / leaky bucket / throttle queue / fixed window / sliding window — memory and Redis backends.'
    link: /en/guide/core/rate-limit
---
