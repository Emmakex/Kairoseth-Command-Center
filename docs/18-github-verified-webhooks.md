# GitHub verified webhooks / Webhooks GitHub verificados

## ES

### Objetivo

Los webhooks reducen la latencia entre un cambio en GitHub y su aparición en **Gestor de Trabajo**. No escriben señales directamente desde el payload recibido: una entrega verificada crea un trabajo durable `repository_signals`, y el worker vuelve a consultar GitHub para obtener el estado autoritativo y normalizarlo con el mismo executor ya usado por las sincronizaciones manuales y periódicas.

El polling recurrente de 15 minutos se mantiene como reconciliación y recuperación. Esto es importante tanto ante entregas perdidas como en instalaciones privadas/on-prem donde GitHub no puede alcanzar una URL HTTPS entrante.

### Modelo de seguridad

Cada conexión GitHub puede tener como máximo un endpoint de webhook activo. El endpoint usa:

- un identificador opaco `ghwh_*` en la URL pública;
- un secreto HMAC independiente del token del proveedor;
- almacenamiento del secreto mediante el vault AES-256-GCM existente;
- visibilidad del secreto en texto plano únicamente al crear el endpoint o rotarlo;
- verificación HMAC-SHA256 sobre los **bytes exactos** recibidos antes de interpretar JSON;
- comparación de firma en tiempo constante;
- comprobación estricta de `X-Hub-Signature-256`, `X-GitHub-Delivery` y `X-GitHub-Event`;
- rechazo de recepción si la conexión GitHub asociada deja de estar activa y validada.

El token GitHub nunca forma parte de la URL, payload de job, registro de delivery ni respuesta del webhook.

### Anti-replay

Una entrega verificada reclama de forma durable su `X-GitHub-Delivery`. La clave única `endpointId + deliveryId` impide procesar dos veces la misma entrega, incluso con varias réplicas de API.

Los claims se conservan por defecto durante 7 días mediante un índice TTL de MongoDB. El periodo queda acotado entre 1 y 30 días.

Si el enqueue durable falla, el claim se elimina antes de devolver `503`, permitiendo que un reintento real de GitHub vuelva a procesarse. Una entrega duplicada ya aceptada devuelve `202` con `replay: true` sin crear otro job.

### Flujo de recepción

1. GitHub envía el body JSON exacto al endpoint opaco.
2. La API conserva el body como `Buffer` solo dentro de la ruta encapsulada del webhook.
3. Se resuelve el endpoint y se comprueba que la conexión siga activa y validada.
4. Se validan headers y firma HMAC-SHA256 antes de parsear JSON.
5. Se reclama el delivery ID para anti-replay.
6. Los eventos relevantes son `pull_request`, `issues`, `workflow_run` y `release`.
7. Se extrae `repository.full_name` únicamente después de verificar la firma.
8. El repositorio debe existir en el mismo workspace y estar vinculado a la misma conexión del endpoint.
9. Se encola un job durable `github / repository_signals` con dedupe key basada en endpoint + delivery.
10. El worker usa la credencial cifrada server-side, consulta GitHub y persiste señales normalizadas de forma idempotente.

Los eventos no relevantes o repositorios no vinculados se reconocen con `202` y se ignoran. Esto evita que un webhook válido se convierta en un mecanismo para descubrir o operar sobre recursos de otro tenant.

### Gestión

La gestión requiere sesión autenticada, workspace activo, entitlement `command-center` y capability `integrations.manage`.

- `GET /v1/integrations/github/connections/:id/webhook` — consulta metadatos seguros del endpoint.
- `POST /v1/integrations/github/connections/:id/webhook` — crea endpoint + secreto; requiere una conexión activa y validada.
- `POST /v1/integrations/github/connections/:id/webhook/rotate` — rota el secreto HMAC y lo devuelve una sola vez.
- `DELETE /v1/integrations/github/connections/:id/webhook` — elimina endpoint, deliveries retenidos y secreto cifrado.

Consultar, rotar o eliminar un webhook existente sigue siendo posible aunque la credencial del proveedor esté temporalmente en error. La recepción externa, en cambio, se bloquea hasta que la conexión vuelva a estar activa y validada.

Las altas, rotaciones y eliminaciones se registran mediante el audit outbox transaccional. Los eventos de auditoría no incluyen secreto HMAC, `secretRef` ni token GitHub.

### Configuración manual en GitHub

Hasta incorporar el flujo GitHub App/OAuth, el administrador copia desde Gestor de Trabajo:

- **Payload URL:** `https://<host>/v1/integrations/github/webhooks/<endpointId>`
- **Content type:** `application/json`
- **Secret:** el valor mostrado una sola vez al crear/rotar
- **Events:** pull requests, issues, workflow runs y releases

La instalación debe exponer ese endpoint mediante HTTPS para recibir entregas de GitHub. Si la instalación no admite entrada pública, el producto continúa funcionando mediante sincronización manual y polling recurrente.

