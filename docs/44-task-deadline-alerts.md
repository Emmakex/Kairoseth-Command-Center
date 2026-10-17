# 44 — Task deadline alerts / Alertas de vencimiento de tareas

## Goal / Objetivo

Materialize the MVP's documented deadline-alert capability from authoritative task data without requiring AI, an external provider or a user-authored rule DSL.

Materializar la capacidad de alertas de vencimiento documentada para el MVP a partir de datos autoritativos de tareas, sin requerir IA, un proveedor externo ni un DSL de reglas creado por el usuario.

## First deterministic rule / Primera regla determinista

A task is overdue when all of the following are true:

- its persisted scope is `workspace` or `private`;
- its status is neither `done` nor `cancelled`;
- it has a parseable persisted `dueAt`;
- `dueAt <= worker now`.

System-scoped, completed, cancelled, missing-date and invalid-date tasks do not create deadline alerts.

The first deadline alert is:

- severity `urgent`;
- status `open`;
- in exactly the same workspace/private scope as the task;
- linked to the same project when the task has `projectId`;
- deduplicated by stable fingerprint `task-deadline:<taskId>`.

The alert title is the task title. The worker does not synthesize an English/Spanish message into durable data; the existing localized UI remains responsible for presentation around alert state.

## Lifecycle / Ciclo de vida

### Create / Crear

When an eligible overdue task has no alert with its fingerprint, the worker creates exactly one alert and enqueues `alert.task_deadline_overdue` in the transactional audit outbox.

### Existing / Existente

An `open` or `acknowledged` deadline alert remains unchanged while the task stays overdue. Repeated worker ticks do not duplicate it.

### Auto-resolve / Auto-resolver

An `open` or `acknowledged` deadline alert is automatically resolved when the same scoped task:

- becomes `done`;
- becomes `cancelled`;
- no longer has a valid deadline;
- has a deadline that is no longer overdue;
- or no longer exists in that exact scope.

Resolution writes `resolvedAt` and enqueues `alert.auto_resolved` with `source = task-deadlines` and an explicit deterministic reason.

### Reopen / Reabrir

If an automatically or manually resolved alert's task becomes overdue again, the same alert record reopens instead of creating a duplicate. Reopening enqueues `alert.reopened` with `source = task-deadlines`.

### Dismiss / Descartar

`dismissed` is human-authoritative. A dismissed deadline alert is not reopened by later worker ticks even while the task remains overdue. The user can continue to see the task itself in task/today surfaces; the derived alert does not fight the dismissal.

## Isolation / Aislamiento

The task's persisted scope is authoritative during derivation. Workspace and private alerts use separate scope-bound uniqueness indexes:

- workspace: `scope.workspaceId + fingerprint`;
- private: `scope.userId + fingerprint`.

A task ID or fingerprint alone is never a tenant boundary. Resolution also re-reads the task inside the exact alert scope before changing state.

## Transactions and concurrency / Transacciones y concurrencia

Creation, reopen and auto-resolution each execute inside a Mongo transaction with their corresponding audit-outbox write.

The stable fingerprint plus existing unique alert indexes makes concurrent materialization idempotent. Reopen and resolution mutations match the current alert status and `updatedAt`, so a concurrent human status change wins instead of being silently overwritten.

## Worker integration / Integración del worker

The existing worker runs deadline reconciliation independently from:

- one-time reminder materialization;
- recurrence materialization;
- GitHub background refresh;
- audit-outbox delivery.

Worker logs expose a separate `taskDeadlines` result containing scanned/candidate/create/existing/reopen/resolve/skip counts.

## Validation / Validación

The dedicated Docker acceptance must prove:

1. an overdue workspace task creates one urgent workspace alert;
2. an overdue private task creates one urgent private alert;
3. both creation audit events are delivered;
4. completing the workspace task auto-resolves its alert;
5. restoring the task to an overdue active status reopens the same alert record;
6. dismissing that alert remains authoritative across later worker ticks;
7. no duplicate alert is created for any lifecycle transition.

## Deliberate boundaries / Límites deliberados

This slice does not add:

- pre-deadline warning windows;
- project or milestone deadline alerts;
- user-configurable deadline severity;
- email, push, SMS or third-party delivery;
- snooze policies;
- local-calendar recurrence semantics;
- AI classification or inference.

Those remain separate slices so the first task-deadline rule stays deterministic, portable and independently releasable.
