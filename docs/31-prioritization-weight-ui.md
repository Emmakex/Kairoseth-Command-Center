# 31 — Prioritization weight UI / UI de pesos de priorización

## Purpose / Propósito

Phase 5 Slice 7 exposes the already validated workspace prioritization-weight policy through an ES/EN administration surface. It does not change scoring, persistence or authorization semantics.

La Fase 5 Slice 7 expone la política de pesos de priorización del workspace ya validada mediante una superficie de administración ES/EN. No cambia la puntuación, la persistencia ni las reglas de autorización.

## Visibility / Visibilidad

The panel is loaded and rendered only when:

- scope is `workspace`;
- the authenticated session has `automation.manage`;
- the product entitlement includes `command-center` (still enforced authoritatively by the API).

Private scope never loads or renders the editor.

El scope privado nunca carga ni muestra el editor.

## Editor / Editor

The UI presents the 15 deterministic weight contributions grouped into:

- Tasks / Tareas;
- Alerts / Alertas;
- Projects / Proyectos;
- Milestones / Hitos.

Each input is an integer from `0` to `100`. The UI explains that `0` disables that individual contribution and that the final priority score remains capped at `100`.

Cada entrada es un entero entre `0` y `100`. La UI explica que `0` desactiva esa contribución individual y que la puntuación final sigue limitada a `100`.

The current effective state is shown as either default or custom configuration. The form always submits the complete effective set currently displayed.

El estado efectivo actual se muestra como configuración predeterminada o personalizada. El formulario siempre envía el conjunto efectivo completo que se muestra.

## Web mutation boundary / Frontera de mutación web

The browser posts only to the same-origin route:

`POST /api/prioritization/weights`

The web parser:

1. requires `operation=priority-weights-update`;
2. allow-lists exactly the 15 known weight field names plus `locale` and `operation`;
3. requires every displayed weight;
4. accepts only integer strings in `0..100`;
5. rejects unexpected fields, missing values, fractions, negative values and values above 100;
6. constructs a fixed `PATCH /v1/prioritization/weights` request body.

The proxy forwards the authenticated server-side session token to the API. Workspace IDs, user IDs, arbitrary API paths and arbitrary JSON fields are never accepted from the browser as authority.

El proxy reenvía al API el token de sesión autenticado del servidor. Los IDs de workspace/usuario, rutas API arbitrarias y campos JSON arbitrarios nunca se aceptan desde el navegador como autoridad.

## ES/EN invariant / Invariante ES/EN

All panel headings, group names, field labels, help text, default/custom state and save action are available in Spanish and English in the same implementation.

Todos los títulos, grupos, etiquetas, textos de ayuda, estado predeterminado/personalizado y acción de guardado están disponibles en español e inglés en la misma implementación.

## Preserved boundaries / Límites conservados

This slice does not add:

- new scoring weights or reason codes;
- scoring/persistence changes;
- dependency-chain scoring;
- AI-generated weights;
- automatic external actions;
- private-scope overrides.

Esta slice no añade nuevos pesos/códigos, cambios en scoring/persistencia, cadenas de dependencias, pesos generados por IA, acciones externas automáticas ni overrides privados.

## Acceptance / Aceptación

The slice is complete when:

1. the workspace admin sees all 15 effective weights in ES/EN;
2. private scope never loads/renders the panel;
3. parser tests prove full allow-listing and numeric bounds;
4. same-origin mutation forwards only the validated complete weight set;
5. priority rendering continues to require task/alert/project/milestone read capabilities;
6. lint, typecheck, tests, build, Docker smoke and all existing workflows are green on the final head and resulting `main`.