### Respuestas relevantes

- `202 refresh_enqueued`: entrega verificada y refresh durable encolado.
- `202 replay: true`: delivery ya procesado; no se duplica trabajo.
- `202 action: ignored`: evento o repositorio no aplicable.
- `401 github_webhook_verification_failed`: headers/firma no válidos.
- `404 github_webhook_not_found`: endpoint inexistente, deshabilitado o sin conexión activa validada.
- `503 github_webhook_enqueue_failed`: fallo al persistir el trabajo; el replay claim se libera para permitir reintento.

## EN

### Purpose

Webhooks reduce the delay between a GitHub change and its appearance in **Work Manager**. They never write signals directly from the incoming payload. A verified delivery creates a durable `repository_signals` job, and the worker queries GitHub again for authoritative state and normalizes it through the same executor used by manual and scheduled refreshes.

The 15-minute recurring poll remains enabled for reconciliation and recovery. This covers lost deliveries and private/on-prem deployments where GitHub cannot reach an inbound HTTPS endpoint.

### Security model

Each GitHub connection can have at most one active webhook endpoint. The endpoint uses:

- an opaque `ghwh_*` identifier in the public URL;
- an HMAC secret independent from the provider token;
- the existing AES-256-GCM vault for secret storage;
- plaintext secret visibility only at initial provisioning or rotation;
- HMAC-SHA256 verification over the **exact received bytes** before JSON parsing;
- constant-time signature comparison;
- strict `X-Hub-Signature-256`, `X-GitHub-Delivery` and `X-GitHub-Event` validation;
- receive-time rejection if the backing GitHub connection is no longer active and validated.

The GitHub provider token never appears in the webhook URL, job payload, delivery record or webhook response.

### Replay protection

A verified delivery durably claims its `X-GitHub-Delivery` value. A unique `endpointId + deliveryId` key prevents the same delivery from being processed twice, including across multiple API replicas.

Claims are retained for 7 days by default through a MongoDB TTL index, bounded between 1 and 30 days.

If durable enqueue fails, the delivery claim is released before returning `503`, allowing a genuine GitHub retry to be processed. A duplicate delivery already accepted returns `202` with `replay: true` and creates no additional job.

### Receive flow

1. GitHub sends the exact JSON body to the opaque endpoint.
2. The API preserves the body as a `Buffer` only inside the encapsulated webhook route.
3. The endpoint is resolved and its backing connection must still be active and validated.
4. Headers and HMAC-SHA256 signature are verified before JSON parsing.
5. The delivery ID is claimed for replay protection.
6. Relevant events are `pull_request`, `issues`, `workflow_run` and `release`.
7. `repository.full_name` is read only after signature verification.
8. The repository must belong to the same workspace and be bound to the same connection as the endpoint.
9. A durable `github / repository_signals` job is enqueued with an endpoint + delivery dedupe key.
10. The worker resolves the encrypted provider credential server-side, queries GitHub and idempotently persists normalized signals.

Irrelevant events and unbound repositories are acknowledged with `202` and ignored. A valid webhook therefore cannot be used to discover or operate on another tenant's resources.

### Management

Management requires an authenticated session, active workspace, the `command-center` entitlement and the `integrations.manage` capability.

- `GET /v1/integrations/github/connections/:id/webhook` — reads safe endpoint metadata.
- `POST /v1/integrations/github/connections/:id/webhook` — provisions endpoint + secret; requires an active validated connection.
- `POST /v1/integrations/github/connections/:id/webhook/rotate` — rotates the HMAC secret and returns it once.
- `DELETE /v1/integrations/github/connections/:id/webhook` — removes the endpoint, retained deliveries and encrypted secret.

Reading, rotating or deleting an existing webhook remains possible while the provider credential is temporarily in error. External delivery ingestion is blocked until the provider connection becomes active and validated again.

Provisioning, rotation and deletion are recorded through the transactional audit outbox. Audit events contain no HMAC secret, `secretRef` or GitHub token.

### Manual GitHub setup

Until GitHub App/OAuth registration is added, the administrator copies from Work Manager:

- **Payload URL:** `https://<host>/v1/integrations/github/webhooks/<endpointId>`
- **Content type:** `application/json`
- **Secret:** the value shown once at provision/rotation
- **Events:** pull requests, issues, workflow runs and releases

The deployment must expose this endpoint over HTTPS for GitHub delivery. If inbound public access is unavailable, the product continues to operate through manual refresh and recurring polling.

### Relevant responses

- `202 refresh_enqueued`: verified delivery and durable refresh queued.
- `202 replay: true`: delivery already handled; no duplicate work.
- `202 action: ignored`: event or repository does not apply.
- `401 github_webhook_verification_failed`: invalid headers/signature.
- `404 github_webhook_not_found`: missing/disabled endpoint or inactive backing connection.
- `503 github_webhook_enqueue_failed`: job persistence failed; replay claim released for retry.
