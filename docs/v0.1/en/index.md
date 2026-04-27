---
pageType: home
description: "Developer home page for Summerrs Admin, focused on capability map, quick start, and validation paths."
link-rss: updates

hero:
  name: "Summerrs Admin"
  text: "Rust admin backend and developer platform"
  tagline: "v0.1 development version. A multi-crate workspace built on the Summer ecosystem, already integrating system admin APIs, OpenAPI, embedded MCP Server, AI Relay, multi-tenant support, and SQL rewrite extensions."
  actions:
    - theme: brand
      text: "Quick Start"
      link: /en/guide/start/getting-started
    - theme: alt
      text: "Introduction"
      link: /en/guide/start/introduction
    - theme: alt
      text: "GitHub"
      link: https://github.com/ouywm/summerrs-admin
  image:
    src: /logo-dark.png
    alt: "Summerrs Admin"
features:
  - title: "Start the backend first"
    details: "The docs focus on the shortest local path that developers care about most: prepare dependencies, initialize SQL, boot the app, and verify OpenAPI and MCP endpoints."
    link: /en/guide/start/getting-started
  - title: "System admin foundations"
    details: "The workspace already includes auth, users, roles, menus, dictionaries, configuration, files, logs, notifications, and monitoring APIs."
    link: /en/guide/start/introduction
  - title: "Embedded MCP Server"
    details: "summer-mcp can be exposed together with the main app at /api/mcp, or run in standalone mode for table tools and code generation workflows."
    link: /en/guide/start/verify-after-start
  - title: "AI Relay and admin modules"
    details: "The workspace also includes an OpenAI-compatible gateway, AI admin APIs, routing, and billing-related modules for extending an AI control plane."
    link: /en/guide/start/module-overview
  - title: "Multi-tenant and SQL rewrite"
    details: "summer-sharding, summer-sql-rewrite, and tenant schemas provide the foundation for tenant isolation, row-level injection, and future sharding strategies."
    link: /en/guide/start/module-overview
  - title: "A workspace for secondary development"
    details: "From crates and config to SQL directories, the docs first help you build a mental model of the workspace before going deeper into individual modules."
    link: /en/guide/start/module-overview
---
