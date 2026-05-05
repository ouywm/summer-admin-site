---
title: 认证授权方案翻新五遍
description: 从 Redis Session 到双 Token + 位图 + Deny Check —— 五个版本的取舍与踩坑。
date: 2026-05-04
authors: ['ouywm']
sidebar: false
pageType: doc-wide
---

# 认证授权方案翻新五遍

> 从 Session 到双 Token + 位图 + Deny Check 的踩坑实录。
>
> 这是一篇**亲历者视角**的复盘,不是"应该怎么做"的总结。
>
> 我会把 `summerrs-admin` 认证授权这块**从无到有的五个版本**摊开讲 —— 每次为什么不爽、为什么改、改完又遇到什么。如果你正在做类似的事,可以省你几个月走弯路。

## 0. 先说结论

最终落地的方案,长这样:

```mermaid
flowchart LR
    A[登录] --> B[短 Token: 业务接口用]
    A --> C[长 Token: 只用来换 Token]
    C --> D[(Redis: auth:refresh:rid)]
    B -->|每次请求| E{deny check 开关}
    E -->|关| F[纯本地校验<br/>0 Redis]
    E -->|开| G[查 auth:deny:login_id]
    G -->|banned| H[禁用]
    G -->|refresh:ts| I[告知前端去刷新]
    G -->|无| J[放行]
```

四个关键词:**双 Token / 短 Token 跑业务 / 位图压缩权限 / 可选的 per-request deny check**。

但要讲清楚**为什么是这个形状**,得从最早最朴素的 v1 讲起。

## 1. v1:纯 Session,每次请求都查 Redis

最开始我没想那么复杂。登录就发一个 UUID,把用户信息存到 Redis,每次请求带这个 UUID 来,中间件去 Redis 拿用户信息,塞进请求扩展。

```text
# 登录
POST /auth/login
→ 生成 uuid → set("session:{uuid}", user_info_json) → 返回 uuid

# 业务请求
GET /api/user/info  Authorization: Bearer {uuid}
→ 中间件 get("session:{uuid}") → 解析 user_info → req.extensions_mut().insert(user_info)
→ handler 直接拿
```

这个方案的优点很明显:**简单**。逻辑就一个 GET,踢人就一个 DEL,改权限直接覆盖 value,业务想拿什么数据从 Redis 取。

但很快我就觉得不对劲:

> **每一个请求** —— 不管是查列表、改配置、点按钮 —— 都要往 Redis 跑一趟。

10 QPS 的小后台无所谓,真上量了 Redis 是热点。而且这本质上还是 **Session**,我用了 axum、写了一堆 Rust,结果方案跟 PHP 时代的 `$_SESSION` 没区别。

> **痛点**:每次请求强制 Redis 交互,扩展性差。

## 2. v2:看了一圈开源,看到的是"脱裤子放屁"

我决定参考一下别人怎么做。打开几个 star 几千的 admin 项目,挨个看登录接口返回的 token,**结果挺让我意外**。

### 2.1 经典派:JWT 包一个 UUID

很多项目登录后返回这样的 token:

```text
eyJhbGciOiJIUzUxMiJ9.eyJsb2dpbl91c2VyX2tleSI6IjQ3NzIwZGE3LTBlOWItNDdhYy05YzhlLWRlOWU1ZjFkMjRkNCJ9.UhQ06KUza2WDxLz3-7L_kZIgzGxnnFLKUIB8No4ld3QDGoR5L9qJkaOvbh8BDYRwLxC12T4y7yUuing1ykmjLw
```

解码 payload:

```json
{
  "login_user_key": "47720da7-0e9b-47ac-9c8e-de9e5f1d24d4"
}
```

**就一个字段。一个 uuid。** 然后这个 uuid 作为 key 去 Redis 查用户信息。

我看不懂。这跟我 v1 的方案有什么区别?**唯一的区别就是把 uuid 用 JWT 包了一层**:

- 没有用户信息(还是要查 Redis)
- 没有过期时间字段(payload 里没有 `exp`)
- 没有刷新 token

那为什么要包?**没有任何收益**。HMAC 签名能防止 uuid 被篡改 —— 但 uuid 本身就是不可猜测的随机串,被篡改也查不到东西。

