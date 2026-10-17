# 46 — Milestone deadline alerts / Alertas de vencimiento de hitos

## Goal / Objetivo

Complete the deterministic deadline-alert chain for tasks, projects and milestones without introducing configurable warning windows or external delivery.

Completar la cadena determinista de alertas de vencimiento para tareas, proyectos e hitos sin introducir ventanas configurables de aviso ni entrega externa.

## Deterministic rule / Regla determinista

A milestone is overdue when all of the following are true:

- its persisted scope is `workspace` or `private`;
- its status is not `done` or `cancelled`;
- it has a parseable persisted `dueAt`;
- `dueAt <= worker now`.

`planned` and `active` milestones are eligible when overdue. System-scoped, done, cancelled, missing-date and invalid-date milestones do not create deadline alerts.

The alert is:

- severity `urgent`;
- status `open`;
- in exactly the same workspace/private scope as the milestone;
- linked to the parent project with `projectId = milestone.projectId`;
- deduplicated by stable fingerprint `milestone-deadline:<milestoneId>`.

## Lifecycle / Ciclo de vida

### Create / Crear

When an overdue milestone has no alert with its fingerprint, the worker creates one alert and enqueues `alert.milestone_deadline_overdue` in the same Mongo transaction.

### Existing / Existente

An `open` or `acknowledged` alert remains unchanged while the milestone stays overdue. Repeated worker ticks never create a duplicate.

### Auto-resolve / Auto-resolver

An `open` or `acknowledged` milestone-deadline alert is automatically resolved when the exact scoped milestone:

- becomes `done`;
- becomes `cancelled`;
- disappears;
- no longer has a valid deadline;
- or has a deadline that is no longer overdue.

Resolution writes `resolvedAt` and enqueues `alert.auto_resolved` with `source = milestone-deadlines` plus a deterministic reason.

### Reopen / Reabrir

If a resolved milestone becomes overdue again, the existing alert reopens rather than creating another alert. Reopening enqueues `alert.reopened` with `source = milestone-deadlines` and cause `milestone_deadline_overdue`.

### Dismiss / Descartar

`dismissed` remains human-authoritative. The worker does not reopen a dismissed milestone-deadline alert even if the milestone remains overdue.

## Isolation / Aislamiento

The persisted milestone scope is authoritative. Workspace and private alerts remain protected by the existing scope-bound unique fingerprint indexes. The parent `projectId` is contextual linkage, not an authorization boundary.

Resolution re-reads the milestone in exactly the alert's persisted scope before mutating the alert.

## Transactions and concurrency / Transacciones y concurrencia

Creation, reopen and auto-resolution each run in a Mongo transaction with their audit-outbox event. Stable fingerprints make creation idempotent. Reopen and resolution match current status plus `updatedAt`, so a concurrent human status change wins instead of being overwritten silently.

## Worker integration / Integración del worker

The worker reconciles milestone deadlines independently from:

- project deadline alerts;
- task deadline alerts;
- one-time task reminders;
- task recurrence materialization;
- GitHub refresh work;
- audit-outbox delivery.

Worker logs expose `milestoneDeadlines` counts independently from `projectDeadlines` and `taskDeadlines`.

## Validation / Validación

The dedicated Docker acceptance proves:

1. an overdue workspace milestone creates one urgent workspace alert linked to its parent project;
2. an overdue private milestone creates one urgent private alert linked to its parent project;
3. both creation audit events are delivered;
4. setting the workspace milestone to `done` auto-resolves its alert;
5. restoring it to `active` while still overdue reopens the same alert record;
6. dismissing that alert remains authoritative across later worker ticks;
7. no duplicate alert is created during the lifecycle.

## Deliberate boundaries / Límites deliberados

This slice does not add:

- pre-deadline warning windows;
- configurable deadline severity;
- parent-project status coupling beyond the milestone's persisted own lifecycle;
- email, push, SMS or third-party delivery;
- snooze policies;
- AI classification or inference.
