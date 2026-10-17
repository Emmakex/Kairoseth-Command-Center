# Agent Bridge observability foundation / Base de observabilidad de Agent Bridge

Status: **foundation implemented / base implementada**

This slice establishes the first operator-facing Agent Bridge observability surface inside Kairoseth Platform. It intentionally exposes only tenant-scoped aggregate state from the authoritative A2A task backend.

Esta microfase establece la primera superficie de observabilidad de Agent Bridge orientada a operadores dentro de Kairoseth Platform. Expone de forma intencionada únicamente estado agregado y limitado al tenant desde el backend A2A autoritativo.

## API

`GET /v1/products/agent-bridge/observability`

Requirements / Requisitos:

- authenticated Kairoseth Platform session / sesión autenticada de Kairoseth Platform;
- active workspace / espacio de trabajo activo;
- `agent-bridge` product entitlement / entitlement de producto `agent-bridge`;
- `Cache-Control: no-store`;
- the tenant is always the authenticated `activeWorkspaceId`; callers cannot choose another tenant / el tenant siempre es el `activeWorkspaceId` autenticado y el cliente no puede seleccionar otro tenant.

Response contract / Contrato de respuesta:

```json
{
  "version": "kcc.agent-bridge-observability.v1",
  "summary": {
    "totalTasks": 0,
    "activeClaims": 0,
    "installations": 0,
    "latestUpdatedAt": null,
    "states": {
      "TASK_STATE_UNSPECIFIED": 0,
      "TASK_STATE_SUBMITTED": 0,
      "TASK_STATE_WORKING": 0,
      "TASK_STATE_COMPLETED": 0,
      "TASK_STATE_FAILED": 0,
      "TASK_STATE_CANCELED": 0,
      "TASK_STATE_INPUT_REQUIRED": 0,
      "TASK_STATE_REJECTED": 0,
      "TASK_STATE_AUTH_REQUIRED": 0
    }
  }
}
```

The endpoint fails closed with `503 agent_bridge_observability_unavailable` when the authoritative aggregate source is unavailable.

El endpoint falla de forma cerrada con `503 agent_bridge_observability_unavailable` cuando la fuente autoritativa de agregados no está disponible.

## Operator surface / Superficie de operador

Kairoseth Platform exposes the dedicated route:

`/{locale}/ia/agent-bridge`

with `locale = es | en`.

The workspace dashboard only shows the entry point when the current session has the `agent-bridge` entitlement. The page presents:

- total A2A tasks / total de tareas A2A;
- active atomic transition claims / claims de transición atómicos activos;
- distinct Agent Bridge installations represented in the authoritative task store / instalaciones distintas representadas en el almacén autoritativo;
- tasks awaiting authorization / tareas pendientes de autorización;
- per-state aggregate task counts / conteos agregados por estado;
- latest authoritative task update timestamp / última actualización autoritativa.

## Security and privacy boundary / Límite de seguridad y privacidad

This dashboard is intentionally aggregate-only. It does **not** return or render:

- actor identities;
- task IDs;
- tool IDs;
- tool inputs or outputs;
- correlation IDs;
- action fingerprints;
- claim IDs;
- credentials or secrets.

La superficie es deliberadamente solo agregada. No devuelve ni representa identidades de actores, IDs de tareas, herramientas, inputs/outputs, correlaciones, huellas de acción, IDs de claim, credenciales ni secretos.

This keeps the operator view useful without turning observability into a second task inspection or execution channel.

Esto mantiene la utilidad operativa sin convertir observabilidad en un segundo canal de inspección o ejecución de tareas.

## Roadmap boundary / Límite de roadmap

This microphase is the **observability foundation**, not the final Phase 6 observability closure.

Esta microfase es la **base de observabilidad**, no el cierre definitivo de observabilidad de Fase 6.

Still open before the Agent Bridge Platform observability items can be marked complete:

- authoritative runtime heartbeat/connectivity status per installation;
- runtime version and deployment surface visibility;
- connector health projection suitable for Platform operators;
- production acceptance of the full ES/EN operator surface.

Antes de marcar los ítems de observabilidad como completados todavía faltan el estado autoritativo de heartbeat/conectividad por instalación, versión/superficie de despliegue del runtime, proyección de salud de conectores y aceptación productiva de la superficie completa ES/EN.
