---
description: Verify OpenAPI, auth APIs, protected APIs, and the embedded MCP endpoint after the service starts.
published_at: 2026-04-26 09:30:00
---

# Verify After Startup

Once `cargo run -p app` is already running, verify the service in the following order. It is the fastest way to confirm three things: the service is alive, authentication works, and the MCP route is mounted.

## 1. Open OpenAPI first

Visit:

```text
http://localhost:8080/api/docs
```

If the page opens successfully, at least these parts are working:

- The web service is listening on `8080`
- The `/api` global prefix from `config/app-dev.toml` is active
- The OpenAPI documentation route is mounted by the main app

## 2. Verify the login API

The auth route is defined in `crates/summer-system/src/router/auth.rs`, and the actual endpoint is:

```text
POST /api/auth/login
```

You can send a request with the default test account:

```bash
curl -X POST 'http://localhost:8080/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "userName": "Admin",
    "password": "123456"
  }'
```

If the request succeeds, the response should contain:

- `accessToken`
- `refreshToken`
- `expiresIn`

## 3. Call a protected API with the access token

After getting the token, call a protected system-domain API such as:

```text
GET /api/user/info
```

Example:

```bash
curl 'http://localhost:8080/api/user/info' \
  -H 'Authorization: Bearer <your-access-token>'
```

This mainly verifies:

- JWT issuing and parsing are working
- The `summer-auth` middleware is active
- User, role, and permission data in the database can be read successfully

## 4. Confirm the embedded MCP route

In the current development configuration, MCP uses embedded HTTP mode. The combined default endpoint is:

```text
http://localhost:8080/api/mcp
```

Unlike OpenAPI, this is not a page intended for direct browsing. It is meant for MCP clients. In practice, this tells you:

- The main app has mounted `summer-mcp`
- The table tools and generation utilities documented later come from the same crate, whether you use embedded mode or standalone mode

If you want to verify MCP separately, you can also run:

```bash
cargo run -p summer-mcp --features standalone --bin summerrs-mcp -- \
  --database-url 'postgres://admin:123456@localhost/summerrs-admin'
```

The default standalone endpoint is:

```text
http://127.0.0.1:9090/mcp
```

## 5. Optional: verify the AI-compatible endpoint

The main app already mounts `SummerAiRelayPlugin`, and the repository shows an OpenAI-compatible path such as:

```text
POST /v1/chat/completions
```

But this usually also depends on:

- The `ai` schema tables being initialized
- At least one valid runtime setup for channel, account, key, and related data

So the first edition does not treat this as a mandatory startup check. A safer order is to verify the system-domain APIs and MCP first, then move on to AI routes.

## 6. Common blockers

- OpenAPI does not open: check the `[web]` and `[web.openapi]` sections in `config/app-dev.toml`, then confirm the app is really listening on `8080`
- Login fails and database errors appear: confirm `sql/sys/*.sql` has been imported, especially `user.sql`, `role.sql`, and `user_role.sql`
- Startup fails on object storage: check `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and whether `http://localhost:9000` is reachable
- MCP client cannot connect: confirm whether you are using the embedded `/api/mcp` route or the standalone `:9090/mcp` endpoint

Next, continue to [Module Overview](/guide/start/module-overview).
