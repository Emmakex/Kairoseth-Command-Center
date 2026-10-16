# 34 — Task dependencies / Dependencias entre tareas

## Purpose / Propósito

Phase 5 Slice 10 introduces the first explicit dependency graph between tasks so later prioritization can reason about blocked chains without inventing relationships from text or AI.

La Slice 10 de la Fase 5 introduce el primer grafo explícito de dependencias entre tareas para que una priorización posterior pueda razonar sobre cadenas bloqueadas sin inventar relaciones desde texto o IA.

## Data model / Modelo de datos

`Task.dependencyIds?: string[]` stores the IDs of tasks that must precede the current task.

`Task.dependencyIds?: string[]` guarda los IDs de las tareas que deben preceder a la tarea actual.

Compatibility rules / Reglas de compatibilidad:

- legacy tasks without `dependencyIds` are interpreted as having no dependencies;
- new dependency mutations persist an explicit array, including `[]` when clearing dependencies;
- the field contains local Command Center task IDs only, never provider IDs or URLs.

## Mutation contract / Contrato de mutación

`PUT /v1/tasks/:id/dependencies`

Request body / Cuerpo:

```json
{
  "scope": "workspace",
  "dependencyIds": ["task-id-a", "task-id-b"]
}
```

The API derives workspace/private identity and actor from the authenticated session. Client-supplied workspace/user/actor identifiers are not authority inputs.

La API deriva workspace/ámbito privado y actor desde la sesión autenticada. Los identificadores de workspace/usuario/actor enviados por el cliente no son entradas de autoridad.

## Invariants / Invariantes

1. Maximum 50 direct dependencies per task.
2. Dependency IDs are unique, non-empty and at most 100 characters.
3. A task cannot depend on itself.
4. Every referenced dependency must exist in the exact same resolved scope.
5. Cross-workspace and cross-user-private references are treated as not found.
6. The resulting graph must remain acyclic, including transitive chains.
7. Dependency graph mutations require `tasks.write` plus the `command-center` entitlement.
8. The mutation and its `task.dependencies_changed` audit event commit transactionally.
9. Concurrent graph mutations are serialized per scope through `task_dependency_graph_versions` so write-skew cannot create a cycle from two individually valid snapshots.
10. Task dependency changes do not alter priority scores in this slice.

## Concurrency / Concurrencia

A per-scope graph-version document is incremented inside every dependency transaction before the graph is read. Concurrent writers therefore contend on the same document. MongoDB transaction retry semantics force the later writer to re-evaluate the graph against the committed state instead of accepting two mutually dependent updates from stale snapshots.

Un documento de versión del grafo por ámbito se incrementa dentro de cada transacción antes de leer el grafo. Los escritores concurrentes compiten así por el mismo documento. Los reintentos transaccionales de MongoDB obligan al escritor posterior a reevaluar el grafo contra el estado ya confirmado.

## Audit / Auditoría

Successful mutations enqueue `task.dependencies_changed` through the transactional audit outbox with:

- actor derived from session;
- task entity ID/title;
- previous dependency IDs;
- resulting dependency IDs.

No provider credentials or external payloads are introduced.

## Deliberately deferred / Diferido expresamente

- dependency-chain priority scoring;
- automatic task status changes based on dependencies;
- customer-facing dependency editor/graph UI;
- cross-project restrictions beyond the existing scope boundary;
- inferred/AI-generated dependencies.

Those are separate slices after the graph model and lifecycle are proven green.
