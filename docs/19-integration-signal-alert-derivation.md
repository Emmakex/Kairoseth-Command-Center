# Integration signal alert derivation / Derivación de alertas desde señales de integración

## ES

### Objetivo

La Slice 5e introduce una capa provider-neutral entre `IntegrationSignal` y las alertas operativas de Gestor de Trabajo. Las reglas no reciben payloads crudos de GitHub: consumen únicamente señales normalizadas y persistidas por la plataforma.

### Flujo

1. Un adaptador obtiene el estado del proveedor.
2. El normalizador genera `IntegrationSignal` provider-neutral.
3. El worker persiste las señales de forma idempotente.
4. El evaluador aplica reglas sobre `type` + payload normalizado.
5. Cada coincidencia produce un candidato de alerta con `ruleId` y `fingerprint` deterministas.
6. La persistencia materializa como máximo una alerta por `workspace + fingerprint`.
7. La creación real genera `alert.derived` mediante el audit outbox transaccional.
8. Reprocesar la misma señal no reabre ni duplica una alerta ya existente.

### Regla inicial

`repository.ci.failed.v1`

- `failure`, `timed_out` y `startup_failure` → alerta `urgent`.
- `action_required` → alerta `warning` mediante `repository.ci.action_required.v1`.
- `success`, `cancelled` y conclusiones no reconocidas no generan alerta.

La regla no comprueba `source === github`; cualquier proveedor futuro que produzca una señal `repository.ci` con el mismo contrato puede reutilizarla.

### Idempotencia y convivencia webhook + polling

El fingerprint incluye versión de regla + ID estable de señal. Por tanto, un webhook y el refresco periódico pueden converger sobre la misma señal sin crear dos alertas. El índice único en MongoDB hace cumplir la garantía, no depende de timing del worker.

### Auditoría

Solo las nuevas alertas producen `alert.derived`. El evento contiene `ruleId`, `signalId`, `signalType`, severidad y timestamp de la señal. No contiene tokens, credenciales ni payloads crudos del proveedor.

### Límites deliberados de esta microfase

- No hay todavía editor de reglas por cliente.
- No se generan alertas por issues abiertos, releases normales o PRs únicamente por existir.
- No se auto-resuelven alertas antiguas cuando llega una señal posterior; ese lifecycle se añadirá en una microfase separada.
- La UI sigue usando el modelo `Alert` existente; la configuración visual/localizada de reglas vendrá después.

### Verificación

El smoke de background usa un workflow fallido y procesa el mismo set de señales dos veces con jobs distintos. Debe observar:

- una única señal CI durable;
- una única alerta derivada `urgent`;
- un único `alert.derived` en Timeline;
- dos jobs completados sin duplicación de alerta;
- ausencia del token del proveedor en logs del worker.

## EN

### Goal

Slice 5e adds a provider-neutral layer between `IntegrationSignal` and Work Manager operational alerts. Rules never consume raw GitHub webhook/provider payloads; they only consume normalized signals produced by the platform.

### Flow

1. An adapter reads provider state.
2. The normalizer emits provider-neutral `IntegrationSignal` records.
3. The worker persists signals idempotently.
4. The evaluator applies rules against signal `type` and normalized payload fields.
5. Each match produces an alert candidate with deterministic `ruleId` and `fingerprint`.
6. Persistence materializes at most one alert per `workspace + fingerprint`.
7. A newly created alert emits transactional `alert.derived` audit work.
8. Reprocessing the same signal never reopens or duplicates an existing alert.

### Initial rule

`repository.ci.failed.v1`

- `failure`, `timed_out`, and `startup_failure` → `urgent` alert.
- `action_required` → `warning` alert through `repository.ci.action_required.v1`.
- `success`, `cancelled`, and unknown conclusions produce no alert.

The rule does not check `source === github`; any future provider that emits the same `repository.ci` contract can reuse it.

### Idempotency and webhook + polling convergence

The fingerprint contains rule version + stable signal ID. Webhook ingestion and recurring polling can therefore converge on the same signal without duplicate alerts. A unique MongoDB index enforces the guarantee independently of worker timing.

### Audit

Only newly materialized alerts emit `alert.derived`. Audit metadata contains rule ID, signal ID/type, severity, and signal timestamp. Provider credentials and raw provider payloads are never copied into the audit event.

### Deliberate limits of this micro-slice

- No customer rule editor yet.
- Open issues, normal releases, and merely existing PRs do not create alerts.
- Existing derived alerts are not auto-resolved from later signals yet; lifecycle automation is a separate micro-slice.
- The UI continues to use the existing `Alert` model; rule configuration and localized presentation come later.

### Verification

The background smoke exposes a failed workflow and processes the same provider signal set twice through different durable jobs. It must observe:

- one durable CI signal;
- one `urgent` derived alert;
- one Timeline `alert.derived` event;
- two completed jobs without alert duplication;
- no provider token in worker logs.
