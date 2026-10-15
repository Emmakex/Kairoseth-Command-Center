# 23 — GitHub maintenance UI / Mantenimiento de GitHub

## Goal / Objetivo

Complete the token-backed GitHub administration lifecycle already exposed in Work Manager without adding a new provider or authorization model.  
Completar desde Gestor de Trabajo el ciclo administrativo GitHub basado en token ya existente, sin añadir un nuevo proveedor ni un nuevo modelo de autorización.

## Slice 5i scope / Alcance de Slice 5i

Workspace administrators with `integrations.manage` can:

- rotate an existing GitHub provider token through a write-only password field;
- revalidate the connection after rotation;
- unlink a repository from Work Manager;
- remove an unused GitHub connection after its repositories have been unlinked.

The browser-facing forms reuse the server-side `/api/integrations/github` mutation route introduced in Slice 5h. The API remains authoritative for workspace scope, permissions and deletion safety.

Los formularios reutilizan la ruta server-side de 5h. La API sigue siendo la autoridad para el espacio de trabajo, permisos y seguridad del borrado.

## Safety / Seguridad

- Rotated provider tokens are accepted only in the POST form body and forwarded only in the API request body.
- Tokens are never rendered back into HTML, URLs or public connection objects.
- Connection and repository IDs are URL-encoded before entering API paths.
- Destructive web mutations require an explicit confirmation value produced by the intended UI control.
- The UI disables connection removal while any currently loaded repository references that connection.
- The backend independently enforces the same rule and returns `github_connection_in_use` when a crafted request attempts to bypass the UI.
- Repository unlink and connection deletion remain workspace-only and require `integrations.manage`.
- Removing a repository link does not delete the remote GitHub repository.
- Removing a connection deletes only the local integration connection/secret lifecycle already implemented by the backend; it does not revoke or delete the remote GitHub account/token.

## Validation boundary / Frontera de validación

Validation is intentionally layered instead of duplicating secret-heavy Docker flows:

1. web parser unit tests prove write-only rotation, encoded identifiers and explicit destructive confirmations;
2. Next.js typecheck/build validates the server mutation route with POST/PATCH/DELETE methods;
3. the existing GitHub setup UI smoke continues to prove authenticated ES/EN workspace setup and private-scope isolation;
4. the existing GitHub connections Docker smoke already proves encrypted credential rotation, ciphertext replacement, safe connection deletion and secret cleanup through the real API/Mongo path;
5. the full nine-workflow regression boundary must remain green.

## Deliberately deferred / Diferido expresamente

- webhook endpoint provisioning/rotation/deletion UI;
- GitHub App/OAuth authorization;
- automatic webhook registration;
- customer-configurable alert rules;
- stale PR/issue policies.
