---
title: Docker 一键启动
description: 用 docker-compose 把 Postgres + Redis + RustFS + 应用拉起来。
published_at: 2026-05-04 10:20:00
---

# Docker 一键启动

仓库根目录的 `docker-compose.yml` 把整套依赖和应用打成 4 个 service:

| Service | 镜像 | 默认端口 | 作用 |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5432 | 主存储 |
| `redis` | `redis:7-alpine` (启用 AOF) | 6379 | 会话 / 缓存 / 限流后端 |
| `rustfs` | `rustfs/rustfs:latest` | 9000 (S3) / 9001 (控制台) | S3 兼容对象存储 |
| `app` | 多阶段构建,镜像 tag `summerrs-admin:latest` | 8080 | Summerrs Admin 主应用 |

## 1. 准备 `.env`

仓库提供 `.env` 模板,**所有带 `?` 标记的环境变量都是必填**(docker-compose 启动时会校验):

```bash
# Postgres
POSTGRES_PASSWORD=请改成强密码

# JWT
JWT_SECRET=请改成 64+ 位随机字符串

# S3 / RustFS(开发可任写,生产请用真实凭证)
S3_ACCESS_KEY=summerAK
S3_SECRET_KEY=summerSK
S3_ENDPOINT=http://rustfs:9000     # 容器内通信用 service 名
S3_BUCKET=summer-admin

# 日志级别(可选)
RUST_LOG=info
```

> 容器内 `app` 服务通过 service 名 `postgres` / `redis` / `rustfs` 互通,所以 `S3_ENDPOINT` 在 compose 里要写 `http://rustfs:9000` 而不是 `localhost`。

## 2. 启动

```bash
# 拉镜像 + 构建 app + 启动
docker compose up -d --build

# 查看日志
docker compose logs -f app
```

健康状态检查:

```bash
docker compose ps
# 看到 postgres/redis 是 healthy,app 是 running
```

应用监听 `8080`,RustFS 控制台监听 `9001`(默认账号 `summerAK / summerSK`)。

## 3. 初始化数据库

第一次启动后,容器里没有业务表。用宿主机的 `psql` 或者 `docker exec` 把 SQL 跑一遍:

```bash
# 进入 postgres 容器
docker exec -it summerrs-postgres bash

# 在容器里(SQL 文件需要先挂卷或拷贝进去),用 psql 执行
psql -U admin -d summerrs-admin -f /path/to/sql/sys/user.sql
# ...其余文件同理

# 或者宿主机直接连
psql -h localhost -U admin -d summerrs-admin -f sql/sys/user.sql
```

> 仓库后续会提供 `migration` 子命令来自动跑 SQL,目前手动执行即可。详见 [安装](./installation) 第四步。

## 4. 验证

```bash
# OpenAPI 文档
curl http://localhost:8080/docs

# 健康路由(默认账号 Admin / 123456)
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"Admin","password":"123456"}'
```

下一页 [首次启动](./first-run) 给出更细的端到端验证脚本。

## 5. 常用维护命令

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

## 自定义构建参数

`Dockerfile` 是多阶段构建,默认 build `app` crate:

```dockerfile
# docker-compose.yml 片段
build:
  context: .
  dockerfile: Dockerfile
  args:
    APP_NAME: app
```

如果以后拆出更多二进制(例如把 `summer-mcp` 作 standalone),改 `APP_NAME` 即可,不用改 `Dockerfile`。

## 与本机开发并行

容器里的 Postgres 占 5432、Redis 占 6379、RustFS 占 9000。如果你本机已经装过这些服务想避开端口冲突,可以在 `.env` 里改:

```bash
POSTGRES_PORT=15432
REDIS_PORT=16379
S3_PORT=19000
APP_PORT=18080
```

`docker-compose.yml` 已经用 `${POSTGRES_PORT:-5432}` 这种形式读环境变量。
