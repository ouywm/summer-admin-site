# 快速开始

本指南将帮助你在本地环境快速搭建并运行 Summerrs Admin。

## 环境要求

| 依赖 | 最低版本 | 用途 |
|------|---------|------|
| Rust | 1.85+ (Edition 2024) | 编译和运行 |
| PostgreSQL | 14+ | 主数据库 |
| Redis | 6.0+ | 会话存储、Socket.IO 发布/订阅 |
| MinIO | 最新版（可选） | S3 兼容文件存储 |

## 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/ouywm/summerrs-admin.git
cd summerrs-admin

# 验证工作空间
cargo check --workspace
```

### 2. 数据库设置

#### 创建数据库和用户

```bash
psql -U postgres <<EOF
CREATE USER admin WITH PASSWORD '123456';
CREATE DATABASE "summerrs-admin" OWNER admin;
\c "summerrs-admin"
GRANT ALL ON SCHEMA public TO admin;
EOF
```

#### 执行 Schema 文件

按顺序执行以下 SQL 文件：

**系统域（用户、角色、菜单、配置、日志、文件）**

```bash
psql -U admin -d "summerrs-admin" -f sql/sys/user.sql
psql -U admin -d "summerrs-admin" -f sql/sys/role.sql
psql -U admin -d "summerrs-admin" -f sql/sys/user_role.sql
psql -U admin -d "summerrs-admin" -f sql/sys/menu.sql
psql -U admin -d "summerrs-admin" -f sql/sys/role_menu.sql
psql -U admin -d "summerrs-admin" -f sql/sys/config.sql
psql -U admin -d "summerrs-admin" -f sql/sys/dict.sql
psql -U admin -d "summerrs-admin" -f sql/sys/login_log.sql
psql -U admin -d "summerrs-admin" -f sql/sys/operation_log.sql
psql -U admin -d "summerrs-admin" -f sql/sys/notice.sql
psql -U admin -d "summerrs-admin" -f sql/sys/file.sql
```

**租户域（多租户隔离表）**

```bash
psql -U admin -d "summerrs-admin" -f sql/tenant/tenant.sql
psql -U admin -d "summerrs-admin" -f sql/tenant/tenant_datasource.sql
psql -U admin -d "summerrs-admin" -f sql/tenant/tenant_membership.sql
```

**AI 域（AI 网关相关表）**

```bash
find sql/ai -type f -name '*.sql' | sort | \
  xargs -I{} psql -U admin -d summerrs-admin -f "{}"
```

### 3. 配置环境变量

```bash
# 设置活动配置文件
export SUMMER_PROFILE=dev

# 配置数据库连接
export DATABASE_URL="postgres://admin:123456@localhost/summerrs-admin"

# 配置 JWT 密钥（至少 32 字符）
export JWT_SECRET="your-secret-key-at-least-32-chars"

# 配置 S3 存储（可选，使用 MinIO）
export S3_ACCESS_KEY="minioadmin"
export S3_SECRET_KEY="minioadmin"
```

### 4. 构建和运行

```bash
# 构建应用
cargo build -p app

# 运行开发模式
cargo run -p app
```

服务器将在 `http://localhost:8080/api` 启动。

## 验证安装

| 端点 | URL | 说明 |
|------|-----|------|
| Swagger UI | http://localhost:8080/api/docs | 交互式 API 文档 |
| 健康检查 | http://localhost:8080/api/... | 应用路由（需要认证） |
| MCP 端点 | http://localhost:8080/api/mcp | MCP 协议端点（启用时） |

### 默认测试账号

系统预置了 3 个测试账号，密码都是 `123456`：

- `Super` - 超级管理员
- `Admin` - 管理员
- `User` - 普通用户

推荐使用 `Admin` 账号进行首次验证。

## 可选组件

### MinIO（S3 存储）

如果需要文件上传功能，安装并启动 MinIO：

```bash
# macOS
brew install minio
minio server ~/minio-data

# Docker
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9001"
```

访问 MinIO 控制台：http://localhost:9001

