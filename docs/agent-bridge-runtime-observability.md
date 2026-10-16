# Agent Bridge runtime observability / Observabilidad de runtime de Agent Bridge

## ES

### Objetivo

Kairoseth Platform recibe el snapshot operativo que Agent Bridge ya publica periódicamente y muestra un inventario seguro de runtimes, conectores y herramientas en el workspace.

La observabilidad es descriptiva. No concede permisos de ejecución, no sustituye policy/approvals/audit y no almacena tokens, secretos, configuración de conectores ni inputs/outputs de herramientas.

### Identidad

La ingesta de runtime y la lectura humana usan identidades distintas:

- `POST /api/products/agent-bridge/runtime-snapshot` requiere una **sesión de control de Agent Bridge** resuelta por `AgentBridgeRuntimeIdentityProvider`;
- el provider debe devolver `tenantId`, `installationId`, `bridgeInstanceId` y `sessionId` desde la credencial autenticada del runtime;
- esos IDs nunca se toman del payload del snapshot;
- `GET /api/products/agent-bridge/runtimes` usa la sesión humana normal y requiere entitlement `agent-bridge` + capability `integrations.manage`.

El `server.ts` standalone monta el datastore, pero deliberadamente no inventa un runtime identity provider a partir de una sesión humana. En la integración Kairoseth Platform, el resolver de sesiones de control debe inyectarse en `buildApp` como `agentBridgeRuntimeIdentityProvider`.

### Persistencia

MongoDB usa la colección `agent_bridge_runtime_snapshots` con unicidad por `tenantId + installationId`.

Solo se conserva el último snapshot autoritativo por instalación. Esto evita crecimiento histórico ilimitado y mantiene el caso de uso operativo simple.

Reglas:

- reintentar el mismo `snapshotId` es idempotente y devuelve el `receivedAt` original;
- un snapshot más antiguo no puede sobrescribir uno más nuevo;
- las actualizaciones concurrentes usan compare-and-set sobre el `snapshotId` observado;
- el listado humano nunca devuelve `sessionId`.

### Validación

Platform acepta exclusivamente `kab.runtime-snapshot.v1` y valida de forma acotada:

- máximo 100 conectores por snapshot;
- máximo 2.000 herramientas totales;
- máximo 100 capabilities por conector;
- IDs/textos/versiones con longitud acotada y sin caracteres de control;
- riesgos `READ | WRITE | CRITICAL`;
- health `healthy | degraded | unhealthy`;
- availability `available | degraded | blocked`;
- blocked reason solo `circuit_open | credential_rotation`;
- timestamps ISO válidos y `generatedAt` no más de cinco minutos en el futuro;
- inventario y health deben contener exactamente las mismas instancias y herramientas.

Una ingesta válida devuelve:

```json
{
  "ack": {
    "version": "kab.runtime-snapshot-ack.v1",
    "snapshotId": "...",
    "receivedAt": "..."
  }
}
```

### Estado derivado

El listado del workspace calcula frescura desde `receivedAt`:

- `online`: hasta 150 segundos;
- `stale`: más de 150 segundos y hasta 10 minutos;
- `offline`: más de 10 minutos.

El intervalo normal del reporter de Agent Bridge es 60 segundos, por lo que el margen online tolera más de un ciclo perdido sin marcar la instalación offline inmediatamente.

La respuesta incluye conteos seguros: conectores, herramientas, conectores degradados/no saludables y herramientas bloqueadas, junto con el detalle de health de cada conector.

### UI ES/EN

El dashboard del workspace muestra un panel Agent Bridge únicamente a usuarios con `integrations.manage` y acceso al producto. El panel localiza textos en ES/EN y usa el nombre localizado del conector cuando está disponible; IDs técnicos permanecen sin traducir.

## EN

### Goal

Kairoseth Platform receives the operational snapshot already published periodically by Agent Bridge and exposes a safe workspace inventory of runtimes, connectors and tools.

Observability is descriptive only. It does not grant execution authority, replace policy/approvals/audit, or store tokens, connector configuration, secrets, tool inputs or tool outputs.

### Identity

Runtime ingestion and human reads use distinct identities:

- `POST /api/products/agent-bridge/runtime-snapshot` requires an **Agent Bridge control session** resolved by `AgentBridgeRuntimeIdentityProvider`;
- the provider must return `tenantId`, `installationId`, `bridgeInstanceId` and `sessionId` from the authenticated runtime credential;
- these identifiers are never accepted from the snapshot payload;
- `GET /api/products/agent-bridge/runtimes` uses the regular human session and requires the `agent-bridge` entitlement plus `integrations.manage` capability.

Standalone `server.ts` mounts the datastore but deliberately does not manufacture a runtime identity from a human session. The integrated Kairoseth Platform control-session resolver must be injected into `buildApp` as `agentBridgeRuntimeIdentityProvider`.

### Persistence

MongoDB uses `agent_bridge_runtime_snapshots`, unique on `tenantId + installationId`.

Only the latest authoritative snapshot per installation is retained. This avoids unbounded historical growth and keeps the operational use case focused.

Rules:

- replaying the same `snapshotId` is idempotent and returns its original `receivedAt`;
- an older snapshot cannot overwrite a newer one;
- concurrent updates use compare-and-set against the observed `snapshotId`;
- the human-facing list never exposes `sessionId`.

### Validation

Platform accepts only `kab.runtime-snapshot.v1` and applies bounded validation:

- at most 100 connectors per snapshot;
- at most 2,000 tools in total;
- at most 100 capabilities per connector;
- bounded identifiers/text/version strings without control characters;
- risks limited to `READ | WRITE | CRITICAL`;
- health limited to `healthy | degraded | unhealthy`;
- availability limited to `available | degraded | blocked`;
- blocked reason limited to `circuit_open | credential_rotation`;
- valid ISO timestamps and `generatedAt` no more than five minutes in the future;
- inventory and health must describe exactly the same connector instances and tools.

A valid report returns `kab.runtime-snapshot-ack.v1` with the exact `snapshotId` and Platform `receivedAt`.

### Derived state

The workspace list derives freshness from `receivedAt`:

- `online`: up to 150 seconds;
- `stale`: over 150 seconds and up to 10 minutes;
- `offline`: over 10 minutes.

Agent Bridge reports every 60 seconds by default, so the online window tolerates more than one missed cycle before declaring the installation offline.

The response exposes safe counts for connectors, tools, degraded/unhealthy connectors and blocked tools, plus per-connector health details.

### ES/EN UI

The workspace dashboard shows the Agent Bridge panel only to users with `integrations.manage` and product access. UI text is localized in ES/EN; localized connector names are preferred while technical identifiers remain stable and untranslated.
