# Durable integration signal history / Historial durable de señales

## Purpose / Propósito

Work Manager / Gestor de Trabajo must not depend on GitHub being reachable every time the dashboard is opened. This slice adds durable provider-neutral signal history on top of the live normalization boundary.

Work Manager / Gestor de Trabajo no debe depender de que GitHub esté disponible cada vez que se abre el dashboard. Esta microfase añade historial durable y neutral de proveedor sobre la normalización live ya existente.

## Storage model / Modelo de almacenamiento

Signals are stored in MongoDB collection `integration_signals` using the existing `IntegrationSignal` contract plus internal indexing metadata.

Las señales se guardan en la colección MongoDB `integration_signals` usando el contrato `IntegrationSignal` existente más metadatos internos de indexación.

Key properties:

- unique identity: `(workspaceId, signal.id)`;
- repeated refreshes use upsert, so the same provider event is updated rather than duplicated;
- `resourceId` and `projectId` are copied from the normalized payload into internal indexed fields;
- `ingestedAt` records first durable ingestion;
- `updatedAt` records the latest local refresh;
- public reads return only the provider-neutral `IntegrationSignal`, never internal persistence metadata.

Propiedades principales:

- identidad única: `(workspaceId, signal.id)`;
- los refresh repetidos usan upsert y no duplican el mismo evento remoto;
- `resourceId` y `projectId` se copian del payload normalizado a campos internos indexados;
- `ingestedAt` registra la primera ingestión durable;
- `updatedAt` registra el último refresh local;
- las lecturas públicas devuelven únicamente `IntegrationSignal`, no metadatos internos de persistencia.

## Durable write path / Flujo de escritura

A successful GitHub repository signal refresh normalizes pull requests, issues, CI runs and releases first. The complete normalized set is then upserted before the live response is returned.

Un refresh correcto de señales GitHub normaliza primero pull requests, issues, CI y releases. Después hace upsert de todo el conjunto normalizado antes de devolver la respuesta live.

The store rejects any signal whose `workspaceId` does not match the workspace supplied by the authenticated server path.

El store rechaza cualquier señal cuyo `workspaceId` no coincida con el workspace suministrado por la ruta autenticada del servidor.

## History endpoint / Endpoint de historial

`GET /v1/integrations/signals`

Supported filters:

- `resourceId`
- `projectId`
- `type` (single or comma-separated supported signal types)
- `limit` (1–100, default 50)

The workspace is always derived from the authenticated session and cannot be supplied by the client. Reading history requires `projects.read` plus the `command-center` entitlement.

El workspace siempre se deriva de la sesión autenticada y no puede ser elegido por el cliente. La lectura del historial requiere `projects.read` y el entitlement `command-center`.

## Indexes / Índices

- unique `{ workspaceId, id }`;
- `{ workspaceId, occurredAt, id }`;
- `{ workspaceId, resourceId, occurredAt }`;
- `{ workspaceId, projectId, occurredAt }`;
- `{ workspaceId, type, occurredAt }`.

## Deliberately deferred / Aplazado expresamente

This slice does not add background polling, retry queues, rate-limit scheduling, webhooks or signal-derived alerts. Those are later Phase 4 slices after durable history is validated.

Esta microfase no añade polling en background, colas de reintentos, planificación por rate limit, webhooks ni alertas derivadas de señales. Esos pasos permanecen para microfases posteriores de la Fase 4.
