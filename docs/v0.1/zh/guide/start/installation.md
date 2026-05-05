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
| Cargo | 随 Rust 安装 | 包管理 |
| PostgreSQL | **17+** | 主存储 |
| Redis | **7+** | 会话 / 缓存 / 限流后端 |
| S3 兼容存储 | MinIO / RustFS / AWS S3 | 文件上传 |
| Docker + Compose | 可选 | 一键启动整套环境 |

> 当前 `Cargo.toml` 锁定 `edition = "2024"`,Rust 工具链需要 1.93 及以上。

```bash
# macOS / Linux 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable
rustup component add rustfmt clippy

# 验证版本
rustc --version  # rustc 1.93+
```

## 第一步:克隆代码

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin
```

## 第二步:准备外部依赖

如果你**不用 Docker**,需要本机有可用的 PostgreSQL 17 + Redis 7 + 一个 S3 兼容存储。

```bash
# macOS via Homebrew
brew install postgresql@17 redis
brew services start postgresql@17
brew services start redis

# Ubuntu / Debian
sudo apt install postgresql-17 redis-server
sudo systemctl start postgresql redis-server

# 创建数据库
createdb -U admin summerrs-admin
```

如果你**用 Docker**,跳到下一页 [Docker 一键启动](./docker) 即可。

## 第三步:配置环境变量

仓库根目录有一份 `.env` 文件示例,核心变量如下:

```bash
# 数据库连接(注意:URL 里编码了 TimeZone=Asia/Shanghai)
DATABASE_URL=postgres://admin:123456@localhost/summerrs-admin?options=-c%20TimeZone%3DAsia%2FShanghai

# MCP 用同一份(独立 standalone 模式时可单独指)
SUMMER_MCP_DATABASE_URL=${DATABASE_URL}

# Postgres 密码(docker-compose 必填)
POSTGRES_PASSWORD=请改成你自己的强密码

# JWT 签名密钥(生产必须改;HS256 默认算法)
JWT_SECRET="生产环境请用强随机字符串,建议 64+ 字符"

# 日志级别
RUST_LOG=debug

# S3 / MinIO / RustFS
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=请填
S3_SECRET_KEY=请填

# AI Agent 入口(可选;summer-ai-agent 用)
BASE_URL=http://localhost:8080/v1
TOKEN=sk-test
```

> ⚠️ **安全提示**:`.env` 已在 `.gitignore` 中,不要把生产密钥提交到仓库。`config/app.toml` 里的 `${VAR:default}` 语法是 Summer 的环境变量插值,缺失时会回退到 `default`。

## 第四步:初始化数据库

`sql/` 目录是项目数据库的 source of truth,按域分文件夹:

```
sql/
├── sys/         # 系统域:用户 / 角色 / 菜单 / 配置 / 字典 / 日志 / 文件
├── ai/          # AI 网关:渠道 / 模型映射 / 路由规则 / 配额 / 计费日志
├── tenant/      # 租户控制面:tenant 元数据
└── biz/         # 业务示例(可选)
```

最简单的做法是用 `psql` 把 `sql/sys/` 下面的 SQL 全部跑一遍:

```bash
# 在仓库根目录
for f in sql/sys/*.sql; do
  psql -U admin -d summerrs-admin -f "$f"
done

# 如果要启用 AI 网关,继续跑
for f in sql/ai/*.sql; do
  psql -U admin -d summerrs-admin -f "$f"
done

# 多租户控制面
for f in sql/tenant/*.sql; do
  psql -U admin -d summerrs-admin -f "$f"
done
```

> 详细的表清单见仓库 `sql/sys/README.md`。

## 第五步:编译

```bash
# 完整 release 编译(首次会比较慢,workspace 有十多个 crate)
cargo build --release

# 也可以只编译 app 二进制
cargo build --release -p app
```

编译输出位于 `target/release/app`,启动方式见 [首次启动](./first-run)。

## 常见问题

**编译报 `summer` / `summer-web` 找不到?**
仓库 `Cargo.toml` 末尾有 `[patch.crates-io]` 段,从 GitHub 拉特定 commit 的 fork。第一次编译会自动 clone,网络受限时建议配置 Cargo 的 `[source.crates-io]` 镜像或 GitHub 代理。

**`sea-orm` 版本是 RC 且打了 patch?**
是的。`summer-sql-rewrite` 需要的拦截点尚未进 SeaORM 主线,仓库锁定了 `ouywm/sea-orm` fork 的特定 commit。

**为什么 `DATABASE_URL` 里塞了 `TimeZone=Asia/Shanghai`?**
为了让 PostgreSQL 连接默认走东八区,避免 `created_at` 类字段在跨时区部署时反复纠结。详见仓库 `doc/timezone-migration-guide.md`。
