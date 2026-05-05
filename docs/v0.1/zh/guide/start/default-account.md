---
title: 默认账号与初始数据
description: 出厂账号、密码、内置角色、菜单数据和最小权限位。
published_at: 2026-05-04 10:40:00
---

# 默认账号与初始数据

## 默认管理员

`sql/sys/user.sql` 在初始化时会插入一个超管账号:

| 字段 | 默认值 |
|---|---|
| **用户名** | `Admin` |
| **密码** | `123456` |
| **昵称** | 超级管理员 |
| **角色** | `admin`(默认 `*` 通配权限) |
| **状态** | 正常 |

> ⚠️ **生产部署前必须改密码**。修改方式:登录后台 → 用户管理 → Admin → 重置密码,或直接在数据库里更新(密码用 Argon2 哈希,不要直接写明文)。

## 密码哈希

`summer-system` 默认用 [argon2](https://crates.io/crates/argon2):

```rust
use argon2::{Argon2, PasswordHasher, password_hash::SaltString};
use rand::rngs::OsRng;

let salt = SaltString::generate(&mut OsRng);
let hash = Argon2::default()
    .hash_password(b"123456", &salt)
    .unwrap()
    .to_string();
// $argon2id$v=19$m=19456,t=2,p=1$......
```

数据库里的 `sys."user".password` 就是这种 PHC 串。

## 内置角色

| 角色 code | 名称 | 权限 |
|---|---|---|
| `admin` | 超级管理员 | `*`(通配,全开) |
| 其他可在 `sys.role` 表手动添加 | | |

权限粒度由路由上的 `#[has_perm("xxx:yyy:zzz")]` 决定。`*` 形式可以匹配 `system:user:list`、`system:role:add` 等任意子串。详见 [认证授权](../core/auth)。

## 内置菜单

`sql/sys/menu_data_all.sql` 是一份完整的菜单数据,落到 `sys.menu` 表。结构:

- 系统管理(`system`)
  - 用户管理(`system:user`)
  - 角色管理(`system:role`)
  - 菜单管理(`system:menu`)
  - 字典管理(`system:dict`)
  - 配置管理(`system:config`)
  - 通知公告(`system:notice`)
  - 文件管理(`system:file`)
- 系统监控(`monitor`)
  - 在线用户(`monitor:online`)
  - 登录日志(`monitor:login-log`)
  - 操作日志(`monitor:operation-log`)
  - 任务调度(`monitor:job`)
- AI 管理(`ai`)(若启用 `summer-ai-admin`)
  - 渠道管理 / 模型映射 / 路由规则 / 配额 / 计费日志 / 模型供应商 / Token

具体字段以 `sql/sys/menu_data_all.sql` 为准。前端可以通过 `GET /api/menu/tree` 拿到树形菜单。

## 内置字典

`sql/sys/dict.sql` 预置了一组常用字典(`sys.dict_type` + `sys.dict_data`):

| 字典类型 | 说明 |
|---|---|
| `sys_user_sex` | 性别(0 男 / 1 女 / 2 未知) |
| `sys_normal_disable` | 正常 / 禁用 |
| `sys_yes_no` | 是 / 否 |
| `sys_login_type` | 登录类型 |
| `sys_oper_type` | 操作类型 |
| `sys_biz_type` | 业务类型 |
| ... | 详见 SQL |

应用代码里通过 `DictDomainService` 读取(MCP 里也暴露了 `dict_tool` 业务工具)。

## 系统配置 sys_config

`sql/sys/config.sql` 初始化了一组系统级配置项(键值对),典型条目:

| key | 含义 |
|---|---|
| `sys.account.captcha.enabled` | 登录是否启用图形验证码 |
| `sys.account.password.policy` | 密码策略 |
| `sys.upload.max_size` | 文件上传最大字节数 |
| `sys.notice.banner` | 公告栏文案 |
| ... | |

可以通过 `/api/sys-config/*` 接口在线修改。

## 默认租户

`sql/tenant/` 下提供 `tenant` 表的 schema 与初始数据。出厂会插入一个**默认租户**(通常 `id = 0` 或 `id = 1`,具体见 SQL),用于:

- 单租户部署(`shared_row` + 默认租户 id)
- 多租户初始化(后续按需扩展)

## 重置初始数据

如果你改坏了想从头来:

```bash
# ⚠️ 会清空业务数据
psql -U admin -d summerrs-admin -c "DROP SCHEMA sys CASCADE;"
psql -U admin -d summerrs-admin -c "DROP SCHEMA ai CASCADE;"
psql -U admin -d summerrs-admin -c "DROP SCHEMA tenant CASCADE;"

# 然后重跑初始化(参考 安装 第四步)
for f in sql/sys/*.sql sql/ai/*.sql sql/tenant/*.sql; do
  psql -U admin -d summerrs-admin -f "$f"
done
```

> Docker 模式下,直接 `docker compose down -v` 把 `postgres_data` 卷清掉再重启更彻底。

## 下一步

- 进入后台 UI 体验:目前文档站不附带前端,前端项目独立维护(基于 Art Design Pro)。
- 直接走 API:看 [API 概览](/api/) 与 Swagger UI(`/docs`)。
- 看核心机制:[认证授权](../core/auth)。
