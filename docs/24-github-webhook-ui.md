# 24 — GitHub webhook administration UI / Administración de webhook GitHub

## Goal / Objetivo

Expose the already-proven verified GitHub webhook lifecycle inside Work Manager without changing the webhook trust model or adding OAuth.  
Exponer dentro de Gestor de Trabajo el ciclo de webhooks GitHub verificados ya probado, sin cambiar el modelo de confianza ni añadir OAuth.

## Slice 5j scope / Alcance de Slice 5j

Workspace administrators with `integrations.manage` can:

- read safe webhook metadata for each GitHub connection;
- provision one webhook endpoint for an active validated connection;
- view the opaque payload path and HMAC secret once immediately after provisioning;
- rotate the webhook HMAC secret and view the replacement once;
- remove the webhook endpoint, retained delivery claims and encrypted HMAC secret;
- perform the same workflow in ES or EN.

Los administradores del espacio con `integrations.manage` pueden realizar el mismo ciclo desde la interfaz ES/EN.

## Existing backend boundary / Frontera backend existente

Slice 5j does not add a new webhook backend. It consumes the management endpoints introduced in Slice 5d:

- `GET /v1/integrations/github/connections/:id/webhook`
- `POST /v1/integrations/github/connections/:id/webhook`
- `POST /v1/integrations/github/connections/:id/webhook/rotate`
- `DELETE /v1/integrations/github/connections/:id/webhook`

The API remains authoritative for authentication, active workspace, entitlement, `integrations.manage`, connection validation and webhook persistence.

## One-time secret reveal / Revelado único del secreto

Provisioning and rotation return the HMAC secret exactly once from the API. The web surface preserves that property:

1. the browser posts only the requested administration operation to the server-side web route;
2. the web route calls the authenticated API server-to-server;
3. the returned webhook path + HMAC secret are immediately sealed with AES-256-GCM into short-lived state bound to the current session token;
4. the sealed value is stored only in an `HttpOnly`, `SameSite=Strict` cookie scoped to the reveal route;
5. the browser is redirected without putting the secret or endpoint path into the query string;
6. the reveal route decrypts and validates the state, renders a no-store HTML response, and clears the cookie in the same response;
7. a second visit therefore cannot reveal the secret again.

The sealed reveal state expires after a short bounded interval and rejects tampering, the wrong session token, invalid webhook paths and stale timestamps.

The one-time reveal response uses `Cache-Control: no-store, private`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and a restrictive CSP. Dynamic values are HTML-escaped and the page contains no client-side JavaScript.

## UI behavior / Comportamiento de interfaz

Webhook state is loaded server-side only for workspace users who already have `integrations.manage`.

- `configured`: render the safe opaque payload path plus rotate/delete controls;
- `not-configured`: offer provisioning only when the GitHub connection is active and validated;
- `unavailable`: render a fail-closed status and no webhook mutation controls.

An existing webhook can still be read, rotated or removed if the provider credential is temporarily in error, matching the backend contract. Provisioning a new endpoint still requires a validated active provider connection.

The UI displays only the API payload **path**. It does not guess a public host from the internal API URL. Until automatic registration exists, the administrator combines that path with the deployment's public HTTPS API host in GitHub.

## Manual GitHub configuration / Configuración manual en GitHub

After provision/rotation, the one-time page reminds the administrator to configure:

- **Payload URL:** public HTTPS API host + the displayed `/v1/integrations/github/webhooks/<endpointId>` path;
- **Content type:** `application/json`;
- **Secret:** the one-time HMAC secret;
- **Events:** pull requests, issues, workflow runs and releases.

Recurring polling remains the reconciliation/fallback path for lost deliveries and private/on-prem installations without inbound public HTTPS access.

## Security invariants / Invariantes de seguridad

- GitHub provider tokens and webhook HMAC secrets remain separate credentials.
- Neither credential is placed in URLs, query strings, durable jobs, schedules, signals, alerts or audit events.
- The HMAC secret is not added to normal dashboard state or rendered after the one-time reveal.
- Webhook administration remains workspace-only and requires `integrations.manage` at the API boundary.
- Connection IDs are URL-encoded before entering API paths.
- Destructive webhook removal requires an explicit intended-action value in the web mutation parser.
- The private dashboard does not request or render webhook administration state.
- Exact raw-body HMAC verification, constant-time comparison and replay protection remain unchanged from Slice 5d.

## Acceptance / Aceptación

Slice 5j acceptance uses layered evidence:

1. unit coverage proves provision/rotate/delete mutation parsing, identifier encoding and delete confirmation;
2. unit coverage proves reveal sealing/unsealing, session binding, tamper rejection, expiry and HTML escaping;
3. lint, typecheck and Next build validate the server-only route integration;
4. the existing GitHub verified-webhook Docker smoke remains the authoritative end-to-end proof for provisioning, HMAC verification, rotation, replay protection, refresh enqueue and deletion;
5. the complete repository boundary remains the existing nine GitHub Actions workflows.

## Deliberately deferred / Diferido expresamente

- GitHub App/OAuth authorization;
- automatic webhook registration or removal in GitHub;
- customer-configurable alert rules;
- stale PR/issue policy rules.