唯一的"好处"是看起来很现代。

### 2.2 缝合派:JWT 里塞 sessionId + tokenVersion

另一些项目走得更远:

```json
{
  "username": "Super",
  "sub": 2,
  "tokenType": "refresh",
  "tokenVersion": 0,
  "sessionId": "cmor88woq012007rxdt37oc5e",
  "iat": 1777900825,
  "exp": 1778505625
}
```

JWT 里有 `sessionId`。还有 `tokenVersion`(用来全局失效?)。还分了 access / refresh。

这就开始**两个世界都要维护**:

- JWT 自己要校验签名、过期
- sessionId 要查 Redis(还是没省)
- tokenVersion 要在某张表里存

我承认有时候业务复杂,得这样。但小后台用这套,**复杂度对不上收益**。

### 2.3 直返 UUID 派

还有的不装了,登录就返回 UUID,直接 Redis,连 JWT 都不用。

跟我 v1 一模一样,**问题也一模一样**。

> **看完一圈我得出的结论**:JWT 用得对的不多,大部分是把 JWT 当成"随机串包装器"用,白白付了签名验签的开销,没拿到任何无状态的好处。

## 3. v3:把用户信息塞进 JWT 载荷,真无状态

JWT 的卖点是 **claims**(载荷)—— 服务端在签发时把数据写进去,客户端带回来就能用,**不用查任何东西**。

很多人不敢这么用,因为载荷是 base64,看起来"不安全"。**但 JWT 本来就不是用来加密的**,它的安全保证是"你不能伪造",不是"内容看不见"。所以**只放不敏感的信息**就行。

我把用户基本信息全塞了进去:

```json
{
  "sub": 2,
  "username": "Admin",
  "roles": ["R_SUPER"],
  "perms": [
    "system:user:list",
    "system:user:add",
    "system:user:edit",
    "system:user:delete",
    "system:role:list",
    "...还有 200 个"
  ],
  "tenant_id": 1,
  "iat": 1777900825,
  "exp": 1778505625
}
```

中间件拿到 JWT,验完签名,直接从 claims 里读 roles / perms,**0 次 Redis 交互**。

这就是真正的无状态。性能终于压下来了。

但跑了一段时间,**两个新问题暴露了**:

### 3.1 用户信息变更,token 不知道

我在后台把 Admin 的角色从 `R_SUPER` 改成 `R_USER`,这个用户的 token 还是带着 `R_SUPER` 的载荷,**继续以超管身份调接口**。

要等到 token 过期(默认 2 小时),用户重新登录,才会拿到新 token。

业务可以接受 2 小时延迟吗?**敏感操作显然不行**。

### 3.2 Token 长得离谱

我有个超管账号,200 多个权限点,JWT 载荷塞了一个长字符串数组。Base64 编码后的 JWT **超过 4 KB**,放在 `Authorization` header 里每次都传。

很多反代默认 header 上限 8 KB,**再大就 502**。CDN 缓存键也容易爆。

> **痛点**:无状态 → 信息更新延迟 + token 长度爆炸。

## 4. v4:双 Token,5 分钟流转

我开始研究双 Token(也叫 access + refresh)。短 Token 跑业务,**短到 5-10 分钟就过期**;长 Token 只用来换新短 Token,**长到 1-2 小时**(或更久)。

业界的好处:

- **短 Token 泄漏窗口短** —— 5 分钟后就废了
- **业务请求 0 Redis 交互** —— 跟 v3 一样
- **更新有窗口** —— 用户改了角色,**5 分钟内**自动跟着新短 Token 一起更新

### 4.1 我的双 Token 设计

**短 Token**(业务用):载荷塞用户基本信息 + 角色 + 权限位图(后面会讲)

```json
{
  "sub": 1,
  "username": "Admin",
  "roles": ["R_SUPER"],
  "pb": "AH74ARw=",
  "iat": 1777902133,
  "exp": 1777902433
}
```

**长 Token**(只换 Token):载荷只放 rid

```json
{
  "sub": "1",
  "typ": "refresh",
  "iat": 1777902133,
  "exp": 1778506933,
  "rid": "6c210c41-9f69-479f-8996-564f867df7e8"
}
```

