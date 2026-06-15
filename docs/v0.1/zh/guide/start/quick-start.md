---
title: 快速开始
description: 快速启动 Summerrs Admin，支持 Docker 一键部署和本地开发两种方式。
published_at: 2026-06-16 10:00:00
---

# 快速开始

## 前置要求

| 工具 | 推荐版本 | 用途 |
|---|---|---|
| Rust | **1.93+** (Edition 2024) | 编译后端 |
| PostgreSQL | **17+** | 主存储 |
| Redis | **7+** | 会话 / 缓存 / 限流后端 |
| S3 兼容存储 | MinIO / RustFS / AWS S3 | 文件上传 |
| Docker + Compose | 可选 | 一键启动整套环境 |

> 当前 `Cargo.toml` 锁定 `edition = "2024"`,Rust 工具链需要 1.93 及以上。

## 方式一：Docker 一键启动（推荐）

### 1. 克隆代码

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin
```

### 2. 配置环境变量

仓库根目录的 `docker-compose.yml` 包含 4 个服务:

| Service | 镜像 | 默认端口 | 作用 |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5432 | 主存储 |
| `redis` | `redis:7-alpine` | 6379 | 会话 / 缓存 / 限流后端 |
| `rustfs` | `rustfs/rustfs:latest` | 9000 / 9001 | S3 兼容对象存储 |
| `app` | 多阶段构建 | 8080 | Summerrs Admin 主应用 |

创建或修改 `.env` 文件:

```bash
# Postgres
POSTGRES_PASSWORD=请改成强密码

# JWT
JWT_SECRET=请改成 64+ 位随机字符串

# S3 / RustFS
S3_ACCESS_KEY=summerAK
S3_SECRET_KEY=summerSK
S3_ENDPOINT=http://rustfs:9000     # 容器内通信用 service 名
S3_BUCKET=summer-admin

# 日志级别
RUST_LOG=info
```

> 容器内 `app` 服务通过 service 名 `postgres` / `redis` / `rustfs` 互通,所以 `S3_ENDPOINT` 要写 `http://rustfs:9000` 而不是 `localhost`。

### 3. 启动服务

```bash
# 拉镜像 + 构建 app + 启动
docker compose up -d --build

# 查看日志
docker compose logs -f app

# 健康状态检查
docker compose ps
# 看到 postgres/redis 是 healthy,app 是 running
```

应用监听 `8080`,RustFS 控制台监听 `9001`(默认账号 `summerAK / summerSK`)。

> 💡 **提示**: 数据库会在应用首次启动时自动初始化,无需手动执行 SQL。

### 4. 验证

```bash
# OpenAPI 文档
curl http://localhost:8080/docs

# 登录测试(默认账号 Admin / 123456)
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"123456"}'
```

### 常用维护命令

```bash
# 停止
docker compose down

# 停止 + 清空数据卷(⚠️ 会丢数据库内容)
docker compose down -v

# 只重启应用,不动 db / redis
docker compose restart app

# 重新构建应用镜像
docker compose build app
docker compose up -d app
```

### 自定义端口

如果本机已有服务占用默认端口,可在 `.env` 里修改:

```bash
POSTGRES_PORT=15432
REDIS_PORT=16379
S3_PORT=19000
APP_PORT=18080
```

`docker-compose.yml` 已支持通过环境变量配置端口。

## 方式二：本地开发

### 1. 克隆代码

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin
```

### 2. 准备外部依赖

确保本机有可用的:
- PostgreSQL 17+
- Redis 7+
- S3 兼容存储 (MinIO / RustFS / AWS S3)

> **提示**:数据库会在首次启动时通过 SeaORM 自动初始化,无需手动执行 SQL。

### 3. 配置环境变量

创建 `.env` 文件:

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

### 4. 运行项目

```bash
# 直接运行(会自动编译)
cargo run --bin app
```

项目会在首次启动时自动完成数据库初始化。启动后访问 `http://localhost:3000` 即可。

## 常见问题

**编译报 `summer` / `summer-web` 找不到?**

仓库 `Cargo.toml` 末尾有 `[patch.crates-io]` 段,从 GitHub 拉特定 commit 的 fork。第一次编译会自动 clone,网络受限时建议配置 Cargo 的 `[source.crates-io]` 镜像或 GitHub 代理。

**Docker 自定义构建参数?**

`Dockerfile` 是多阶段构建,默认 build `app` crate。如果以后拆出更多二进制(例如把 `summer-mcp` 作 standalone),可以在 `docker-compose.yml` 中修改 `APP_NAME`:

```dockerfile
build:
  context: .
  dockerfile: Dockerfile
  args:
    APP_NAME: app
```
