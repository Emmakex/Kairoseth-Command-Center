# 45 — Project deadline alerts / Alertas de vencimiento de proyectos

## Goal / Objetivo

Extend the deterministic deadline-alert capability from tasks to projects without changing the existing task lifecycle or introducing configurable scheduling semantics.

Extender la capacidad determinista de alertas de vencimiento desde tareas hacia proyectos sin cambiar el ciclo de tareas existente ni introducir semánticas configurables de calendario.

## Deterministic rule / Regla determinista

A project is overdue when all of the following are true:

- its persisted scope is `workspace` or `private`;
- its status is not `done` or `archived`;
- it has a parseable persisted `dueAt`;
- `dueAt <= worker now`.

`planned`, `active` and `blocked` projects are eligible when overdue. System-scoped, done, archived, missing-date and invalid-date projects do not create deadline alerts.

The alert is:

- severity `urgent`;
- status `open`;
- in exactly the same workspace/private scope as the project;
- linked back with `projectId = project.id`;
- deduplicated by stable fingerprint `project-deadline:<projectId>`.

## Lifecycle / Ciclo de vida

### Create / Crear

When an overdue project has no alert with its fingerprint, the worker creates one alert and enqueues `alert.project_deadline_overdue` in the same Mongo transaction.

### Existing / Existente

An `open` or `acknowledged` alert remains unchanged while the project stays overdue. Repeated worker ticks never create a duplicate.

### Auto-resolve / Auto-resolver

An `open` or `acknowledged` project-deadline alert is automatically resolved when the exact scoped project:

- becomes `done`;
- becomes `archived`;
- disappears;
- no longer has a valid deadline;
- or has a deadline that is no longer overdue.

Resolution writes `resolvedAt` and enqueues `alert.auto_resolved` with `source = project-deadlines` plus a deterministic reason.

### Reopen / Reabrir

If a resolved project's deadline becomes overdue again, the existing alert reopens rather than creating another alert. Reopening enqueues `alert.reopened` with `source = project-deadlines` and cause `project_deadline_overdue`.

### Dismiss / Descartar

`dismissed` remains human-authoritative. The worker does not reopen a dismissed project-deadline alert even if the project remains overdue.

## Isolation / Aislamiento

The persisted project scope is authoritative. Workspace and private alerts remain protected by the existing scope-bound unique fingerprint indexes. A project ID or fingerprint alone is never an authorization or tenancy boundary.

Resolution re-reads the project in exactly the alert's persisted scope before mutating the alert.

## Transactions and concurrency / Transacciones y concurrencia

Creation, reopen and auto-resolution each run in a Mongo transaction with their audit-outbox event. Stable fingerprints make creation idempotent. Reopen and resolution match current status plus `updatedAt`, so a concurrent human status change wins instead of being overwritten silently.

## Worker integration / Integración del worker

The worker reconciles project deadlines independently from:

- task deadline alerts;
- one-time task reminders;
- task recurrence materialization;
- GitHub refresh work;
- audit-outbox delivery.

Worker logs expose `projectDeadlines` counts independently from `taskDeadlines`.

## Validation / Validación

The dedicated Docker acceptance proves:

1. an overdue workspace project creates one urgent workspace alert;
2. an overdue private project creates one urgent private alert;
3. both creation audit events are delivered;
4. setting the workspace project to `done` auto-resolves its alert;
5. restoring it to `active` while still overdue reopens the same alert record;
6. dismissing that alert remains authoritative across later worker ticks;
7. no duplicate alert is created during the lifecycle.

## Deliberate boundaries / Límites deliberados

This slice does not add:

- milestone deadline alerts;
- pre-deadline warning windows;
- configurable deadline severity;
- email, push, SMS or third-party delivery;
- snooze policies;
- AI classification or inference.

Milestone deadlines remain a separate micro-slice so project and milestone behavior can be validated independently.