**Redis 里实际有两份 key,各司其职**(这点我自己一开始也搞混过):

```text
# 1. 反向索引:rid → 这个 rid 当前属于哪个用户哪个设备
key:   auth:refresh:6c210c41-9f69-479f-8996-564f867df7e8
value: "1:web"              # 简单的 "login_id:device" 字符串

# 2. 设备会话信息:每个用户的每个设备各一条
key:   auth:device:1:web
value: {
  "rid": "6c210c41-9f69-479f-8996-564f867df7e8",
  "login_time": 1777738168557,
  "login_ip": "127.0.0.1",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ..."
}
```

为什么拆两份?

- **`auth:refresh:{rid}`** 的作用是:刷新时只拿到了 refresh token,需要用 rid 反查 login_id + device。value 越简单越好,字符串 `"1:web"` 就够了。
- **`auth:device:{login_id}:{device}`** 的作用是:展示"谁在哪儿登录"(在线设备列表)、清理设备时拿到当前 rid 顺手删 refresh key。

两个 key 都用 string,不是 hash。这样**踢一个设备只动两条 key**,逻辑直白。

### 4.2 流程

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant R as Redis

    Note over C,S: 登录
    C->>S: POST /auth/login (username/password)
    S->>S: 验密码 → 拉 user/role/perm
    S->>R: SET auth:refresh:{rid} { login_time, ip, ua }
    S-->>C: { access_token, refresh_token }

    Note over C,S: 业务请求(0 Redis)
    C->>S: GET /api/x  Bearer {access_token}
    S->>S: 验签 + 验过期 + 读载荷
    S-->>C: 200

    Note over C,S: 短 Token 过期
    C->>S: GET /api/x  Bearer {expired_access}
    S-->>C: 401 TOKEN_EXPIRED

    Note over C,S: 刷新(用一次,即焚)
    C->>S: POST /auth/refresh  Bearer {refresh_token}
    S->>S: 验签 + 解析 rid
    S->>R: GET auth:refresh:{rid}
    R-->>S: "login_id:device"
    S->>R: GET auth:deny:{login_id}
    R-->>S: 不是 banned 就放行
    S->>S: 拉用户最新 user/role/perm
    S->>R: SET auth:refresh:{new_rid} ...(先写新)
    S->>R: DEL auth:refresh:{old_rid}(后删旧)
    S->>R: 更新 auth:device:{login_id}:{device}.rid
    S-->>C: { new_access_token, new_refresh_token }
```

几个**关键设计**:

1. **长 Token 一次性** —— 用过即焚,被截获再用第二次会失败
2. **先写新 key,后删旧 key** —— 服务端如果在中间崩溃,旧 key 多活一会有 TTL 兜底,用户不会"刚刷一半就 401"
3. **刷新时重拉用户信息** —— 解决 v3 的"角色变更不生效"
4. **刷新时只校验 banned,不挡 `refresh:{ts}`** —— banned 用户拒绝刷新;但如果是"角色变更标记"(`refresh:{ts}` 的 deny),刷新本来就是为了**消化它**,不能拦
5. **业务接口纯 JWT** —— 跟 v3 一样,0 Redis

### 4.3 看起来完美?暴露了新问题

跑了一段时间,我又发现:

**问题 1:每次刷新都要拉数据库**

刷新流程要查用户、查角色、查权限,这是几个 JOIN。如果用户活跃,5 分钟刷一次,**数据库压力又起来了**。

**问题 2:Token 还是太长**

权限点 200 个,JWT 载荷里 `"perms": [...]` 还是几 KB。

**问题 3:盗号窗口比想象的大**

如果攻击者拿到了**长 Token**,只要他在受害者刷新之前用,他就能换出新短 Token + 新长 Token,**反而把受害者踢出去了**。等受害者下次刷新,他的长 Token 已经被攻击者覆盖了 → 退出登录。

而**这一切只能等到下一次刷新时,从用户状态 banned 字段发现**。覆盖时间窗口最大可达**短 + 长 Token 的总寿命**。

## 5. v5:位图 + per-request deny check

针对 v4 的三个新问题,我各打了一个补丁。

### 5.1 权限位图:把 200 行数组压成 8 字节

权限编码字符串本身没法压缩。但我注意到:

> 一个项目的**权限点是有限且基本不变的**。系统启动时,我能拿到全部权限点列表。

那就给每个权限分配一个 bit:

```text
启动时:
  SELECT id, perm, bit_position FROM sys.menu;
  perm_index: HashMap<String, usize> = {
    "system:user:list" → 0,
    "system:user:add"  → 1,
    "system:user:edit" → 2,
    ...
    "ai:relay:chat"    → 187
  }

