---
title: I rewrote my auth layer five times
description: From Redis sessions to dual tokens, bitmaps, and per-request deny checks — five rewrites of the summerrs-admin auth layer.
date: 2026-05-04
authors: ['ouywm']
sidebar: false
pageType: doc-wide
---

# I rewrote my auth layer five times

> From sessions to dual tokens, bitmaps, and per-request deny checks.
>
> A **first-person retrospective**, not a "how to do auth right" essay.
>
> I'll walk through the **five versions** the `summerrs-admin` auth layer went through — what I disliked at each stage, why I changed it, and what new problems showed up. If you're building something similar, this might save you a few months of wandering.

## 0. Where I landed

The current shape:

```mermaid
flowchart LR
    A[Login] --> B[Access token: business calls]
    A --> C[Refresh token: token swap only]
    C --> D[(Redis: auth:refresh:rid)]
    B -->|every request| E{deny check toggle}
    E -->|off| F[Pure local check<br/>0 Redis]
    E -->|on| G[GET auth:deny:login_id]
    G -->|banned| H[Reject]
    G -->|refresh:ts| I[Tell client to refresh]
    G -->|none| J[Allow]
```

Four keywords: **dual tokens / access token serves business / bitmap-compressed permissions / optional per-request deny check**.

To explain why it ended up this shape, I have to start from the most naive v1.

## 1. v1: Plain sessions, Redis on every request

I started simple. Login issues a UUID, the user info goes into Redis with that UUID as key, every request brings the UUID, the middleware fetches user info from Redis and stuffs it into request extensions.

```text
# Login
POST /auth/login
→ generate uuid → set("session:{uuid}", user_info_json) → return uuid

# Business
GET /api/user/info  Authorization: Bearer {uuid}
→ middleware get("session:{uuid}") → parse user_info → req.extensions_mut().insert(user_info)
→ handler reads it directly
```

Pros are obvious: **simple**. One GET per check, kick is one DEL, change permissions by overwriting the value, business code reads whatever it needs.

But pretty quickly I felt off:

> **Every single request** — list pages, config changes, button clicks — runs a Redis round-trip.

At 10 QPS who cares. At scale, Redis is a hotspot. And fundamentally this is just **session-cookie auth wearing a JWT-shaped costume**. I wrote a bunch of Rust on axum and ended up with the same shape as `$_SESSION` from PHP days.

> **Pain point**: Mandatory Redis on every request. Doesn't scale.

## 2. v2: I read open-source admin code. I couldn't follow their trade-offs.

Time to see how others do it. I opened a few thousand-star admin projects and decoded the tokens they hand out. **The results surprised me.**

> **A disclaimer up front:** the projects below are thousand-star, production-running, mature systems.
> "I can't follow their trade-offs" ≠ "they got it wrong" — they almost certainly carry constraints I can't see (legacy weight, team habits, compatibility with some frontend SDK, compliance / audit requirements).
>
> I'm only saying that **as a brand-new project starting from zero**, I can't copy these designs — not for moral reasons, but because once I copy them I can't explain *why* each field exists.

### 2.1 Classic flavor: JWT wrapping a UUID

Many projects return tokens like:

```text
eyJhbGciOiJIUzUxMiJ9.eyJsb2dpbl91c2VyX2tleSI6IjQ3NzIwZGE3LTBlOWItNDdhYy05YzhlLWRlOWU1ZjFkMjRkNCJ9.UhQ06KUza2WDxLz3-7L_kZIgzGxnnFLKUIB8No4ld3QDGoR5L9qJkaOvbh8BDYRwLxC12T4y7yUuing1ykmjLw
```

Decoded payload:

```json
{
  "login_user_key": "47720da7-0e9b-47ac-9c8e-de9e5f1d24d4"
}
```

**One field. One UUID.** That UUID is the Redis key for fetching user info.

I can't see the upside. How is this different from my v1, fundamentally? **The only difference is wrapping the UUID in JWT**:

- No user info in the token (still hits Redis)
- No expiry field (no `exp` in payload)
- No refresh token

