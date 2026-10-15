# GitHub dashboard signals / Señales GitHub para el dashboard

## Purpose / Propósito

This Phase 4 slice turns linked GitHub repository activity into the existing provider-neutral `IntegrationSignal` contract used by Work Manager / Gestor de Trabajo.

Esta microfase de la Fase 4 transforma la actividad de repositorios GitHub ya vinculados al contrato neutral `IntegrationSignal` existente en Work Manager / Gestor de Trabajo.

## Read endpoint

`GET /v1/integrations/github/repositories/:resourceId/signals?limit=20`

The endpoint:

- derives workspace from the authenticated session;
- requires the `command-center` product entitlement and `projects.read` capability;
- resolves repository coordinates and encrypted credentials server-side;
- accepts only a previously linked repository resource;
- requires a validated active GitHub connection;
- never returns token, secret reference, ciphertext or raw provider bodies;
- returns at most 50 normalized signals ordered by most recent activity.

## Signal mapping / Mapeo

| GitHub source | Integration signal | Main payload |
| --- | --- | --- |
| Pull request | `repository.pull_request` | number, title, state, draft, merged, URL |
| Issue | `repository.issue` | number, title, state, URL |
| Actions workflow run | `repository.ci` | name, status, conclusion, event, branch, SHA, URL |

GitHub's issues endpoint also returns pull requests. Those rows are explicitly excluded from `repository.issue` so one remote PR cannot become two dashboard signals.

El endpoint de issues de GitHub también devuelve pull requests. Esas filas se excluyen explícitamente de `repository.issue` para evitar duplicados en el dashboard.

## Security boundary / Límite de seguridad

The browser never chooses an upstream GitHub URL, owner, repository or credential. All of them are derived from the workspace-scoped `ExternalResource` and its validated `IntegrationConnection`.

A provider 401 marks the connection as invalid using the existing validation-failure path. Repository access errors and rate limiting remain normalized and do not expose provider response bodies.

## Deliberately deferred / Aplazado expresamente

This slice does not persist signals yet and does not create alerts automatically. It establishes the stable read/normalization boundary first. Persistence, scheduled refresh, verified webhooks and signal-derived automation remain later Phase 4 slices.