用户登录时:
  user_perms = [system:user:list, system:user:add, ai:relay:chat, ...]
  bitmap = bits_or(user_perms.map(perm_index))
  // 一个 200 多 bit 的位图,用 Vec<u8> 装,base64 后大概 30-40 字符
```

JWT 载荷变成:

```json
{
  "sub": 1,
  "username": "Admin",
  "roles": ["R_SUPER"],
  "pb": "AH74ARw="
}
```

`"pb"` 就是 base64 编码的位图。**整个权限信息从几 KB 压到几十字节**。

权限检查(从 `crates/summer-auth/src/session/manager.rs::validate_token` 抽象):

```rust
// 1. 从 JWT 载荷的 pb 字段 decode 回 Vec<String>
let permissions = bitmap::decode(pb, &perm_map);

// 2. 再用通配符匹配(*、system:*、system:*:list 都支持)
fn permission_matches(owned: &str, required: &str) -> bool {
    // 精确 / 超级 * / 末尾 * / 中间 * / 段数校验
}
```

注意这里**没有"user_bitmap & required_bitmap"那种纯位运算**。原因很直白:通配符语义(`system:*:list`)靠位图表达不了,得先 decode 回字符串数组再做匹配。**bitmap 的真正价值是压缩 token 体积,不是加速匹配**(字符串匹配本身也就几百纳秒,瓶颈不在这)。

数据库表 `sys.menu` 加了一个 `bit_position` 字段,启动时全量加载到内存。**菜单在生产很少改**,每次需要重启或者发广播刷新即可。

兼容性:**老的字符串权限编码也保留**,部分场景下仍然走字符串匹配(例如 MCP 工具调用、外部 webhook)。

### 5.2 per-request deny check:用配置开关换实时性

JWT 无状态的代价就是**改不了已签发的 Token**。我加了一个开关:

```toml
[auth]
per_request_deny_check = true   # 默认 false,开启后每个请求多一次 Redis
```

开启后,中间件多一步:

```rust
fn deny_key(login_id: &LoginId) -> String {
    format!("auth:deny:{}", login_id.encode())
}

// 中间件
if self.config.per_request_deny_check
    && let Some(deny_value) = self.storage.get_string(&deny_key(&login_id)).await?
{
    match deny_value.as_str() {
        "banned" => return Err(AuthError::AccountBanned),
        v if v.starts_with("refresh:") => {
            // 时间戳方案:token 签发时间 <= deny 设置时间 → 需要刷新
            // refresh 后签发的新 token (iat > deny_ts) 自动放行
            if let Ok(deny_ts) = v[8..].parse::<i64>() {
                if claims.iat <= deny_ts {
                    return Err(AuthError::RefreshRequired);
                }
            }
        }
        _ => {}
    }
}
```

这一步处理了**两类需求**:

#### 5.2.1 黑名单:`banned`

管理员把某个用户标记为禁用 → 写一条 `auth:deny:{login_id} = "banned"` → 这个用户的所有请求立即被拒。

> **不依赖 token 过期**。下一次请求就生效。

#### 5.2.2 强制刷新:`refresh:{ts}`

最妙的是这个。当我改了某个用户的角色,我**不需要踢他下线**,只需要写一条:

```text
SET auth:deny:{login_id} = "refresh:1777902800"
```

这条记录的含义是:**任何 iat 早于 1777902800 的 token 都需要去刷新**。

然后:

- 用户当前的短 Token 是 5 分钟前签的(iat = 1777902500)→ 命中 → 返回 `RefreshRequired`
- 前端收到这个错误 → 自动调 `/auth/refresh`
- 刷新流程拉最新角色 → 签发新短 Token(iat = 1777902800+)→ 不再命中 deny → 正常工作

**整个过程对用户无感**。最长延迟就是前端发现错误到刷新成功的 1 秒钟。

```mermaid
sequenceDiagram
    participant Admin as 管理员后台
    participant Server as Server
    participant Redis as Redis
    participant Client as 用户浏览器

    Admin->>Server: 修改用户 #42 的角色
    Server->>Redis: SET auth:deny:42 "refresh:{now_ts}"

    Note over Client: 5 分钟内的某个请求
    Client->>Server: GET /api/x  Bearer {old_access_token}
    Server->>Server: 验签 OK,iat=ts1
    Server->>Redis: GET auth:deny:42
    Redis-->>Server: "refresh:ts2"
    Server->>Server: ts1 <= ts2 → 拒绝
    Server-->>Client: 401 REFRESH_REQUIRED

    Client->>Server: POST /auth/refresh
    Server->>Server: 拉最新角色,签 iat=now 的新 token
    Server-->>Client: { new_access, new_refresh }

    Client->>Server: GET /api/x  Bearer {new_access}
    Server->>Redis: GET auth:deny:42
    Redis-->>Server: "refresh:ts2"
    Server->>Server: now > ts2 → 放行
    Server-->>Client: 200
