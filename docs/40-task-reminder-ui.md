# 40 — Task reminder UI / UI de recordatorios de tareas

## Purpose / Objetivo

Phase 5 Slice 16 exposes the proven one-time reminder model to users in the ES/EN task surface without expanding the reminder domain.

La Slice 16 de la Fase 5 expone el modelo probado de recordatorios de una sola vez en la superficie ES/EN de tareas sin ampliar el dominio de recordatorios.

## User experience / Experiencia de usuario

Each visible task includes a reminder editor alongside its existing status and dependency controls.

Cada tarea visible incluye un editor de recordatorios junto a sus controles existentes de estado y dependencias.

The editor supports:

- up to 10 one-time date/time values;
- adding and removing rows without leaving the task card;
- clearing all reminder rules by leaving the editor empty and saving;
- workspace and private scopes;
- ES/EN copy;
- displaying the authenticated user's configured time zone.

## Time-zone correctness / Corrección de zona horaria

The browser submits `datetime-local` values without tenant, user or time-zone authority fields.

El navegador envía valores `datetime-local` sin campos de autoridad de tenant, usuario o zona horaria.

For reminder mutations only, the same-origin web route resolves the authenticated session through the existing API and takes `session.user.timezone` as the authoritative IANA zone. The parser converts each local date/time to a UTC ISO instant before calling `PUT /v1/tasks/:id/reminders`.

Solo para mutaciones de recordatorios, la ruta web same-origin resuelve la sesión autenticada mediante el API existente y usa `session.user.timezone` como zona IANA autoritativa. El parser convierte cada fecha/hora local a un instante ISO UTC antes de llamar a `PUT /v1/tasks/:id/reminders`.

The conversion performs a zone round-trip. Non-existent local times during daylight-saving transitions are rejected instead of silently shifting the requested reminder. Existing seconds are preserved by the editor.

La conversión realiza un round-trip de zona. Las horas locales inexistentes durante cambios de horario se rechazan en lugar de desplazar silenciosamente el recordatorio solicitado. El editor conserva los segundos existentes.

## Security boundary / Límite de seguridad

- The browser may choose only `workspace` or `private`, as in existing task operations.
- Workspace/user IDs are not accepted by the reminder form parser.
- The same-origin route never accepts a client-supplied authoritative time zone.
- The backend remains authoritative for `tasks.write`, product entitlement, scope derivation and final reminder validation.
- The UI reuses the existing guarded task reminder endpoint and introduces no new backend mutation.

## Validation / Validación

Web tests cover:

- summer and winter Madrid UTC conversion;
- second preservation;
- rejection of the non-existent Madrid spring-forward local time;
- deterministic sorting;
- clearing all reminders;
- missing authenticated time zone;
- duplicate reminder instants;
- the 10-reminder limit;
- rejection of client-supplied workspace authority.

## Deliberately deferred / Diferido expresamente

- recurring reminder rules;
- email, push, SMS or third-party delivery;
- snooze/repeat behavior;
- AI-generated reminder times;
- arbitrary automation DSL or external actions.
