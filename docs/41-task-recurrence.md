# 41 — Task recurrence / Recurrencia de tareas

## Goal / Objetivo

Add explicit, portable recurrence intent to tasks without coupling the model to automatic task creation, a scheduler, UI behavior or AI inference.

Añadir intención de recurrencia explícita y portable a las tareas sin acoplar el modelo a creación automática de tareas, scheduler, comportamiento de UI ni inferencia de IA.

## Model / Modelo

`Task.recurrenceRule` is optional for backward compatibility. Slice 17 supports one deterministic rule type:

```ts
{ kind: 'interval_days', intervalDays: 1..365 }
```

The rule represents a fixed whole-day cadence. Enabling recurrence requires the task to already have a valid `dueAt`; that due date is the explicit scheduling anchor for the future execution slice.

This slice does not calculate or persist a next occurrence. It only records recurrence intent safely.

## Mutation / Mutación

`PUT /v1/tasks/:id/recurrence`

Enable recurrence:

```json
{
  "scope": "workspace",
  "recurrenceRule": {
    "kind": "interval_days",
    "intervalDays": 7
  }
}
```

Disable recurrence:

```json
{
  "scope": "workspace",
  "recurrenceRule": null
}
```

The client may select only `workspace` or `private`; workspace IDs, user IDs and actor IDs are not accepted.

## Validation / Validación

- `intervalDays` must be a whole number from 1 through 365.
- Unknown body and rule fields are rejected.
- A non-null recurrence rule requires the task to have a parseable `dueAt`.
- Clearing recurrence with `null` does not require a due date.
- The task must exist inside the exact authenticated workspace/private scope.

## Security and tenancy / Seguridad y tenancy

- Workspace/private ownership is derived from the authenticated session.
- `tasks.write` and the `command-center` product entitlement are required.
- Foreign tenant/user identifiers cannot be supplied by the browser or API caller.
- Scope-bound lookup is used before any mutation, so a recurrence request cannot disclose or mutate a task from another scope.

## Durability and audit / Durabilidad y auditoría

Recurrence mutation and its `task.recurrence_changed` audit-outbox event commit in the same Mongo transaction.

The audit metadata records the previous and resulting recurrence rule. Optimistic `updatedAt` matching prevents the recurrence mutation from silently overwriting a concurrent task change.

## Explicit boundaries / Límites explícitos

This slice defines and safely mutates recurrence intent only. It does not yet:

- create the next task occurrence;
- advance `dueAt`;
- execute recurrence when a task is completed;
- define monthly/calendar-day semantics;
- edit recurrence in the web UI;
- create recurring reminders;
- send external notifications;
- infer recurrence from task text with AI;
- change task status automatically.

Execution and UI remain separate, independently validated slices.