创建名为 `summer-admin` 的存储桶。

### Redis

```bash
# macOS
brew install redis
brew services start redis

# 或直接运行
redis-server

# Docker
docker run -d -p 6379:6379 redis:latest
```

## 开发工具

### 安装 Git Hooks

```bash
./build-tools/install-git-hooks.sh
```

pre-commit hook 会自动运行：
- **TOML 格式化** - 通过 taplo 验证所有 Cargo.toml 和 config/*.toml
- **Rust 格式化** - 运行 rustfmt（Edition 2024 设置）
- **编译检查** - 执行 `cargo check --workspace --all-targets`
- **Clippy 检查** - 在关键 crate 上运行 clippy（`-D warnings`）
- **测试编译** - 验证所有测试代码编译（不实际运行）

### 手动检查

```bash
# 仅检查格式（不自动修复）
./build-tools/rustfmt.sh --check
./build-tools/taplofmt.sh --check

# 自动修复格式
./build-tools/rustfmt.sh --fix
./build-tools/taplofmt.sh --fix

# 完整检查套件（check + clippy + test compile）
./build-tools/rustcheck.sh all
```

## 使用 AI 网关

### 配置 AI 渠道

AI 网关需要在数据库中配置渠道信息。你可以通过管理 API 或直接插入数据库来配置。

**示例：添加 OpenAI 渠道**

```sql
-- 插入渠道配置
INSERT INTO ai.channel (name, vendor, api_style, base_url, weight, priority, enabled)
VALUES ('OpenAI Official', 'openai', 'openai', 'https://api.openai.com', 100, 1, true);

-- 插入渠道账户（凭证）
INSERT INTO ai.channel_account (channel_id, api_key, enabled)
VALUES (1, 'sk-your-openai-api-key', true);
```

### 使用 OpenAI 兼容端点

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer YOUR_AI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'
```

### 使用 Claude 原生端点

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Authorization: Bearer YOUR_AI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "你好"}],
    "max_tokens": 1024
  }'
```

### 流式响应

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer YOUR_AI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "讲个笑话"}],
    "stream": true
  }'
```

## 使用 MCP 服务器

MCP（Model Context Protocol）允许 AI 助手与系统交互。

### 启用 MCP

在 `config/app-dev.toml` 中确保 MCP 已启用：

```toml
[mcp]
enabled = true
http_mode = "embedded"
transport = "http"
stateful_mode = true
path = "/mcp"
```

### MCP 端点

MCP 服务器在 `http://localhost:8080/api/mcp` 提供服务。

AI 助手可以通过 MCP 协议：
- 发现数据库 schema
- 生成 CRUD 模块
- 部署菜单和字典

## 常见问题

### cargo check 失败（edition 错误）

**原因**：Rust 版本 < 1.85

**解决**：
```bash
rustup update stable
```

### 数据库连接被拒绝

**原因**：PostgreSQL 未运行或凭证错误

**解决**：
```bash
# 验证 PostgreSQL 运行
pg_isready

# 检查 DATABASE_URL 环境变量
echo $DATABASE_URL
```

### Redis 连接被拒绝

**原因**：Redis 未启动

**解决**：
```bash
# 启动 Redis
redis-server

# 或使用 Homebrew 服务
brew services start redis
```

### Pre-commit hook 在 clippy 失败

**原因**：引入了新的警告

**解决**：
```bash
# 运行完整 clippy 输出
./build-tools/rustcheck.sh clippy
```

### Swagger UI 返回 404

**原因**：doc_prefix 配置错误或缺失

**解决**：验证活动配置文件中存在 `[web.openapi]` 部分。

### JWT token 被拒绝

**原因**：密钥不匹配

**解决**：确保 `JWT_SECRET` 环境变量在重启之间保持一致。

### S3 上传失败

**原因**：MinIO 未运行

**说明**：S3 功能是可选的；应用可以在没有 MinIO 的情况下启动。

## 下一步

- 参考[模块概览](./module-overview.md)了解项目结构
