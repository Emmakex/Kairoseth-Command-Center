# 30 — Prioritization weight policies / Políticas de pesos de priorización

## Purpose / Propósito

Phase 5 Slice 6 makes the existing deterministic priority contributions configurable per workspace without changing the scoring model, reason codes, 100-point score cap or default behavior.

La Fase 5 Slice 6 permite configurar por workspace las contribuciones de prioridad deterministas existentes sin cambiar el modelo de puntuación, los códigos de razón, el límite de 100 puntos ni el comportamiento predeterminado.

## Default compatibility / Compatibilidad predeterminada

When a workspace has no override, the exact historical weights are used:

- task manual priority max / prioridad manual máxima de tarea: `50`;
- task blocked / tarea bloqueada: `30`;
- task overdue / tarea vencida: `35`;
- task due today / tarea vence hoy: `20`;
- alert info / alerta informativa: `30`;
- alert warning / alerta advertencia: `60`;
- alert urgent / alerta urgente: `90`;
- alert critical / alerta crítica: `100`;
- project blocked / proyecto bloqueado: `45`;
- project overdue / proyecto vencido: `35`;
- project due today / proyecto vence hoy: `20`;
- project remaining progress max / progreso restante máximo de proyecto: `20`;
- milestone overdue / hito vencido: `40`;
- milestone due today / hito vence hoy: `25`;
- milestone weight max / peso máximo del hito: `20`.

Therefore installations that do nothing get exactly the Slice 5 ranking behavior.

Por tanto, las instalaciones que no configuran nada reciben exactamente el comportamiento de ranking de la Slice 5.

## Policy model / Modelo de política

A workspace may persist one complete effective weight policy. Every weight is an integer from `0` to `100`.

Un workspace puede persistir una política completa de pesos efectiva. Cada peso es un entero entre `0` y `100`.

A value of `0` suppresses that individual score contribution. The final item score remains capped at `100`, so raising several weights cannot widen the public score range.

Un valor `0` elimina esa contribución individual. La puntuación final sigue limitada a `100`, por lo que aumentar varios pesos no amplía el rango público de puntuación.

Stored policies are unique by workspace and contain no provider credentials or raw provider payloads.

Las políticas almacenadas son únicas por workspace y no contienen credenciales de proveedores ni payloads sin normalizar.

## API / API

Workspace administrators with `automation.manage` and the `command-center` entitlement may use:

- `GET /v1/prioritization/weights` — returns the effective policy and whether it is overridden;
- `PATCH /v1/prioritization/weights` — accepts an allow-listed partial `weights` object and persists the resulting complete effective policy.

The server derives workspace and actor from the authenticated session. Client-supplied workspace/user IDs are rejected rather than used as authority.

El servidor deriva workspace y actor desde la sesión autenticada. Los IDs de workspace/usuario enviados por el cliente se rechazan en lugar de usarse como autoridad.

Unknown keys, empty changes, non-integer values and values outside `0..100` are rejected.

Las claves desconocidas, cambios vacíos, valores no enteros y valores fuera de `0..100` se rechazan.

## Runtime application / Aplicación en runtime

`GET /v1/priorities` loads the effective workspace policy when the requested authenticated scope is `workspace` and passes those weights to the deterministic ranking engine.

`GET /v1/priorities` carga la política efectiva del workspace cuando el scope autenticado solicitado es `workspace` y pasa esos pesos al motor determinista de ranking.

Private scope intentionally keeps the product defaults in this slice. A workspace administrator cannot change a user's private ranking behavior by changing workspace policy.

El scope privado conserva deliberadamente los defaults del producto en esta slice. Un administrador de workspace no puede modificar el ranking privado de un usuario cambiando la política del workspace.

## Audit / Auditoría

Every stored create/update is transactional with the audit outbox and emits:

- `prioritization.weights_changed`
- entity: `prioritization_weight_policy`
- source: `prioritization-policy`

The audit metadata records previous/effective weights, not credentials or external provider data.

La metadata de auditoría registra pesos anteriores/efectivos, no credenciales ni datos externos de proveedores.

## Deliberately deferred / Diferido expresamente

This backend slice does not add:

- customer-facing ES/EN weight editor UI;
- dependency-chain scoring or a dependency data model;
- configurable stale-work thresholds;
- arbitrary executable rule DSL;
- AI-generated weights or silent priority changes;
- actions triggered by a priority score.

Esta slice de backend no añade UI ES/EN de edición de pesos, cadenas de dependencias, thresholds stale configurables, DSL ejecutable, pesos generados por IA ni acciones disparadas por la puntuación.

## Acceptance / Aceptación

The slice is complete when:

1. no override reproduces the historical scoring exactly;
2. a workspace override changes only the allow-listed deterministic contributions;
3. stable reason codes and the 100-point cap remain unchanged;
4. private scope keeps product defaults;
5. workspace policies are isolated, authenticated, authorized and auditable;
6. invalid policy inputs fail closed;
7. unit/API/build/Docker and all existing regression workflows are green on the final head and resulting `main`.
