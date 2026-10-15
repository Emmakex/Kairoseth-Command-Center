# Durable integration sync jobs / Jobs durables de sincronización

## Purpose / Propósito

Scheduled integration refresh must survive process restarts, duplicate scheduler ticks and transient provider failures. This slice establishes a provider-neutral durable job queue before any background GitHub executor is enabled.

La sincronización programada debe sobrevivir reinicios, ticks duplicados del scheduler y fallos transitorios del proveedor. Esta microfase establece primero una cola durable neutral antes de habilitar el ejecutor GitHub en background.

## Job lifecycle / Ciclo de vida

`pending → processing → completed`

Transient failure:

`processing → retry → processing`

Terminal failure after the configured attempt limit:

`processing → dead`

A processing job receives a claim token and lease expiry. Only the holder of the active claim token may complete or retry that job. Expired leases are returned to `retry` with `lastErrorCode=lease_expired`.

Un job en proceso recibe un claim token y una expiración de lease. Solo el poseedor del claim activo puede completar o reintentar ese job. Los leases expirados vuelven a `retry` con `lastErrorCode=lease_expired`.

## Idempotency / Idempotencia

Active jobs are deduplicated by `(workspaceId, dedupeKey)` while their status is `pending`, `processing` or `retry`. Concurrent enqueue races resolve to the same active job instead of generating duplicate provider work.

Los jobs activos se deduplican mediante `(workspaceId, dedupeKey)` mientras estén en `pending`, `processing` o `retry`. Las carreras de enqueue concurrentes convergen en el mismo job activo.

## Retry policy / Política de reintentos

The default retry delay is exponential:

- attempt 1: 30 seconds;
- attempt 2: 60 seconds;
- attempt 3: 120 seconds;
- continues exponentially;
- capped at 60 minutes;
- default maximum: 8 attempts;
- hard maximum: 20 attempts.

Provider-specific rate-limit information may later increase `availableAt`, but it will not bypass the durable retry lifecycle.

La información específica de rate limit del proveedor podrá ampliar `availableAt` posteriormente, sin saltarse el ciclo durable de reintentos.

## Worker boundary / Límite del worker

The worker initializes the queue indexes and requeues expired leases on every tick. **Execution is intentionally disabled in this slice.** The worker must not claim jobs until the GitHub executor and encrypted-credential boundary have been extracted into shared runtime code.

El worker inicializa los índices y recupera leases expirados en cada tick. **La ejecución está deshabilitada expresamente en esta microfase.** El worker no reclamará jobs hasta que el ejecutor GitHub y el límite de credenciales cifradas estén disponibles como runtime compartido.

## Security / Seguridad

- jobs contain resource IDs and normalized error codes, never provider credentials;
- credentials remain outside the job collection;
- claim tokens are random and short-lived through leases;
- retry errors are stable codes, not raw provider response bodies;
- workspace is part of every durable job identity and dedupe boundary.

## Next / Siguiente

The next slice will extract the reusable GitHub sync executor so the worker can safely claim this queue, resolve credentials server-side, refresh the repository, persist normalized signals, and complete or retry the job.
