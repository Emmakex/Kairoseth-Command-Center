# 38 — Task reminders / Recordatorios de tareas

## Goal / Objetivo

Add an explicit, portable reminder model to tasks without coupling reminder definition to a scheduler, notification provider or AI system.

Añadir un modelo explícito y portable de recordatorios a las tareas sin acoplar su definición a un scheduler, proveedor de notificaciones o sistema de IA.

## Model / Modelo

`Task.reminderRules` is optional for backward compatibility. Slice 14 supports one deterministic rule type:

```ts
{ kind: 'at', remindAt: '<ISO-8601 instant>' }
```

Rules are normalized to UTC ISO strings and sorted chronologically. A task may hold at most 10 one-time reminder instants and duplicate instants are rejected.

## Mutation / Mutación

`PUT /v1/tasks/:id/reminders`

Body:

```json
{
  "scope": "workspace | private",
  "reminderRules": [
    { "kind": "at", "remindAt": "2026-10-20T09:00:00Z" }
  ]
}
```

An empty array clears all reminder rules.

## Security and tenancy / Seguridad y tenancy

- Workspace/private ownership is derived from the authenticated session.
- The client may choose only `workspace` or `private`; tenant/user IDs are not accepted.
- `tasks.write` and the `command-center` product entitlement are required.
- The task lookup and mutation use the exact authenticated scope.
- Unknown body/rule fields are rejected.

## Durability and audit / Durabilidad y auditoría

Reminder mutation and its `task.reminders_changed` audit-outbox event commit in the same Mongo transaction. The event records previous and resulting reminder rules without credentials or external-provider data.

Optimistic `updatedAt` matching prevents a reminder write from silently overwriting a concurrent task mutation.

## Explicit boundaries / Límites explícitos

This slice defines and safely mutates reminder intent only. It does not yet:

- execute reminders;
- create reminder alerts;
- send email, push, SMS or third-party notifications;
- implement recurring reminders;
- infer reminder times with AI;
- change task status automatically.

Those behaviors remain separate, independently testable slices.
