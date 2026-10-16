# 36 — Task dependency UI / UI de dependencias entre tareas

## Purpose / Propósito

Phase 5 Slice 12 exposes the already-proven task dependency graph through the ES/EN task surface. It adds no new backend authority or scoring behavior.

La Slice 12 de la Fase 5 expone el grafo de dependencias ya validado desde la superficie de tareas ES/EN. No añade nueva autoridad backend ni cambia el scoring.

## Surface / Superficie

Every task card shows its current dependencies by task title and includes a multiple selector containing the other tasks in the same Today scope.

Cada tarjeta de tarea muestra sus dependencias actuales por título e incluye un selector múltiple con las demás tareas del mismo ámbito de Hoy.

- ES: **Dependencias** / **Guardar dependencias**.
- EN: **Dependencies** / **Save dependencies**.
- The current task is never offered as its own dependency.
- An empty selection sends `dependencyIds: []` and clears the dependency set.
- The UI uses `TodayResponse.tasks`, which is already resolved by the authenticated workspace/private scope.

## Same-origin mutation boundary / Límite de mutación same-origin

The existing `/api/operations` form proxy is reused. The browser still submits a same-origin POST; its validated server-side parser forwards the authoritative backend mutation as:

`PUT /v1/tasks/:id/dependencies`

For the `task-dependencies` operation the parser accepts only:

- `locale`
- `operation`
- `scope`
- `id`
- repeated `dependencyIds`

It rejects:

- more than 50 dependency IDs;
- empty or over-100-character IDs;
- duplicate IDs;
- self-dependency;
- unexpected fields such as `workspaceId`, `userId` or `actorUserId`.

The API remains authoritative for same-scope existence, cycle prevention, capability/entitlement checks, transactionality and audit.

La API continúa siendo la autoridad para existencia en el mismo ámbito, prevención de ciclos, permisos, transacción y auditoría.

## Compatibility / Compatibilidad

`TaskSummary.dependencyIds` is optional so legacy task documents without the field render as **Sin dependencias / No dependencies**.

No database migration is required for the UI.

## Responsive behavior / Comportamiento responsive

The dependency editor is grouped with task actions, uses the existing management layout and collapses to a single column on narrow screens.

## Deliberately excluded / Excluido expresamente

- graph visualization;
- drag-and-drop dependency editing;
- automatic status changes;
- inferred/AI-generated dependencies;
- cross-scope choices;
- new priority logic.
