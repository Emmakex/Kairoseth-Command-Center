# GitHub recurring refresh / Refresh recurrente de GitHub

## Purpose / Propósito

Slice 5c makes GitHub repository signals refresh automatically and durably after the manual/background execution path from Slice 5b has been validated.

La microfase 5c hace que las señales de repositorios GitHub se refresquen de forma automática y durable una vez validado el flujo manual/background de la microfase 5b.

## Runtime flow / Flujo de ejecución

1. The worker discovers GitHub repository resources linked to an active, validated connection in the same workspace.
2. Discovery creates one durable `integration_sync_schedules` record per workspace + provider + kind + resource.
3. Existing schedules preserve their current `nextRunAt`; discovery never resets the cadence on each worker tick.
4. A worker claims one due schedule with a bounded lease.
5. The schedule creates a deduplicated `repository_signals` job using the schedule id and due timestamp.
6. The schedule claim is completed and `nextRunAt` advances by the configured interval.
7. The existing Slice 5b worker execution path claims the job, resolves the encrypted credential server-side, fetches GitHub signals and stores them idempotently.
8. Expired schedule leases and job leases are requeued after worker interruption.

1. El worker descubre recursos de repositorio GitHub vinculados a una conexión activa y validada dentro del mismo workspace.
2. Discovery crea un registro durable `integration_sync_schedules` por workspace + proveedor + tipo + recurso.
3. Los schedules existentes conservan su `nextRunAt`; el descubrimiento no reinicia la cadencia en cada tick del worker.
4. Un worker reclama un schedule vencido mediante un lease limitado.
5. El schedule genera un job `repository_signals` deduplicado usando el id del schedule y el instante programado.
6. Se completa el claim del schedule y `nextRunAt` avanza según el intervalo configurado.
7. El flujo ya validado en Slice 5b reclama el job, resuelve la credencial cifrada en servidor, obtiene las señales GitHub y las persiste de forma idempotente.
8. Los leases expirados de schedules y jobs se reencolan después de una interrupción del worker.

## Default cadence / Cadencia por defecto

GitHub repository refresh schedules currently use a 15-minute interval. Persistence accepts intervals from 5 minutes to 24 hours so later product configuration can be added without changing the durable scheduling model.

Los repositorios GitHub usan actualmente una cadencia de 15 minutos. La persistencia admite intervalos entre 5 minutos y 24 horas para permitir configuración de producto futura sin cambiar el modelo durable.

## Tenant and credential safety / Seguridad de tenant y credenciales

- Discovery joins repository resources and validated connections by both connection id and workspace id.
- Schedules and jobs contain operational identifiers only; provider credentials are never stored in either collection.
- Credential decryption remains in the server-side runtime store immediately before provider execution.
- Repeated discovery does not clear an active schedule lease owned by another worker.
- A unique workspace/provider/kind/resource index prevents duplicate schedules.

- Discovery relaciona recursos y conexiones validadas usando tanto el connection id como el workspace id.
- Schedules y jobs contienen únicamente identificadores operativos; las credenciales del proveedor nunca se guardan en esas colecciones.
- El descifrado de credenciales sigue ocurriendo únicamente en el runtime de servidor antes de ejecutar la llamada al proveedor.
- El discovery repetido no elimina un lease activo perteneciente a otro worker.
- Un índice único workspace/provider/kind/resource evita schedules duplicados.

## Rate limits / Límites de proveedor

`GitHubRestClient` now captures provider retry timing for rate-limited responses:

1. numeric `Retry-After` seconds;
2. HTTP-date `Retry-After`;
3. `X-RateLimit-Reset` Unix timestamp;
4. a five-minute fallback when the provider does not provide usable timing.

The worker converts that timestamp into the durable job retry delay. Provider-directed waits are bounded to 24 hours and are persisted in `availableAt`; the worker process never sleeps for the provider delay.

`GitHubRestClient` ahora captura el momento de reintento indicado por el proveedor:

1. segundos numéricos de `Retry-After`;
2. fecha HTTP de `Retry-After`;
3. timestamp Unix de `X-RateLimit-Reset`;
4. fallback de cinco minutos cuando GitHub no entrega un valor utilizable.

El worker convierte ese instante en el retraso durable del job. Las esperas indicadas por el proveedor quedan limitadas a 24 horas y se persisten en `availableAt`; el proceso worker no se queda bloqueado esperando.

## Recovery and deduplication / Recuperación y deduplicación

Schedule claims have leases. If a worker disappears while owning a schedule, `requeueExpired()` clears the expired lease so another worker can continue. When enqueue succeeds, the job dedupe key is `schedule:<scheduleId>:<dueTimestamp>`, preventing duplicate active jobs for the same occurrence while allowing the next scheduled occurrence to create a new job.

Los claims del schedule tienen lease. Si un worker desaparece mientras posee un schedule, `requeueExpired()` libera el lease vencido para que otro worker continúe. Cuando el enqueue termina correctamente, la clave de deduplicación es `schedule:<scheduleId>:<dueTimestamp>`, evitando jobs activos duplicados para la misma ejecución y permitiendo que la siguiente recurrencia genere un job nuevo.

## Verification / Verificación

The dedicated `GitHub recurring refresh smoke` does not wait for the real 15-minute cadence. It creates the normal validated GitHub binding, waits for schedule discovery, forces that schedule into a known past `nextRunAt`, and verifies:

- the worker claims the schedule;
- a durable job is generated with the expected schedule dedupe key;
- the job reaches `completed`;
- GitHub signals are persisted;
- `lastEnqueuedAt` is recorded;
- `nextRunAt` advances into the future relative to the enqueue time;
- the schedule lease is released;
- neither schedule nor job contains the provider token.

El smoke dedicado `GitHub recurring refresh smoke` no espera los 15 minutos reales. Crea el binding GitHub validado habitual, espera el discovery del schedule, fuerza `nextRunAt` a una fecha conocida en el pasado y comprueba todo el recorrido anterior.

Unit tests additionally verify both `Retry-After` and `X-RateLimit-Reset` normalization without exposing provider response bodies.

Las pruebas unitarias verifican además la normalización de `Retry-After` y `X-RateLimit-Reset` sin exponer el cuerpo de las respuestas del proveedor.

## Next slice / Siguiente microfase

Verified GitHub webhooks are the next integration slice. They should complement recurring polling rather than replace the durable schedule path: webhooks provide low-latency updates while scheduled refresh remains the recovery/reconciliation mechanism.

Los webhooks GitHub verificados son la siguiente microfase. Deben complementar el polling recurrente, no sustituirlo: los webhooks aportan baja latencia y el refresh programado queda como mecanismo de reconciliación y recuperación.