So why bother? **You pay signing/verification cost without getting any of the benefits JWT was designed to give**. HMAC prevents UUID tampering — but a UUID is already an unguessable random string; a tampered one just won't match anything.

The only visible "benefit" is matching the expectation that "modern projects use JWT." **That's aesthetics, not engineering.**

### 2.2 Frankenstein flavor: JWT with sessionId + tokenVersion

Some go further:

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

JWT with `sessionId`. Plus `tokenVersion` (for global invalidation?). Plus access/refresh distinction.

Now you maintain **two worlds**:

- JWT signature + expiry verification
- sessionId → Redis lookup (no savings)
- tokenVersion in some table

If your business genuinely demands this kind of "dual state" (think finance, or compliance rules requiring forced logout), the combo is actually **a reasonable compromise** — keep JWT's portability, but retain a central control point via sessionId/tokenVersion. For a generic admin panel though, **complexity doesn't match the payoff** — and if I copy it, I won't be able to articulate the contract of each field.

### 2.3 Raw UUID flavor

Some don't bother with JWT at all. Login returns UUID, straight to Redis.

Identical to my v1, **same problems**. I actually like this one better — at least it's not pretending to be "stateless."

> **After looking around, I didn't find what I wanted.** Most projects either don't use JWT's stateless property (treating it as a random-string wrapper) or pull state right back in (JWT carrying sessionId).
>
> So I decided to **go to the other extreme** — if I'm going to use JWT, I'll use it all the way. **Stuff all the user info in the payload.**
>
> Enter v3.

## 3. v3: Stuff user info in the JWT payload, truly stateless

JWT's selling point is **claims** — the server signs data into the token, the client carries it back, **no lookups needed**.

People are nervous about this because the payload is base64 ("not safe!"). **But JWT was never meant to encrypt** — its guarantee is "you can't forge it," not "you can't read it." So **only put non-sensitive info** there.

I put basic user info in:

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
    "...200 more"
  ],
  "tenant_id": 1,
  "iat": 1777900825,
  "exp": 1778505625
}
```

Middleware verifies the signature and reads `roles` / `perms` from claims, **zero Redis interactions**.

This is real statelessness. Latency dropped.

But after some time, **two new problems surfaced**:

### 3.1 User info changes don't propagate

I changed Admin's role from `R_SUPER` to `R_USER` in the backend, but the user's existing token still carried `R_SUPER` in claims, **continuing to call APIs as super-admin**.

Until the token expires (default 2 hours) and the user logs in again, they keep their old role.

Can the business tolerate 2-hour delays? **Not for sensitive operations.**

### 3.2 Tokens grow absurdly long

A super-admin with 200+ permission codes becomes a giant JSON array in claims. Base64-encoded JWT exceeds **4 KB**, sent in `Authorization` header on every request.

Many reverse proxies cap headers at 8 KB. **Any larger and you get 502.** CDN cache keys explode too.

> **Pain point**: Stateless → stale info + token bloat.

## 4. v4: Dual tokens, 5-minute rotation

I started looking at dual tokens (access + refresh). Access tokens are short — **5-10 minutes**. Refresh tokens are longer — **1-2 hours** (or more), used only to swap for new access tokens.

Industry benefits:

- **Access token leak window is short** — useless after 5 minutes
- **Business calls have zero Redis** — same as v3
- **Updates have a window** — change a role, **within 5 minutes** the new access token reflects it

### 4.1 My dual-token design

**Access token** (business): claims carry user info + roles + permission bitmap (covered later)

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

**Refresh token** (swap only): payload is just a `rid`

```json
{
  "sub": "1",
  "typ": "refresh",
  "iat": 1777902133,
  "exp": 1778506933,
  "rid": "6c210c41-9f69-479f-8996-564f867df7e8"
}
```

**Two Redis keys, each with a job** (I mixed these up myself at first):

```text
# 1. Reverse index: rid → which user/device does this rid belong to?
key:   auth:refresh:6c210c41-9f69-479f-8996-564f867df7e8
value: "1:web"              # plain "login_id:device" string

