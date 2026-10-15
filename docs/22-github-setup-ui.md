# 22 — GitHub setup UI / Configuración de GitHub

## Goal / Objetivo

Expose the already-proven token-backed GitHub integration lifecycle inside Work Manager without widening the provider or security boundary.  
Exponer dentro de Gestor de Trabajo el ciclo GitHub basado en token que ya está probado, sin ampliar la frontera de proveedor ni de seguridad.

## Slice 5h scope / Alcance de Slice 5h

Workspace administrators with `integrations.manage` can:

- list redacted GitHub connections;
- create a connection by submitting a display name and provider token;
- validate an existing connection against the trusted GitHub adapter;
- list GitHub repository links;
- link a repository to an existing Work Manager project;
- bind a linked repository to a validated GitHub connection;
- trigger the existing manual repository sync;
- inspect normalized connection/repository status in ES or EN.

Los administradores del espacio con `integrations.manage` pueden realizar las mismas operaciones desde la interfaz ES/EN.

## Security boundary / Frontera de seguridad

- Provider tokens are write-only from the web surface.
- Tokens are submitted only in the POST request body and never placed in URLs.
- The browser-facing route forwards mutations server-side using the authenticated session cookie.
- The API remains the authority for `integrations.manage`, workspace isolation and provider validation.
- Public connection responses remain redacted: no plaintext token, `secretRef`, ciphertext, IV or authentication tag.
- Repository and connection identifiers are URL-encoded before they are inserted into API paths.
- The GitHub setup panel is workspace-only and is not loaded or rendered in private scope.
- Users without `integrations.manage` do not trigger administrative GitHub reads from the dashboard.

## Product boundary / Frontera de producto

This slice makes the existing GitHub connector usable from the product UI. It does not change how credentials are stored, how GitHub responses are normalized or how signals/alerts are generated.

Esta slice hace utilizable desde la interfaz el conector GitHub existente. No cambia el almacenamiento de credenciales, la normalización de GitHub ni la generación de señales/alertas.

## Deliberately deferred / Diferido expresamente

- provider-token rotation UI;
- disconnect/delete UI;
- webhook endpoint provisioning/rotation UI;
- GitHub App/OAuth authorization;
- automatic webhook registration;
- customer-configurable alert rules;
- stale PR/issue policies.

## Acceptance / Aceptación

The existing GitHub live-sync Docker environment is extended with a web-surface acceptance flow that proves:

1. a GitHub connection can be created through `/api/integrations/github`;
2. the provider credential is absent from API lists and rendered HTML;
3. the connection can be validated through the web route;
4. an existing repository can be rebound to that validated connection and manually synced through the web route;
5. the ES and EN workspace dashboards render the setup surface and normalized repository state;
6. the private dashboard renders neither the setup surface nor workspace connection data.

The complete repository regression boundary remains the existing nine GitHub Actions workflows.
