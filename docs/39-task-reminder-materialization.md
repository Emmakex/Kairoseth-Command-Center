# 39 — Task reminder materialization / Materialización de recordatorios de tareas

## Purpose / Objetivo

Phase 5 Slice 15 turns the explicit one-time reminder intent introduced in Slice 14 into a deterministic in-app alert.  
La Slice 15 de la Fase 5 convierte la intención explícita de recordatorio de una sola vez introducida en la Slice 14 en una alerta interna determinista.

This slice does not infer reminder times, create recurring schedules or deliver notifications through external channels.  
Esta slice no infiere horas de recordatorio, no crea recurrencias ni envía notificaciones por canales externos.

## Execution model / Modelo de ejecución

The existing worker scans active workspace/private tasks for due `{ kind: 'at', remindAt }` rules on every worker tick.

El worker existente revisa en cada ciclo las tareas activas de ámbito workspace/private que tengan reglas `{ kind: 'at', remindAt }` vencidas.

For every due reminder:

1. the task is re-read inside a MongoDB transaction;
2. scope, active status and the exact reminder instant are revalidated;
3. one warning/open alert is materialized in the same task scope;
4. the alert uses a stable fingerprint `task-reminder:<taskId>:<remindAt>`;
5. the exact one-time reminder rule is consumed from the task in the same transaction;
6. a transactional `alert.reminder_due` audit-outbox event is created when the alert is first materialized.

Para cada recordatorio vencido:

1. la tarea se vuelve a leer dentro de una transacción MongoDB;
2. se revalidan ámbito, estado activo e instante exacto;
3. se materializa una única alerta `warning/open` en el mismo ámbito de la tarea;
4. la alerta usa el fingerprint estable `task-reminder:<taskId>:<remindAt>`;
5. la regla de una sola vez se consume de la tarea en la misma transacción;
6. al crear la alerta por primera vez se genera el evento auditado `alert.reminder_due` mediante el outbox transaccional.

## Idempotence and concurrency / Idempotencia y concurrencia

Workspace and private alerts have scope-bound unique fingerprint indexes. Concurrent worker attempts therefore converge on one durable alert.

Las alertas workspace y private tienen índices únicos de fingerprint ligados al ámbito. Por tanto, ejecuciones concurrentes convergen en una sola alerta durable.

The task update uses its current `updatedAt` value as an optimistic concurrency guard. If a human edits reminders concurrently, the worker does not silently overwrite that change.

La actualización de la tarea usa su `updatedAt` actual como control de concurrencia optimista. Si una persona modifica los recordatorios simultáneamente, el worker no pisa silenciosamente ese cambio.

Once a one-time reminder has materialized, its exact rule is removed from `Task.reminderRules`. This prevents every later worker tick from rescanning an already-fired reminder while the alert/audit history remains durable.

Una vez materializado un recordatorio de una sola vez, su regla exacta se elimina de `Task.reminderRules`. Así los ciclos posteriores no vuelven a procesarlo, mientras la alerta y la auditoría conservan el historial.

## Security and scope / Seguridad y ámbito

- Workspace reminders create workspace alerts only.
- Private reminders create private alerts only.
- System-scoped tasks are not reminder candidates.
- Done/cancelled tasks are ignored.
- No provider credentials or external payloads are involved.
- No tenant/user authority is accepted from worker input; the materializer uses the task's persisted scope.

## Verification / Verificación

The slice includes:

- unit coverage for due/future/completed/cancelled/system-scoped candidate selection and stable fingerprints;
- a Docker smoke that creates a real workspace task, stores an already-due reminder, waits for worker execution and verifies:
  - exactly one warning/open reminder alert;
  - the one-time rule is consumed;
  - exactly one delivered `alert.reminder_due` timeline event;
  - subsequent worker ticks do not duplicate the alert or audit event.

## Deliberately deferred / Diferido expresamente

- recurring reminder rules;
- email, push, SMS or third-party delivery;
- snooze/repeat policies;
- AI-generated or inferred reminder times;
- arbitrary automation DSL or external actions.
