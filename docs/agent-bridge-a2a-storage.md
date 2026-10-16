# Agent Bridge: almacenamiento A2A compartido / shared A2A storage

## ES

### Objetivo

Kairoseth Platform es la autoridad compartida para las tareas A2A de Agent Bridge cuando existen dos o más runtimes lógicos. El runtime no debe usar un fallback local si Platform no está disponible.

### Endpoints

Todos los endpoints son `POST`, requieren una sesión Bearer válida con entitlement `agent-bridge` y responden con `Cache-Control: no-store`:

- `/api/products/agent-bridge/a2a/tasks/save`
- `/api/products/agent-bridge/a2a/tasks/get`
- `/api/products/agent-bridge/a2a/tasks/claim`
- `/api/products/agent-bridge/a2a/tasks/complete`

Los contratos de versión aceptados son, respectivamente:

- `kab.a2a-task-save.v1`
- `kab.a2a-task-get.v1`
- `kab.a2a-task-claim.v1`
- `kab.a2a-task-complete.v1`

### Seguridad y tenancy

`scope.tenantId` debe coincidir exactamente con `activeWorkspaceId` de la sesión autenticada. Platform nunca acepta un tenant arbitrario suministrado por el cliente. El scope A2A completo permanece ligado a `actor + tenantId + installationId`.

Los IDs están acotados, el `actionFingerprint` debe ser un SHA-256 hexadecimal de 64 caracteres y el estado debe pertenecer al conjunto A2A admitido. La finalización exige que la invocación sea idéntica a la invocación incluida en el claim.

### Persistencia y atomicidad

La colección autoritativa es `agent_bridge_a2a_tasks` y `taskId` es único globalmente. Un mismo ID no puede reutilizarse entre scopes distintos.

`claim` se implementa con una única operación atómica `findOneAndUpdate` de MongoDB. Solo gana si coinciden simultáneamente:

- `taskId`;
- scope completo;
- ausencia de claim activo;
- estado esperado;
- `actionFingerprint` esperado.

En la misma operación Platform persiste el `claimId` y cambia el estado almacenado a `TASK_STATE_WORKING`. La respuesta devuelve el registro anterior al cambio para que Agent Bridge pueda validar el estado esperado. Dos runtimes que compitan por la misma transición obtienen como máximo un ganador.

Los claims no caducan automáticamente. Un crash incierto queda fail-closed hasta reconciliación operativa para evitar repetir una escritura o acción crítica.

`complete` exige el `claimId` exacto, el mismo scope, el mismo fingerprint y estado persistido `TASK_STATE_WORKING`. Al completar, sustituye el registro por el resultado final y elimina el claim. Repetir la misma finalización devuelve `completed: false`.

### Criterio de aceptación clustered/shared

La aceptación queda demostrada cuando dos clientes lógicos independientes apuntan al mismo Platform/MongoDB y compiten simultáneamente por una tarea en `TASK_STATE_AUTH_REQUIRED`:

1. ambos leen la misma tarea;
2. ambos envían `claim` con IDs diferentes;
3. exactamente uno recibe un claim no nulo;
4. el registro compartido queda en `TASK_STATE_WORKING` antes de ejecutar el side effect;
5. solo el ganador puede completar;
6. el estado final es visible desde el otro cliente;
7. un replay de `complete` devuelve `completed: false`.

La CI ejecuta este escenario contra el stack real de Docker y MongoDB, además de las pruebas unitarias de contrato.

## EN

### Goal

Kairoseth Platform is the shared authority for Agent Bridge A2A tasks whenever two or more logical runtimes exist. The runtime must not fall back to local state when Platform is unavailable.

### Endpoints

All endpoints use `POST`, require a valid Bearer session with the `agent-bridge` entitlement, and return `Cache-Control: no-store`:

- `/api/products/agent-bridge/a2a/tasks/save`
- `/api/products/agent-bridge/a2a/tasks/get`
- `/api/products/agent-bridge/a2a/tasks/claim`
- `/api/products/agent-bridge/a2a/tasks/complete`

Accepted contract versions are:

- `kab.a2a-task-save.v1`
- `kab.a2a-task-get.v1`
- `kab.a2a-task-claim.v1`
- `kab.a2a-task-complete.v1`

### Security and tenancy

`scope.tenantId` must exactly match the authenticated session `activeWorkspaceId`. Platform never trusts an arbitrary tenant supplied by the client. The complete A2A scope remains bound to `actor + tenantId + installationId`.

Identifiers are bounded, `actionFingerprint` must be a 64-character hexadecimal SHA-256 value, and task state must be one of the supported A2A states. Completion requires the invocation to be identical to the invocation carried by the claim.

### Persistence and atomicity

The authoritative collection is `agent_bridge_a2a_tasks`, with a globally unique `taskId`. A task ID cannot be reused across security scopes.

`claim` uses one atomic MongoDB `findOneAndUpdate`. It wins only when all of these match at once:

- `taskId`;
- complete scope;
- no active claim;
- expected state;
- expected `actionFingerprint`.

In that same operation Platform persists `claimId` and moves the stored state to `TASK_STATE_WORKING`. The response returns the pre-update record so Agent Bridge can validate the expected state. Two runtimes racing the same transition therefore have at most one winner.

Claims intentionally have no automatic expiry. An uncertain crash remains fail-closed until an operator reconciles it, avoiding duplicate WRITE or CRITICAL side effects.

`complete` requires the exact `claimId`, the same scope, the same fingerprint, and persisted `TASK_STATE_WORKING`. Completion replaces the record with the terminal result and removes the claim. Replaying the same completion returns `completed: false`.

### Clustered/shared acceptance

Acceptance is proven when two independent logical clients target the same Platform/MongoDB and race one `TASK_STATE_AUTH_REQUIRED` task:

1. both observe the same task;
2. both submit `claim` with different claim IDs;
3. exactly one receives a non-null claim;
4. shared state is already `TASK_STATE_WORKING` before the side effect runs;
5. only the winner can complete;
6. the final state is visible to the other client;
7. replaying `complete` returns `completed: false`.

CI runs this scenario against the real Docker/MongoDB stack in addition to the contract unit tests.
