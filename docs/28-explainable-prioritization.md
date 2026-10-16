# 28 — Explainable prioritization / Priorización explicable

## Goal / Objetivo

Turn the existing Today surface into an ordered attention view without making AI, a remote model or an opaque score a dependency of core product behavior.  
Convertir la pantalla Hoy existente en una vista ordenada de atención sin hacer que la IA, un modelo remoto o una puntuación opaca sean una dependencia del comportamiento principal del producto.

## Phase 5 Slice 4 scope / Alcance de Slice 4

This slice introduces a deterministic priority ranking across active Tasks and Alerts.

It deliberately combines different operational sources already normalized by Command Center:

- manually captured tasks;
- workspace/private operational tasks;
- manual alerts;
- integration-derived alerts such as CI failures and stale work.

The ranking is available through `GET /v1/priorities` and rendered in the ES/EN Today dashboard.

## Scoring model / Modelo de puntuación

Scores are capped to `0..100` and every contribution is returned to the client as a structured reason.

### Tasks / Tareas

- manual task priority contributes `priority × 0.5` (maximum `+50`);
- blocked task contributes `+30`;
- overdue task contributes `+35`;
- task due today contributes `+20`.

Completed and cancelled tasks are excluded.

### Alerts / Alertas

Active alert severity maps directly to attention score:

- `critical` → `100`;
- `urgent` → `90`;
- `warning` → `60`;
- `info` → `30`.

Resolved and dismissed alerts are excluded. Open and acknowledged alerts remain visible.

## Explainability / Explicabilidad

Every ranked item contains:

- entity kind (`task` or `alert`);
- stable entity ID;
- title;
- resulting score;
- current status;
- optional project/due/severity context;
- an ordered list of reason codes with their exact score contribution and optional source value.

Current reason codes:

- `task.manual_priority`;
- `task.blocked`;
- `task.overdue`;
- `task.due_today`;
- `alert.severity`.

The ES/EN UI translates those stable codes into user-facing explanations such as `Tarea bloqueada (+30)` / `Task blocked (+30)`.

## Deterministic ordering / Orden determinista

Candidates are ordered by:

1. score descending;
2. due date ascending when scores are equal;
3. alerts before tasks when score and due ordering are equal;
4. stable entity ID as the final deterministic tie-breaker.

The API limits one request to 20 items; the Today surface requests the top 8.

## Authorization and scope / Autorización y alcance

`GET /v1/priorities`:

- derives workspace/private scope from the authenticated session;
- requires `tasks.read` and `alerts.read` for that scope;
- requires the `command-center` product entitlement through the normal authorization layer;
- never accepts workspace or private user IDs from the client;
- returns `cache-control: no-store`.

Workspace and private rankings remain isolated.

## Timezone behavior / Comportamiento horario

Due-today and overdue reasons use the authenticated user's timezone to calculate the local day boundary, matching the Today product model.

## AI boundary / Límite de IA

This scoring engine is intentionally non-AI and forms the correctness baseline for prioritization.

Future AI assistance may summarize or suggest priority changes, but it must not silently replace these deterministic reasons or become necessary to obtain a usable priority list.

## Acceptance / Aceptación

Slice 4 is accepted when:

1. scoring is deterministic and capped at 100;
2. every score contribution is exposed as a stable reason code;
3. completed/cancelled tasks and resolved/dismissed alerts are excluded;
4. blocked/overdue/due-today task behavior has unit coverage;
5. alert severity ordering has unit coverage;
6. the API is authenticated, scope-derived and capability-gated;
7. invalid result limits are rejected;
8. ES/EN Today UI shows the top priorities and translated reasons;
9. no AI or provider credential is needed for ranking;
10. lint, typecheck, tests, build and all existing regression workflows remain green.

## Deliberately deferred / Diferido expresamente

- customer-configurable priority weights;
- project/milestone risk contributions;
- dependency-chain scoring;
- calendar/communication adapters;
- AI-generated prioritization suggestions;
- automatic external actions from priority score.
