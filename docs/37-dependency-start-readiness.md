# 37 — Dependency start readiness / Preparación de inicio por dependencias

## Goal / Objetivo

Prevent a task from entering `in_progress` while any explicit dependency is still incomplete, without silently mutating task status or inferring dependencies.

Evitar que una tarea pase a `in_progress` mientras alguna dependencia explícita siga incompleta, sin cambiar estados de forma silenciosa ni inferir dependencias.

## Behavior / Comportamiento

- The guard applies only to `PATCH /v1/tasks/:id/status` when the requested status is `in_progress`.
- The authenticated session derives workspace/private scope; client-supplied tenant identifiers are not authoritative.
- The server loads tasks only from that derived scope.
- Every `dependencyId` must resolve to a task with status `done` at the moment the start transition is requested.
- Missing same-scope dependencies are treated as incomplete rather than resolved.
- When any dependency is incomplete the server returns `409` with `task_dependencies_incomplete` and the pending dependency IDs.
- Other explicit status transitions remain unchanged; this slice does not auto-block, auto-start or auto-complete tasks.

## UI correctness / Corrección de UI

The task dependency editor no longer uses the truncated `Today.tasks` list as its dependency catalog. The dashboard now loads the complete authenticated `/v1/tasks?scope=...` collection and uses it to:

- render dependency names even when the dependency is completed;
- offer all same-scope tasks as candidates rather than only the first active Today tasks;
- show pending dependency names;
- disable the Start button when the currently loaded catalog proves dependencies are pending.

The browser is convenience only. The backend guard remains authoritative.

## Security boundary / Límite de seguridad

- `tasks.write` plus the `command-center` entitlement remain required.
- Workspace/private scope is session-derived.
- Cross-scope tasks cannot satisfy a dependency because the guard reads only the authenticated scope.
- Provider credentials and integration data are not involved.

## Explicitly out of scope / Fuera de alcance

- automatic task status mutation when dependencies change;
- critical-path forecasting;
- inferred or AI-generated dependencies;
- cross-workspace dependency edges;
- drag-and-drop graph visualization.
