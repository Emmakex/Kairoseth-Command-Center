# 15 — Standalone authentication and Today / Autenticación standalone y Today

## Purpose / Objetivo

Kairoseth Command Center must remain usable as an independent software product. The standalone path therefore cannot depend on Kairoseth Platform Identity.

Kairoseth Command Center debe poder utilizarse como producto de software independiente. Por ello, el modo standalone no puede depender de Kairoseth Platform Identity.

## Current Phase 3 implementation / Implementación actual de fase 3

- `KCC_AUTH_MODE=local` enables the local standalone owner.
- The local owner is configured explicitly through environment variables.
- The API never ships a production password or signing secret.
- Login is performed through `POST /v1/auth/local/login`.
- Successful login returns a short-lived signed bearer token.
- The browser never stores the bearer token in local storage; the Next.js web layer stores it in an HTTP-only, SameSite=Lax cookie.
- The web layer forwards the bearer token server-to-server when calling the Command Center API.
- `/v1/session` remains the canonical resolved-session endpoint.
- Workspace/private authorization continues to be derived on the server from the resolved session.
- The standalone owner receives the normal `owner` capability preset and only the `command-center` product entitlement.
- Tokens are HMAC-SHA256 signed and include issue/expiry timestamps, user ID and workspace ID.
- Changing the signing secret invalidates existing sessions.

## Required local configuration / Configuración local necesaria

At minimum set:

```env
KCC_AUTH_MODE=local
KCC_LOCAL_ADMIN_EMAIL=admin@example.com
KCC_LOCAL_ADMIN_PASSWORD=<strong password, at least 12 characters>
KCC_LOCAL_AUTH_SECRET=<random secret, at least 32 characters>
```

Recommended installation-specific values:

```env
KCC_LOCAL_ADMIN_DISPLAY_NAME=Local Owner
KCC_LOCAL_LOCALE=es
KCC_LOCAL_TIMEZONE=Europe/Madrid
KCC_LOCAL_USER_ID=local-owner
KCC_LOCAL_WORKSPACE_ID=local-workspace
KCC_LOCAL_WORKSPACE_NAME=Local Workspace
KCC_LOCAL_SESSION_TTL_SECONDS=43200
```

Do not reuse the example password/secret values from `.env.example` in a real deployment.

No reutilizar en una instalación real los valores de ejemplo de contraseña/secreto incluidos en `.env.example`.

## Web flow / Flujo web

1. User opens `/es` or `/en`.
2. If no valid HTTP-only session cookie exists, the web redirects to `/{locale}/login`.
3. The login form posts to the Next.js route `/api/auth/login`.
4. Next.js calls the API local-login endpoint server-to-server.
5. The returned bearer token is written to the HTTP-only cookie.
6. The Today dashboard calls `/v1/session` and `/v1/today` from the server layer.
7. The user can switch between workspace and private scope without supplying tenant/user IDs.
8. Logout clears the HTTP-only cookie.

## Today first useful UI / Primera UI útil de Today

The connected Phase 3 Today screen exposes:

- active projects;
- open tasks;
- tasks due today;
- blocked tasks;
- open alerts;
- urgent alerts;
- project progress;
- task priority;
- active alert summaries;
- workspace/private switch;
- ES/EN navigation.

This is intentionally a manual-use slice. Quick Capture and full CRUD operational surfaces remain separate follow-up work.

Esta entrega está diseñada intencionadamente como primer flujo de uso manual. Quick Capture y las superficies CRUD completas continúan como trabajo posterior.

## Security boundaries / Límites de seguridad

1. Local credentials are never accepted as authorization scope.
2. The signed token does not grant an arbitrary workspace; it is checked against the server-configured local session.
3. A token with a modified payload or signature is rejected.
4. Expired tokens are rejected.
5. The browser cookie is HTTP-only and SameSite=Lax.
6. Production deployments should serve the web over HTTPS so the cookie is marked Secure.
7. `KCC_AUTH_MODE=disabled` is intended for CI/runtime smoke tests only and does not make protected APIs public; protected routes still return unauthorized because no auth provider is installed.

## Next hardening / Próximo endurecimiento

- persistent multi-user local identities instead of the single-owner bootstrap;
- password hashing and password-change flow backed by local persistence;
- optional OIDC for self-hosted deployments;
- login rate limiting and lockout policy;
- CSRF hardening for future state-changing browser forms;
- explicit session revocation list if required by the deployment model.
