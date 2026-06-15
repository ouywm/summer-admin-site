---
title: 安装与依赖
description: 开发与运行 Summerrs Admin 需要的工具链、外部依赖、环境变量。
published_at: 2026-05-04 10:10:00
---

# 安装与依赖

## 前置工具链

| 工具 | 推荐版本 | 用途 |
|---|---|---|
| Rust | **1.93+** (Edition 2024) | 编译后端 |
| PostgreSQL | **17+** | 主存储 |
| Redis | **7+** | 会话 / 缓存 / 限流后端 |
| S3 兼容存储 | MinIO / RustFS / AWS S3 | 文件上传 |
| Docker + Compose | 可选 | 一键启动整套环境 |

> 当前 `Cargo.toml` 锁定 `edition = "2024"`,Rust 工具链需要 1.93 及以上。

## 第一步:克隆代码

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin
```

## 第二步:准备外部依赖

如果你**用 Docker**,跳到下一页 [Docker 一键启动](./docker) 即可,会自动启动所有依赖。

如果你**不用 Docker**,需要确保本机有可用的:
- PostgreSQL 17+
- Redis 7+
- S3 兼容存储 (MinIO / RustFS / AWS S3)

> **提示**:数据库会在首次启动时通过 SeaORM 自动初始化,无需手动执行 SQL。

## 第三步:配置环境变量

仓库根目录有一份 `.env` 文件示例,核心变量如下:

```bash
# 数据库连接
DATABASE_URL=postgres://admin:123456@localhost/summerrs-admin

# JWT 签名密钥
JWT_SECRET="生产环境请用 openssl rand -base64 32 生成"

# 日志级别
RUST_LOG=debug

# S3 / MinIO / RustFS
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=请填
S3_SECRET_KEY=请填
```

> ⚠️ **安全提示**:`.env` 已在 `.gitignore` 中,不要把生产密钥提交到仓库。

## 第四步:运行项目

```bash
# 直接运行(会自动编译)
cargo run --bin app
```

项目会在首次启动时自动完成数据库初始化。启动后访问 `http://localhost:3000` 即可。

## 常见问题

**编译报 `summer` / `summer-web` 找不到?**
仓库 `Cargo.toml` 末尾有 `[patch.crates-io]` 段,从 GitHub 拉特定 commit 的 fork。第一次编译会自动 clone,网络受限时建议配置 Cargo 的 `[source.crates-io]` 镜像或 GitHub 代理。

