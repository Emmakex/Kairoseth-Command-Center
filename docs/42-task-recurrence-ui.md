# 42 — Task recurrence UI / UI de recurrencia de tareas

## Goal / Objetivo

Expose the recurrence contract proven in Slice 17 through the existing ES/EN task surface without introducing recurrence execution semantics in the browser.

Exponer el contrato de recurrencia validado en Slice 17 dentro de la superficie existente de tareas ES/EN sin introducir semántica de ejecución de recurrencia en el navegador.

## Surface / Superficie

Each visible task card includes a recurrence editor with:

- recurrence disabled (`none`);
- fixed whole-day interval (`interval_days`);
- interval from 1 through 365 days;
- the persisted task due date shown as the recurrence anchor;
- an explicit message when the task has no due date.

The editor uses the same existing dashboard form boundary as task status, dependencies and reminders.

## Mutation boundary / Límite de mutación

The browser submits only:

- `locale`;
- `operation=task-recurrence`;
- `scope` (`workspace` or `private`);
- `id`;
- `recurrenceMode`;
- `intervalDays`.

The same-origin parser converts this into the already guarded API contract:

```json
{
  "scope": "workspace",
  "recurrenceRule": {
    "kind": "interval_days",
    "intervalDays": 7
  }
}
```

or, when disabled:

```json
{
  "scope": "workspace",
  "recurrenceRule": null
}
```

Unknown fields are rejected before reaching the API. Tenant IDs, user IDs and actor IDs are not accepted from the browser.

## Due-date behavior / Comportamiento de fecha límite

A valid due date remains the server-authoritative requirement for enabling recurrence. The UI disables the interval option when no parseable `dueAt` exists, but this is convenience only; the API remains the security/correctness boundary.

Clearing an existing recurrence remains possible independently of a due-date anchor.

## Explicit boundaries / Límites explícitos

This slice does not:

- create the next task occurrence;
- advance task due dates;
- complete or reopen tasks automatically;
- define monthly/calendar recurrence;
- create recurring reminders;
- infer recurrence from task text;
- allow the browser to choose tenant, actor or execution authority.

Recurrence execution/materialization remains a separate worker-side slice.
