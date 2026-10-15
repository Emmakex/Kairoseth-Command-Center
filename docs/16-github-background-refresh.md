# GitHub background refresh / Refresh GitHub en background

## Purpose / Propósito

Slice 5b turns the durable integration job queue into a real GitHub signal refresh path without moving provider credentials into jobs or browser requests.

La microfase 5b convierte la cola durable de jobs en un flujo real de refresh GitHub sin introducir credenciales del proveedor en jobs ni peticiones del navegador.

## End-to-end path / Flujo end-to-end

1. An authenticated integration administrator requests a background refresh for a linked GitHub repository.
2. The API verifies the repository and its validated connection inside the authenticated workspace.
3. The API enqueues a provider-neutral durable job containing only workspace/resource metadata.
4. The worker claims only `provider=github` + `kind=repository_signals` jobs with a bounded lease.
5. The worker resolves the repository, validated connection and encrypted secret server-side.
6. The shared GitHub client reads pull requests, issues, workflow runs and releases.
7. The shared normalizer produces the same provider-neutral `IntegrationSignal` records used by the live API path.
8. Signals are upserted idempotently and the job is completed.

## API / API

`POST /v1/integrations/github/repositories/:resourceId/refresh`

Requirements:

- authenticated active workspace;
- `command-center` entitlement;
- `integrations.manage` capability;
- linked GitHub repository;
- same-workspace validated active GitHub connection.

The response is `202 Accepted` with safe operational job metadata only. It never contains token, `secretRef`, ciphertext, claim token or dedupe internals.

## Shared runtime / Runtime compartido

The API and worker now reuse:

- `@kcc/integrations/github` for provider requests and normalized provider errors;
- `@kcc/integrations/github-signals` for signal mapping and ordering;
- `@kcc/persistence/integration-secrets` for the AES-256-GCM credential vault;
- `@kcc/persistence/github-signal-runtime` for workspace-scoped repository → connection → credential resolution.

The former API provider/vault modules remain compatibility shims so existing API routes and tests keep the same import surface while implementation lives in shared packages.

## Failure policy / Política de fallos

- GitHub `401`: invalidate the connection and terminate the job as `dead`.
- GitHub `403`: terminal `dead` job.
- GitHub `404`: terminal `dead` job.
- Rate limit: retry with a longer initial delay (5 minutes) and 60-minute cap.
- Timeout: retry through the durable exponential backoff policy.
- Upstream/transient error: retry through the durable exponential backoff policy.
- Missing/invalid repository, connection or credential runtime: terminal `dead` job.

Jobs that exhaust their maximum attempts transition to `dead`. Claim-token ownership and leases from Slice 5a remain enforced for every transition.

## Worker safety / Seguridad del worker

If `KCC_INTEGRATION_SECRET_KEY` is absent, the worker does not claim GitHub integration jobs. It may still drain the existing audit outbox and repair expired leases.

The worker claims only the GitHub repository-signal job kind. This prevents it from accidentally consuming future provider/job types that it does not understand.

## Verification / Verificación

A dedicated Docker smoke uses two provider mocks:

- the existing strict GitHub mock for credential validation and repository binding;
- a separate worker-only signal mock for PR/issues/CI/releases.

The smoke proves that a durable job is claimed by the worker, signals are persisted, the job reaches `completed`, and worker logs do not expose the provider token.

## Deliberately deferred / Aplazado expresamente

Slice 5b does not generate recurring jobs yet and does not add webhooks or signal-derived alerts. Slice 5c will add recurring schedule generation and rate-limit-aware next-run timing after this worker execution path is stable.
