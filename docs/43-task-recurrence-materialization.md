# 43 — Task recurrence materialization / Materialización de recurrencia de tareas

## Goal / Objetivo

Turn an explicitly completed recurring task into exactly one next task occurrence, preserving scope and recurrence cadence without duplicating one-time side effects.

Convertir una tarea recurrente completada explícitamente en exactamente una siguiente ocurrencia, preservando ámbito y cadencia sin duplicar efectos de una sola vez.

## Eligibility / Elegibilidad

The worker may materialize only tasks that satisfy all of the following at transaction time:

- scope is `workspace` or `private`;
- status is `done`;
- `completedAt` is a valid ISO instant;
- `dueAt` is a valid ISO instant;
- recurrence rule is `{ kind: 'interval_days', intervalDays: 1..365 }`;
- no `recurrenceNextTaskId` has already been committed.

System-scoped, incomplete, invalid or already-materialized tasks are ignored.

## Due-date semantics / Semántica de fecha límite

The next due date is deterministic:

`nextDueAt = sourceDueAt + intervalDays * 24h`

This is deliberately a fixed-duration whole-day interval in UTC. Calendar-month, weekday and local-wall-clock recurrence remain separate future semantics.

## Lineage and idempotence / Linaje e idempotencia

The source task records:

- `recurrenceNextTaskId`;
- `recurrenceMaterializedAt`.

The generated child records:

- `recurrenceSourceTaskId`.

A unique scope-bound MongoDB index on `recurrenceSourceTaskId` guarantees at most one direct child for each source task. Source marker update, child insertion and audit-outbox event commit in one transaction. Optimistic `updatedAt` matching prevents a worker from silently materializing against a concurrent human edit/reopen.

## Inheritance / Herencia

The next occurrence inherits only stable task-template fields:

- exact workspace/private scope;
- project association, when present;
- title;
- description, when present;
- priority;
- assignee IDs;
- recurrence rule.

The next occurrence starts as `todo` and receives the calculated `nextDueAt`.

The worker intentionally does **not** copy:

- `reminderRules` — one-time reminder instants belong to the completed occurrence;
- `dependencyIds` — dependency readiness is occurrence-specific;
- completion timestamps or status;
- previous recurrence lineage/materialization markers.

This prevents recurring tasks from silently replaying stale reminders or old dependency state.

## Audit / Auditoría

First successful creation emits `task.recurrence_materialized` through the transactional audit outbox. Metadata includes:

- source task ID;
- next task ID;
- source due date;
- next due date;
- interval days;
- explicit flags confirming reminder/dependency state was not copied.

Repeated worker ticks do not emit duplicate events.

## Worker behavior / Comportamiento del worker

The recurrence materializer runs in the normal worker tick independently from GitHub execution and alongside reminder materialization. A failure is surfaced through the worker tick error path and cannot partially commit source/child/audit state because the operation is transactional.

## Explicit boundaries / Límites explícitos

This slice does not:

- create more than one direct successor per completed occurrence;
- copy one-time reminders or dependencies;
- infer recurrence with AI;
- implement monthly, weekday or local-calendar recurrence;
- send external notifications;
- auto-complete or auto-reopen tasks;
- modify project progress semantics.
