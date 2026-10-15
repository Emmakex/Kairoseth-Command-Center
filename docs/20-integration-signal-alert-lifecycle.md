# Integration signal alert lifecycle / Ciclo de vida de alertas desde señales de integración

## ES

### Objetivo

La Slice 5f añade ciclo de vida automático a las alertas derivadas introducidas en 5e. La plataforma deja de tratar cada fallo CI como una alerta permanente: usa el histórico durable de `IntegrationSignal` para decidir qué condición sigue vigente, resolver condiciones superadas y reabrir una alerta cuando el mismo estado vuelve a aparecer mediante una señal realmente posterior.

### Invariantes

- La lógica sigue siendo provider-neutral; opera sobre `repository.ci` normalizado, no sobre payloads crudos de GitHub.
- Los fingerprints v1 de 5e no cambian: `integration-rule:<ruleId>:<signalId>`.
- Solo existe una alerta durable por `workspace + fingerprint`.
- `dismissed` es una decisión humana y no se auto-resuelve ni se reabre.
- Una alerta resuelta manualmente solo se reabre si `candidate.occurredAt > resolvedAt`.
- Credenciales y payloads crudos del proveedor no entran en alertas ni eventos de auditoría.

### Serie CI y estado decisivo

Las señales CI se agrupan por repositorio/recurso, nombre del workflow y rama. Dentro de cada serie se ordenan por `occurredAt`.

Estados decisivos iniciales:

- `failure`, `timed_out`, `startup_failure` → condición activa `urgent`.
- `action_required` → condición activa `warning`.
- `success` → condición saludable; resuelve alertas derivadas anteriores de esa serie.
- `cancelled`, ausencia de conclusión y estados no reconocidos son neutrales para lifecycle: no deben ocultar el último estado decisivo conocido.

### Reconciliación durable

Después de persistir el refresh del proveedor, el worker vuelve a leer hasta 500 señales CI durables del mismo recurso y ejecuta la reconciliación. Ese límite es interno; la API pública mantiene su límite existente de 100 resultados.

El reconciliador produce dos conjuntos:

1. `active`: alertas que deben existir y estar abiertas según el último estado decisivo.
2. `resolve`: fingerprints anteriores o incompatibles que ya no representan el estado actual.

La resolución solo afecta alertas `open` o `acknowledged`. Se guarda `resolvedAt` con el `occurredAt` de la señal que demuestra la recuperación, de modo que el orden lógico dependa del tiempo del proveedor y no del momento en que el worker procesó el job.

### Reapertura

Si un fingerprint existente está `resolved`, `materialize` solo lo reabre cuando la señal activa es posterior a `resolvedAt`. La reapertura conserva `alert.id` y fingerprint, limpia `resolvedAt`/`acknowledgedAt` y evita crear una segunda alerta.

### Auditoría

Eventos transaccionales nuevos:

- `alert.auto_resolved`: una condición derivada deja de estar vigente.
- `alert.reopened`: una condición previamente resuelta vuelve a estar vigente por una señal posterior.

`alert.derived` continúa emitiéndose únicamente en la primera creación durable.

### Verificación end-to-end

El smoke de background ejecuta el mismo workflow `701` con identidad estable en esta secuencia:

1. `failure` → crea una alerta `urgent` y un único `alert.derived`.
2. mismo `failure` reprocesado → no duplica alerta ni auditoría.
3. `success` posterior → resuelve exactamente esa alerta y emite un `alert.auto_resolved`.
4. `failure` todavía posterior → reabre exactamente el mismo `alert.id`, mantiene el fingerprint y emite un `alert.reopened`.

La prueba también mantiene la invariancia de que el token del proveedor no aparece en logs del worker.

### Fuera de esta microfase

- Editor de reglas por cliente.
- Reglas de PR/issue stale.
- Localización/configuración visual de reglas en UI.
- GitHub App/OAuth y registro automático de webhooks.

## EN

### Goal

Slice 5f adds automatic lifecycle management to the derived alerts introduced in 5e. CI failures are no longer permanent one-shot alerts: the platform uses durable `IntegrationSignal` history to determine which condition is still current, resolve superseded conditions, and reopen an alert only when the same condition is observed again through a genuinely later signal.

### Invariants

- Lifecycle logic remains provider-neutral and consumes normalized `repository.ci`, never raw GitHub payloads.
- Existing 5e v1 fingerprints remain unchanged: `integration-rule:<ruleId>:<signalId>`.
- At most one durable alert exists per `workspace + fingerprint`.
- `dismissed` is a human decision and is neither auto-resolved nor reopened.
- A manually resolved alert reopens only when `candidate.occurredAt > resolvedAt`.
- Provider credentials and raw provider payloads never enter alerts or audit events.

### CI series and decisive state

CI signals are grouped by repository/resource, workflow name, and branch, then ordered by `occurredAt`.

Initial decisive states:

- `failure`, `timed_out`, `startup_failure` → active `urgent` condition.
- `action_required` → active `warning` condition.
- `success` → healthy condition that resolves older derived alerts in the same series.
- `cancelled`, missing conclusions, and unknown states are lifecycle-neutral and do not hide the last known decisive state.

### Durable reconciliation

After provider refresh signals are persisted, the worker reads up to 500 durable CI signals for that resource and reconciles lifecycle state. This is an internal bound; the public history API keeps its existing 100-result limit.

The reconciler emits two sets:

1. `active`: alerts that should exist and be open for the current decisive state.
2. `resolve`: old or incompatible fingerprints that no longer represent current state.

Resolution only changes `open` or `acknowledged` alerts. `resolvedAt` is written from the recovery signal's `occurredAt`, so logical ordering follows provider event time rather than worker processing wall-clock time.

### Reopening

When an existing fingerprint is `resolved`, `materialize` reopens it only if the active signal is later than `resolvedAt`. Reopening preserves the durable `alert.id` and fingerprint, clears `resolvedAt`/`acknowledgedAt`, and never creates a duplicate alert.

### Audit

New transactional events:

- `alert.auto_resolved`: a derived condition is no longer current.
- `alert.reopened`: a previously resolved condition becomes current again through a later signal.

`alert.derived` remains a first-materialization-only event.

### End-to-end verification

The background smoke drives the same stable workflow identity `701` through:

1. `failure` → one `urgent` alert and one `alert.derived`.
2. repeated `failure` → no duplicate alert or audit event.
3. later `success` → the same alert is resolved and one `alert.auto_resolved` is emitted.
4. later `failure` → the exact same `alert.id` is reopened, fingerprint remains stable, and one `alert.reopened` is emitted.

The smoke also keeps the security invariant that provider tokens never appear in worker logs.

### Outside this micro-slice

- Customer-configurable rule editor.
- Stale PR/issue policies.
- Localized/configurable rule presentation in the UI.
- GitHub App/OAuth and automatic webhook registration.
