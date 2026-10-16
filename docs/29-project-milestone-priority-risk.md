# 29 — Project and milestone priority risk / Riesgo de prioridad de proyectos e hitos

## Purpose / Propósito

Phase 5 Slice 5 extends the deterministic explainable prioritization engine from tasks and alerts to project and milestone delivery risk.

La Fase 5 Slice 5 amplía el motor determinista de priorización explicable desde tareas y alertas al riesgo de entrega de proyectos e hitos.

The ranking remains a read-only attention aid. It does not mutate projects, milestones, tasks, alerts or external systems, and it does not require AI.

El ranking sigue siendo una ayuda de atención de solo lectura. No modifica proyectos, hitos, tareas, alertas ni sistemas externos y no requiere IA.

## Project risk / Riesgo de proyecto

Only projects with a concrete current risk contribute a project priority candidate. `done` and `archived` projects are excluded.

Solo los proyectos con un riesgo actual concreto generan un candidato de prioridad. Los proyectos `done` y `archived` se excluyen.

Deterministic contributions:

- blocked project / proyecto bloqueado: `+45`;
- overdue project / proyecto vencido: `+35`;
- project due today / proyecto que vence hoy: `+20`;
- remaining progress when the project is overdue or due today / progreso restante cuando el proyecto está vencido o vence hoy: up to `+20`, calculated as `round((100 - progress) * 0.2)`.

A project that is neither blocked nor due/overdue is not added merely because its progress is below 100. This avoids converting normal in-progress work into noise.

Un proyecto que no está bloqueado ni vence hoy/está vencido no se añade únicamente porque su progreso sea inferior a 100. Así se evita convertir el trabajo normal en ruido.

## Milestone risk / Riesgo de hito

`done` and `cancelled` milestones are excluded. Future milestones are also excluded from this slice until they become due today or overdue.

Los hitos `done` y `cancelled` se excluyen. Los hitos futuros también se excluyen de esta slice hasta que venzan hoy o estén vencidos.

Deterministic contributions:

- overdue milestone / hito vencido: `+40`;
- milestone due today / hito que vence hoy: `+25`;
- milestone weight / peso del hito: up to `+20`, calculated as `round(weight * 0.2)` after normalizing weight to `1..100`.

The milestone weight only changes the importance of a milestone that is already time-critical; it does not make future milestones appear in the attention list.

El peso del hito solo modifica la importancia de un hito que ya es crítico por fecha; no hace aparecer hitos futuros en la lista de atención.

## Combined ranking / Ranking combinado

`GET /v1/priorities` ranks tasks, alerts, projects and milestones in one deterministic list. Every score remains capped at 100 and every contribution is returned as a stable reason code for ES/EN presentation.

`GET /v1/priorities` ordena tareas, alertas, proyectos e hitos en una única lista determinista. Cada puntuación sigue limitada a 100 y cada contribución se devuelve como un código de razón estable para su presentación ES/EN.

The priority route requires the authenticated scope to have all required read capabilities:

- `tasks.read`;
- `alerts.read`;
- `projects.read`;
- `milestones.read`;
- `command-center` product entitlement.

Workspace/private scope is derived from the authenticated session. Client-supplied workspace or user IDs are not accepted as authority.

El ámbito workspace/private se deriva de la sesión autenticada. Los IDs de workspace o usuario enviados por el cliente no se aceptan como autoridad.

## Stable reason codes / Códigos de razón estables

This slice adds:

- `project.blocked`;
- `project.overdue`;
- `project.due_today`;
- `project.remaining_progress`;
- `milestone.overdue`;
- `milestone.due_today`;
- `milestone.weight`.

The ES/EN web layer translates these codes but does not alter their score contributions.

La capa web ES/EN traduce estos códigos, pero no modifica sus contribuciones a la puntuación.

## Deliberately deferred / Diferido expresamente

This slice does not introduce:

- task/project dependency-chain scoring;
- customer-configurable priority weights;
- forecasts or probabilistic deadline prediction;
- AI-generated scores or silent priority mutations;
- new external-provider dependencies;
- automation actions triggered by a priority score.

Esta slice no introduce cadenas de dependencias, pesos configurables por cliente, predicción probabilística, puntuaciones generadas por IA, nuevas dependencias de proveedores ni acciones automáticas disparadas por la puntuación.

## Acceptance / Aceptación

The slice is complete when:

1. task/alert scoring remains backward-compatible;
2. blocked/due project risk is ranked with exact explainable contributions;
3. due/overdue milestone risk is ranked with exact explainable contributions;
4. inactive/completed/future non-risk entities remain excluded as defined above;
5. API capability and authenticated-scope boundaries remain enforced;
6. ES/EN UI presents project/milestone kinds and reasons;
7. unit/API/build/Docker and all existing regression workflows are green on the final head and resulting `main`.