# 2. Per-device session info: one per (user, device)
key:   auth:device:1:web
value: {
  "rid": "6c210c41-9f69-479f-8996-564f867df7e8",
  "login_time": 1777738168557,
  "login_ip": "127.0.0.1",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ..."
}
```

Why split?

- **`auth:refresh:{rid}`** — on refresh you only have a refresh token; you need to look up login_id + device from the rid. Keep the value as simple as possible — `"1:web"` is enough.
- **`auth:device:{login_id}:{device}`** — drives "online devices" list, and makes device cleanup atomic (read the current rid, delete the refresh key along with it).

Both are strings, not hashes. **Kicking one device touches exactly two keys** — no clever data structure needed.

### 4.2 Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant R as Redis

    Note over C,S: Login
    C->>S: POST /auth/login (username/password)
    S->>S: verify password → fetch user/role/perm
    S->>R: SET auth:refresh:{rid} { login_time, ip, ua }
    S-->>C: { access_token, refresh_token }

    Note over C,S: Business (zero Redis)
    C->>S: GET /api/x  Bearer {access_token}
    S->>S: verify signature + exp + read claims
    S-->>C: 200

    Note over C,S: Access expired
    C->>S: GET /api/x  Bearer {expired_access}
    S-->>C: 401 TOKEN_EXPIRED

    Note over C,S: Refresh (one-shot)
    C->>S: POST /auth/refresh  Bearer {refresh_token}
    S->>S: verify signature + parse rid
    S->>R: GET auth:refresh:{rid}
    R-->>S: "login_id:device"
    S->>R: GET auth:deny:{login_id}
    R-->>S: reject only if "banned"
    S->>S: fetch latest user/role/perm
    S->>R: SET auth:refresh:{new_rid} ... (write new first)
    S->>R: DEL auth:refresh:{old_rid} (then delete old)
    S->>R: update auth:device:{login_id}:{device}.rid
    S-->>C: { new_access_token, new_refresh_token }
```

Key designs:

1. **Refresh token is one-shot** — used once and burned, intercepted reuse fails
2. **Write new key before deleting old** — if the server crashes mid-rotation, the old refresh key lingers under its TTL; users don't hit "I just refreshed and got 401"
3. **Refresh re-fetches user info** — solves v3's stale-role problem
4. **Refresh only rejects `banned`, not `refresh:{ts}`** — banned blocks refresh; a `refresh:{ts}` deny marker exists *specifically so that refreshing consumes it*, so refresh must pass through
5. **Business APIs are pure JWT** — same as v3, zero Redis

### 4.3 Looks perfect? New problems.

After running for a while:

**Problem 1: Refresh hits the DB every time**

Refresh fetches user, role, permissions — multiple JOINs. With active users refreshing every 5 minutes, **DB load creeps up again**.

**Problem 2: Tokens still long**

200 permission codes in `"perms": [...]` is still a few KB.

**Problem 3: The hijack window is bigger than I thought**

If an attacker grabs the **refresh token** and uses it before the victim does, they get a fresh access + refresh pair. The victim's next refresh fails because their refresh token has been overwritten → logged out.

The victim only finds out **at next refresh time**, when their refresh fails. The exposure window is up to **access + refresh lifetime**.

## 5. v5: Bitmap + per-request deny check

For v4's three problems, I patched each.

### 5.1 Permission bitmap: 200-line array → 8 bytes

Permission code strings can't be compressed. But I noticed:

> A project's **permission set is finite and rarely changes**. At startup I have the full list.

So assign each permission a bit:

```text
At startup:
  SELECT id, perm, bit_position FROM sys.menu;
  perm_index: HashMap<String, usize> = {
    "system:user:list" → 0,
    "system:user:add"  → 1,
    "system:user:edit" → 2,
    ...
    "ai:relay:chat"    → 187
  }

On user login:
  user_perms = [system:user:list, system:user:add, ai:relay:chat, ...]
  bitmap = bits_or(user_perms.map(perm_index))
  // 200-bit map, stored as Vec<u8>, base64 ~ 30-40 chars
```

JWT payload becomes:

```json
{
  "sub": 1,
  "username": "Admin",
  "roles": ["R_SUPER"],
  "pb": "AH74ARw="
}
```

`"pb"` is the base64-encoded bitmap. **Permission info shrinks from KB to tens of bytes.**

