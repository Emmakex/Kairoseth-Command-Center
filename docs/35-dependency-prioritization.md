# 35 — Dependency-aware prioritization / Priorización por dependencias

## Purpose / Propósito

Phase 5 Slice 11 makes the explicit task dependency graph influence the deterministic priority ranking. The goal is to surface work whose completion unlocks other active work, without inferring relationships, mutating task status or introducing AI into core correctness.

La Slice 11 de la Fase 5 hace que el grafo explícito de dependencias entre tareas influya en el ranking determinista. El objetivo es destacar el trabajo cuya finalización desbloquea otro trabajo activo, sin inferir relaciones, cambiar estados de tareas ni introducir IA en la lógica principal.

## Signal / Señal

A task receives dependency impact when one or more active tasks depend on it, directly or transitively.

Una tarea recibe impacto por dependencias cuando una o más tareas activas dependen de ella, directa o transitivamente.

Rules / Reglas:

- only explicit `Task.dependencyIds` are used;
- downstream tasks in `done` or `cancelled` state do not count and stop transitive propagation through that node;
- every downstream active task is counted once even when multiple graph paths reach it;
- unknown dependency IDs are ignored by ranking because the mutation boundary already rejects them; this keeps legacy/malformed reads fail-safe;
- the current task itself must be active to appear in ranking;
- malformed historical cycles cannot loop forever because traversal uses a visited set.

## Weight / Peso

New configurable weight:

- `taskDependencyImpactPerDependent` — default `10`, integer `0..100`.

Contribution / Contribución:

`min(100, activeUniqueDependentCount × taskDependencyImpactPerDependent)`

The resulting item score remains capped at `100` by the existing prioritization engine.

La contribución de la razón y la puntuación final permanecen limitadas a `100`.

## Explainability / Explicabilidad

Stable reason code / Código estable:

- `task.dependency_impact`

Its `value` is the unique active downstream dependent count and `contribution` is the exact deterministic score contribution.

Su `value` es el número único de dependientes activos aguas abajo y `contribution` es la aportación exacta y determinista.

The ES/EN Today UI renders this as **Desbloquea tareas activas / Unblocks active tasks** with count and contribution.

## Policy compatibility / Compatibilidad de políticas

Existing workspaces may already have a persisted 15-field prioritization policy from Slice 6/7. Those documents do not contain the new dependency weight.

`getEffective()` merges persisted values over current product defaults before validation. Therefore:

- existing configured values remain unchanged;
- the missing new field automatically receives default `10`;
- no destructive database migration is required;
- the next policy update persists the complete current effective set.

## Scope / Alcance

Workspace ranking uses the effective workspace weight policy as before. Private ranking keeps product defaults and uses private tasks only, so dependency traversal cannot cross workspace/private boundaries.

El ranking de workspace usa su política efectiva. El ranking privado conserva los defaults del producto y solo recibe tareas privadas, por lo que el recorrido no cruza límites de ámbito.

## Deliberately excluded / Excluido expresamente

- inferred or AI-generated dependencies;
- automatic task status changes;
- critical-path duration forecasting;
- cross-scope or cross-workspace graph edges;
- external actions triggered by dependency score;
- dependency editor/graph UI.

These remain separate product slices.