```

> **写一条 deny,所有早于此时刻的 token 在下一次请求时都会自动跟着新角色走**。这是我整套方案里最得意的一笔。

#### 5.2.3 deny 记录的 TTL 不一样

| 值 | TTL | 为什么 |
|---|---|---|
| `refresh:{ts}` | `access_timeout`(2h) | 过了这个时间,所有比 `ts` 早的 token 都自然过期了,deny 没必要继续存在 |
| `banned` | **365 天** | banned 是显式状态,不该靠 TTL 过期解封;由 `unban_user()` API 显式删除 |

我之前在文档里说 "deny 一律 access_timeout",其实不对。**banned 必须长寿命**,否则一年前封禁的账号哪天 TTL 一过就自动解封了,那不就出大事了。

#### 5.2.4 刷新成功后,deny key 不删除

这个细节我踩过一次坑。最初的实现是:**刷新成功就删掉 deny key**,理由是"用户已经拿到新 token 了,deny 没用了"。

结果多设备场景立刻翻车:

```text
1. 管理员改用户 #42 角色 → SET auth:deny:42 "refresh:t0"
2. 设备 A 的旧 token 触发 RefreshRequired → 自动刷新 → 拿到新 token
3. 刷新成功后,我把 deny:42 删掉了
4. 设备 B 的旧 token 来了 → GET auth:deny:42 没记录 → 直接放行
5. 设备 B 还在用旧角色!
```

问题出在"删 deny" 这一步太急。修复:**刷新成功不删 deny key,让它自然 TTL 过期**(过期前所有设备的旧 token 都会被强制刷新一次)。

```rust
// crates/summer-auth/src/session/manager.rs::refresh
// 10. deny key 不删除，自然过期(修复多设备竞态:所有设备都必须 refresh 才能获得新权限)
```

代价就是 `auth:deny:{login_id}` 多存活 access_timeout(2h),一个用户 ≤ 几十字节,可以接受。

### 5.3 logout / kick 的"温柔"语义

这一块我做过几个版本的取舍,值得单独讲。

朴素的"踢人下线"是这样的:把目标设备的 token 拉黑,该设备的所有请求 401。但**多设备场景下你会发现这样做太粗暴**:

> 用户在 Web、Android、iOS 三端登录,我从 Web 点了"退出登录"。难道我希望 Android 和 iOS 也跟着掉线?显然不希望。

所以现在的实现是:

```rust
// crates/summer-auth/src/session/manager.rs::logout
pub async fn logout(&self, login_id: &LoginId, device: &DeviceType) -> AuthResult<()> {
    // 1. 清理目标设备:删 device key + 删对应 refresh key(这一步是"硬退")
    self.cleanup_device(login_id, device).await;

    // 2. 设置 deny key,值是 refresh:{ts}(粒度是 login_id,会影响所有设备)
    let deny_value = format!("refresh:{}", chrono::Local::now().timestamp());
    self.storage
        .set_string(&deny_key(login_id), &deny_value, self.config.access_timeout)
        .await?;
    Ok(())
}
```

关键是第二步:**logout 单设备,也会写 login_id 粒度的 deny**。看起来"会牵连其他设备",但因为是 `refresh:{ts}` 而不是 `banned`:

| 设备 | 行为 |
|---|---|
| **目标设备**(刚 logout 的) | refresh key 已删,刷新会失败 → 真正退出 |
| **其他设备**(还想继续用) | 旧 token 命中 deny → 触发 RefreshRequired → 前端自动刷新 → 拿到新 token,**不掉线** |

这样**用一个 key 同时支撑了三种语义**:logout、force_refresh、ban_user。代码里的注释说得很到位:

```rust
// 设计说明:deny key 按 login_id 粒度设置，logout 单设备也会让其他设备的旧 token 触发 RefreshRequired。
// 其他设备前端会自动 refresh 拿到新 token，不会断线，换来 validate_token / force_refresh / ban 都只需操作一个 key。
```

我自己也是写到这里才意识到 deny key 的真正威力 —— **它不是"拦截器",而是"流转触发器"**。

### 5.4 开关的代价

`per_request_deny_check = true` 后,**每个请求**都要 Redis GET 一次。又回到 v1 的场景了吗?

不是。区别在于:

| 维度 | v1 Session | v5 deny check |
|---|---|---|
| Redis 不挂时 | GET 必须成功才能放行 | GET 没记录就放行(默认快路径) |
| Redis 挂时 | 全站不可用 | 失败时按 fail_open 放行,记日志 |
| 响应数据 | 整个 user_info JSON | 一个短字符串(`banned` 或 `refresh:ts`) |
| 每秒 Redis QPS | 全站 QPS × 1 | 全站 QPS × 1(但更轻) |

更重要的:**这是个开关**。不开就退化到 v4 的 0 Redis 模式;开就有实时性。

> 工程权衡:**给运维一个旋钮,不给业务一个银弹**。

## 5.5 用一张表说清楚 deny 三态

为了方便对比,把 deny key 的三种值并排放一遍:

| 触发场景 | deny 值 | TTL | refresh 流程是否阻拦 | 业务流程是否阻拦 |
|---|---|---|---|---|
| `force_refresh()` 角色变更 | `refresh:{ts}` | 2h | ❌ 不阻拦(让它消化) | ✅ 旧 token 触发 RefreshRequired |
| `logout(device)` 退出 | `refresh:{ts}` | 2h | ❌ 不阻拦 | ✅ 旧 token 触发 RefreshRequired(其他设备无感刷新) |
| `logout_all()` 全设备 | `refresh:{ts}` + 删所有 device/refresh | 2h | ❌ 不阻拦,但 refresh key 已删,刷新自然失败 | ✅ 同上 |
| `ban_user()` 封禁 | `banned` | 365d | ✅ **阻拦**(账号已禁用) | ✅ 直接 403 |
| `unban_user()` 解封 | (DEL) | — | — | — |

写到这里我才意识到:**整套 deny 机制其实就是用一个 string,把"在线状态、刷新流转、封禁"这三件原本要三张表才能管的事,折叠成了一行**。这种"一物多用"的设计,在 Redis 里是真的舒服。

## 6. 五个版本的全景对比

| 版本 | 形态 | Redis 交互 | 实时性 | Token 大小 | 我的看法 |
|---|---|---|---|---|---|
| **v1** Session | UUID + 全 user_info 在 Redis | **每次请求 1 次** | 改 Redis 立即生效 | UUID 几十字节 | 简单但不可扩展 |
| **v2** JWT 包 UUID | JWT payload 只有 uuid | **每次请求 1 次** | 同 v1 | 包了 JWT 后几百字节 | 没有任何额外收益,反而多了签名开销 |
| **v3** JWT 全载荷 | 用户信息塞 JWT | **0 次** | **改完要等 token 过期** | 几 KB | 性能好但实时性差 |
| **v4** 双 Token | 短跑业务 / 长换 Token | **业务 0,刷新 1** | 5-10 分钟流转 | 短 Token 还是几 KB | 比 v3 好,但 token 还是大,刷新数据库压力大 |
| **v5** 位图 + deny check | v4 + 位图压缩 + 可选 deny | **业务 0(默认)/ 1(开 deny)** | 即时(开 deny) | **几十字节** | 当前最终版 |

## 7. 我学到了什么

如果让我把这五次迭代浓缩成几句话:

1. **JWT 不是 Session 的包装器** —— JWT 的真正价值是**载荷可读 + 服务端不需要查询**。如果你 JWT 里只放一个 uuid 然后还要查 Redis,那不如直接用 uuid。

2. **无状态和实时性是矛盾的** —— 想要无状态就接受延迟,想要实时就接受查询。**不要试图既要又要**,要么提供配置开关让用户自己选(per_request_deny_check),要么走双 Token 拿一个折中。

3. **双 Token 不是为了"安全",而是为了"可演进"** —— 短 Token 短到能容忍少量泄漏,长 Token 用过即焚 + 携带流转的能力。"安全"这个词太空,具体是什么我觉得是**降低用户感知到的损失窗口**。

4. **`refresh:{ts}` 这个想法是我最得意的设计** —— 用一条带时间戳的字符串,精准失效"早于这一刻签发的 token",而不是粗暴地踢掉用户。它本质上是 **CAS 思维**(compare-and-swap)的应用 —— "我知道你那条 token 是几点几分签的,如果不晚于我这条 deny 时刻,你就该刷新"。

5. **位图压缩不是炫技,是被 token 体积逼出来的** —— 当我看到 4 KB 的 Authorization header 在反代上 502 时,才真正理解"内联数据"的物理边界。每个内联进 token 的字段都要问一句:"这真的能压到 1 KB 以内吗?"

6. **配置开关是工程上的礼貌** —— 我之前总想"给项目一个最优解"。但每个团队的 SLA、合规、性能侧重不一样。`per_request_deny_check` 默认关,你可以开;就像 `concurrent_login` 默认开,你可以关。**让每个使用我的人都有发言权**。

## 8. 没解决 / 准备解决的问题

诚实地讲,v5 也不是终点。**仍然存在**的问题:

- **长 Token 被盗后的 1-2 小时** —— 即使我能在刷新时阻止恶意刷新,但攻击者只要 1 次成功的刷新就能延续会话。需要绑定设备指纹 / IP 段(成本高、误伤多)。
- **管理员"批量改权限"** —— 一次性给 1 万用户改角色,要写 1 万条 deny 记录吗?可能需要"全局 deny 时间戳"的版本,但那又会触发所有人刷新,数据库扛不扛得住?
- **多租户隔离** —— 当前 deny key 是 `auth:deny:{login_id}`,租户不参与构造。在多租户深度隔离场景下,租户的 deny 应该挂在租户上下文里。
- **Passkey / WebAuthn** —— 表已经在 schema 里(`sys.passkey_credential`),但接入流没写。

## 9. 最后

如果你也在做认证授权,**不要照抄 v5**。先想清楚自己的诉求是什么:

| 你的诉求 | 推荐做法 |
|---|---|
| 内部小后台,QPS 不高 | v1 Session 就够了 |
| 中等规模,要"踢人下线" | v4 双 Token,关掉 deny check |
| 中等规模 + 角色经常变 | v5 双 Token + deny check |
| 大规模 + 强一致 | 别用 JWT,上专门的 IDP(Auth0 / Keycloak) |

技术决策不是按"先进度"排,是按**约束条件**排。

希望这篇能帮到正在踩坑的你。也欢迎 [开 issue](https://github.com/ouywm/summerrs-admin/issues) 来吐槽我哪一步又走错了 —— 也许下次就有 v6 了。

---

## 进一步阅读

- 上手教程:[认证与授权](/guide/core/auth)
- 整体架构:[整体架构](/guide/architecture/overview)
- 源码入口:`crates/summer-auth/src/lib.rs`
- 关键文件:
  - `crates/summer-auth/src/middleware.rs` —— 中间件层
  - `crates/summer-auth/src/strategy.rs` —— JWT 策略
  - `crates/summer-auth/src/storage/` —— deny / refresh 状态存储
  - `crates/summer-auth/src/bitmap.rs` —— 权限位图
  - `crates/summer-admin-macros/src/auth_macro.rs` —— `#[has_perm]` 宏展开