Permission check (abstracted from `crates/summer-auth/src/session/manager.rs::validate_token`):

```rust
// 1. Decode the pb field back to Vec<String>
let permissions = bitmap::decode(pb, &perm_map);

// 2. Then wildcard-match (supports *, system:*, system:*:list)
fn permission_matches(owned: &str, required: &str) -> bool {
    // exact / super * / trailing * / middle * / segment count check
}
```

Note: there's **no "user_bitmap & required_bitmap" pure bit operation** here. Reason: wildcard semantics (`system:*:list`) can't be expressed by bitmaps alone — you have to decode back to strings for matching. **The real value of the bitmap is token-size compression, not matching speed** (string matching itself runs in a few hundred nanoseconds; the bottleneck isn't there).

The `sys.menu` table got a `bit_position` column, loaded into memory at startup. **Menu rarely changes in production**, so reload-on-restart (or via broadcast) is fine.

Compatibility: **string permission codes are still supported** for cases like MCP tool calls and external webhooks where bitmap doesn't fit.

### 5.2 per-request deny check: a config knob for real-time

> **Core idea: a deny key is not a "killer," it's a state broadcaster.**
>
> It doesn't tell the request "die." It tells the request "your client-side state is stale, go refresh." That's why deny checks tolerate eventual consistency — 99% of paths miss, only 1% actually hit and trigger the client to renegotiate.
>
> Every key in this section — `banned` / `refresh:{ts}` / `login_id` / `device` — is the same idea in a different shape.

The cost of stateless JWT is **you can't change an issued token**. I added a switch:

```toml
[auth]
per_request_deny_check = true   # default false; on = one Redis lookup per request
```

When on, the middleware adds:

```rust
fn deny_key(login_id: &LoginId) -> String {
    format!("auth:deny:{}", login_id.encode())
}

if self.config.per_request_deny_check
    && let Some(deny_value) = self.storage.get_string(&deny_key(&login_id)).await?
{
    match deny_value.as_str() {
        "banned" => return Err(AuthError::AccountBanned),
        v if v.starts_with("refresh:") => {
            // Timestamp scheme: token's iat <= deny ts → must refresh
            // Tokens issued after the deny (iat > deny_ts) pass through
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

This handles **two needs**:

#### 5.2.1 Blocklist: `banned`

Admin marks a user as banned → write `auth:deny:{login_id} = "banned"` → all their requests are rejected immediately.

> **Doesn't depend on token expiry.** The very next request takes effect.

#### 5.2.2 Force-refresh: `refresh:{ts}`

This is the gem. When I change a user's role, **I don't have to kick them off**. I just write:

```text
SET auth:deny:{login_id} = "refresh:1777902800"
```

This says: **any token with iat earlier than 1777902800 must refresh**.

Then:

- User's current access token was signed 5 minutes ago (iat = 1777902500) → match → return `RefreshRequired`
- Frontend sees the error → calls `/auth/refresh` automatically
- Refresh fetches latest role → new access token with iat = 1777902800+ → no longer matches deny → works

**Zero user-facing disruption**. Worst case is a 1-second blip while the frontend handles the refresh.

```mermaid
sequenceDiagram
    participant Admin as Admin Panel
    participant Server as Server
    participant Redis as Redis
    participant Client as User Browser

    Admin->>Server: Modify user #42's role
    Server->>Redis: SET auth:deny:42 "refresh:{now_ts}"

    Note over Client: Next request within 5 min
    Client->>Server: GET /api/x  Bearer {old_access_token}
    Server->>Server: verify OK, iat=ts1
    Server->>Redis: GET auth:deny:42
    Redis-->>Server: "refresh:ts2"
    Server->>Server: ts1 <= ts2 → reject
    Server-->>Client: 401 REFRESH_REQUIRED

    Client->>Server: POST /auth/refresh
    Server->>Server: fetch latest role, sign new token (iat=now)
    Server-->>Client: { new_access, new_refresh }

    Client->>Server: GET /api/x  Bearer {new_access}
    Server->>Redis: GET auth:deny:42
    Redis-->>Server: "refresh:ts2"
    Server->>Server: now > ts2 → allow
    Server-->>Client: 200
```

> **One deny entry, and every token issued before that moment automatically picks up the new role on the next request.** This is the bit of the design I'm proudest of.

#### 5.2.3 deny TTLs are not the same

| Value | TTL | Why |
|---|---|---|
| `refresh:{ts}` | `access_timeout` (2h) | After that window every token with iat ≤ ts has naturally expired; the deny entry has nothing left to guard |
| `banned` | **365 days** | Ban is an explicit state; it shouldn't auto-unban via TTL. Cleared only by explicit `unban_user()` |

I earlier claimed "deny always uses access_timeout" — that's wrong. **`banned` must be long-lived**, otherwise a user banned a year ago would un-ban themselves when TTL expires. Not great.

#### 5.2.4 Refresh does NOT delete the deny key

This one I learned the hard way. My first implementation deleted the deny key after a successful refresh, thinking "user has the new token, deny is useless now."

Multi-device reality broke it instantly:

```text
1. Admin changes user #42's role → SET auth:deny:42 "refresh:t0"
2. Device A's old token hits RefreshRequired → auto-refresh → new token
3. Refresh succeeded, so I deleted deny:42
4. Device B's old token arrives → GET auth:deny:42 returns nothing → allowed through
5. Device B still runs with the stale role!
```

The fix: **don't delete the deny key on refresh; let it expire via TTL**. Within that window, every device's old token is forced to refresh at least once.

```rust
// crates/summer-auth/src/session/manager.rs::refresh
// 10. Do NOT delete the deny key; let it expire naturally. This fixes the
//     multi-device race: every device must refresh to pick up the new role.
```

Cost: `auth:deny:{login_id}` survives an extra `access_timeout` (~2h). Tens of bytes per user. Fine.

### 5.3 The "gentle" semantics of logout / kick

I iterated on this a few times; it deserves its own section.

The naive "kick off" pattern is: blocklist the target device's token, every request from that device returns 401. **But in a multi-device world, that's too blunt**:

> The user is logged in on Web, Android, and iOS. They click "logout" on Web. Did they mean to log out of Android and iOS too? Obviously not.

The current implementation:

```rust
// crates/summer-auth/src/session/manager.rs::logout
pub async fn logout(&self, login_id: &LoginId, device: &DeviceType) -> AuthResult<()> {
    // 1. Clean up the target device: delete device key + its refresh key (hard exit)
    self.cleanup_device(login_id, device).await;

    // 2. Write a login_id-scoped deny entry with value "refresh:{ts}"
    let deny_value = format!("refresh:{}", chrono::Local::now().timestamp());
    self.storage
        .set_string(&deny_key(login_id), &deny_value, self.config.access_timeout)
        .await?;
    Ok(())
}
```

Step 2 is the subtle part: **logging out one device writes a login_id-scoped deny**. It might look like it "spills over" to other devices, but since the value is `refresh:{ts}` (not `banned`):

| Device | Behavior |
|---|---|
| **The one you just logged out** | refresh key is gone; refresh attempts fail → genuine logout |
| **Other devices still in use** | old token hits deny → `RefreshRequired` → frontend auto-refreshes → new token, **no interruption** |

So **one key serves three semantics**: logout / force_refresh / ban. The comment in the code says it best:

```rust
// Design note: deny key is keyed by login_id. A single-device logout will make
// other devices' old tokens trigger RefreshRequired. They auto-refresh with no
// disruption, and in return validate_token / force_refresh / ban all touch one key.
```

I only fully appreciated the deny key after writing this part — **it isn't a "blocker," it's a "rotation trigger."**

### 5.4 The toggle cost

With `per_request_deny_check = true`, **every request** does one Redis GET. Aren't we back to v1?

Not really. The differences:

| Dimension | v1 Session | v5 deny check |
|---|---|---|
| Redis healthy | GET must succeed before allowing | Missing key = allow (default fast path) |
| Redis down | Whole site dead | Fail-open with logging |
| Response data | Full user_info JSON | A short string (`banned` or `refresh:ts`) |
| Per-second QPS | Site QPS × 1 | Site QPS × 1 (but lighter) |

More importantly: **it's a toggle**. Off → v4 zero-Redis mode; On → real-time.

> Engineering trade-off: **Hand operators a knob, not a silver bullet.**

## 5.5 The deny key in one table

For comparison, here are the three deny states side by side:

| Trigger | Deny value | TTL | Refresh blocked? | Business blocked? |
|---|---|---|---|---|
| `force_refresh()` after role change | `refresh:{ts}` | 2h | ❌ no (let refresh consume it) | ✅ old tokens get RefreshRequired |
| `logout(device)` | `refresh:{ts}` | 2h | ❌ no | ✅ old tokens get RefreshRequired (other devices auto-refresh) |
| `logout_all()` | `refresh:{ts}` + delete all device/refresh keys | 2h | ❌ no, but refresh keys are gone, so it fails anyway | ✅ same |
| `ban_user()` | `banned` | 365d | ✅ **blocked** (account disabled) | ✅ direct 403 |
| `unban_user()` | (DEL) | — | — | — |

Writing this out, I realized: **the whole deny mechanism collapses three concerns — online state, refresh rotation, ban — into a single Redis string**. That kind of "one thing, three uses" minimalism is what Redis is good at.

## 6. Five-version comparison

| Version | Shape | Redis | Real-time | Token size | My take |
|---|---|---|---|---|---|
| **v1** Session | UUID + full user_info in Redis | **1 per request** | Edit Redis = instant | UUID, tens of bytes | Simple, doesn't scale |
| **v2** JWT-wraps-UUID | JWT payload is just the uuid | **1 per request** | Same as v1 | Hundreds of bytes (with JWT) | No win, just signature overhead |
| **v3** Full claims | User info in JWT | **0** | **Wait for token expiry** | Several KB | Fast but stale |
| **v4** Dual tokens | Access for biz / Refresh swaps | **0 biz, 1 refresh** | 5-10 min rotation | Access still KB | Better than v3 but token bloat + DB pressure |
| **v5** Bitmap + deny | v4 + bitmap + optional deny | **0 (default) / 1 (deny on)** | Instant (deny on) | **Tens of bytes** | Where I am now |

## 6.5 Why this works — state distribution, not layering

I'm not drawing a pyramid here, because these four things aren't an upstream/downstream stack. They're **orthogonal responsibilities**. A single business request **does not traverse four layers** — it walks a flat path, but at each step on that path sits a piece of state with its own frequency and consistency profile:

```text
Auth state distribution (responsibilities, not layers):

  ┌─ access token   stateless: pure local decode + signature check, 0 IO
  │                 frequency = every business request (QPS)
  │
  ├─ refresh token  hard state: must hit Redis
  │                 frequency = once per ~15 min  (≈ QPS / 4500)
  │
  ├─ deny check     soft state: 99% miss, 1% triggers a client refresh
  │                 frequency = 0 by default; 1 GET per request when on
  │
  └─ bitmap         static state: handed out at login, never queried at runtime
                    frequency = 0
```

Average per business request: **1 signature check + ε Redis lookups**.
ε depends on the deny toggle: off → 0; on → 1 lightweight GET (with extreme miss rates).

The essence of this design is: **scatter state across positions by mutation frequency, instead of cramming it all into one synchronous interceptor**.

This is also why I've opposed "stuff user_info into JWT" since v3 — that ties low-frequency static info to high-frequency signature checks. Changing user_info means waiting for every token to expire. Putting two different frequencies into the same slot is what made v3 fundamentally wrong.

## 7. What I learned

If I had to compress five iterations into a few lines:

1. **JWT is not a session-wrapper.** JWT's value is **readable claims + no server lookup**. If your JWT payload is just a UUID and you still hit Redis, just use a UUID.

2. **Stateless and real-time are at odds.** Want stateless → accept staleness. Want real-time → accept lookups. Don't try to have both — give the operator a switch (`per_request_deny_check`) or compromise via dual tokens.

3. **Dual tokens aren't about "security," they're about evolvability.** Access tokens are short enough to tolerate small leaks; refresh tokens are one-shot and carry the rotation signal. "Security" is a vague word — what dual tokens actually do is **shrink the user-perceived loss window**.

4. **`refresh:{ts}` is the design I'm proudest of.** A timestamped string that precisely invalidates "tokens issued before this moment" without kicking the user. It's basically **CAS thinking** applied to tokens — "I know when your token was signed; if it's not after my deny moment, you should refresh."

5. **Bitmap compression isn't a flex; it's forced by token bloat.** Watching a 4 KB Authorization header trigger 502s on the reverse proxy taught me where "inline data" physically ends. Every inlined claim deserves the question: "Can this stay under 1 KB?"

6. **Config toggles are an engineering courtesy.** I used to want "the optimal solution." But every team's SLA, compliance, and performance bias differ. `per_request_deny_check` defaults off; you turn it on. Just like `concurrent_login` defaults on; you turn it off. **Give every adopter a vote.**

## 7.5 This is not a universal solution

I owe you a counter-current paragraph here — this stack **is genuinely complex**: dual tokens + bitmap + deny + device + refresh ts + a per-request switch + tiered TTLs. Stacked together, it does feel like a "combo punch."

I built it because `summerrs-admin` simultaneously carries three concrete needs: **multi-tenant isolation, AI Gateway rate-limiting / billing, and admin-side force-kick**. Each one wants its own state machine. If your scenario doesn't have these, **don't copy this stack**. Concretely:

| Your scenario | What I'd suggest |
|---|---|
| DAU < 1k, single-tenant, internal tool | A single JWT + Redis blocklist is enough. Skip deny / bitmap entirely. |
| No "admin force-kick / instant ban" requirement | Drop the deny system, keep v4 dual tokens. |
| Permission dimensions < 30 | The bitmap is a pessimization. Just use `Vec<String>`. |
| Single-device login, no concurrency | The refresh flow simplifies dramatically. No need for the device dimension. |
| You already have a mature OAuth provider | Integrate it. Don't roll your own. |

My design **was pushed by the business**, not architected upfront. Each layer was added after the previous one hit a wall. This path may not fit you — but if you've hit the same wall, this post might save you a few months.

## 8. Unsolved / planned

To be honest, v5 isn't the end either.

- **The 1-2 hour window after refresh-token theft** — refresh-time checks block malicious refreshes, but one successful malicious refresh continues the session. Device fingerprinting / IP-binding helps, at the cost of false positives.
- **Bulk permission changes** — changing roles for 10,000 users — do you write 10,000 deny entries? A "global deny timestamp" version exists, but that triggers everyone's refresh at once — DB pressure?
- **Multi-tenant isolation** — current deny key is `auth:deny:{login_id}`; tenant context isn't part of it. Deep-isolation tenants might want per-tenant deny.
- **Passkey / WebAuthn** — schema is there (`sys.passkey_credential`), flow isn't.

## 9. Closing

If you're building auth, **don't just copy v5**. Figure out your needs first:

| Your need | Recommendation |
|---|---|
| Internal admin, low QPS | v1 sessions are enough |
| Medium scale, need kick-out | v4 dual tokens, deny check off |
| Medium scale, frequent role changes | v5 dual tokens + deny check on |
| Large scale, strong consistency | Don't roll your own — use a real IDP (Auth0 / Keycloak) |

Technical decisions aren't ranked by sophistication; they're ranked by **constraints**.

Hope this helps anyone going through similar wandering. Feel free to [open an issue](https://github.com/ouywm/summerrs-admin/issues) and tell me where I'm still wrong — maybe v6 is around the corner.

---

## Further reading

- Tutorial: [Auth & Authorization](/en/guide/core/auth)
- Architecture: [Architecture Overview](/en/guide/architecture/overview)
- Source: `crates/summer-auth/src/lib.rs`
- Key files:
  - `crates/summer-auth/src/middleware.rs` — middleware layer
  - `crates/summer-auth/src/strategy.rs` — JWT strategy
  - `crates/summer-auth/src/storage/` — deny / refresh state
  - `crates/summer-auth/src/bitmap.rs` — permission bitmap
  - `crates/summer-admin-macros/src/auth_macro.rs` — `#[has_perm]` macro
