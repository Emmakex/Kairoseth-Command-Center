# Integration activity surface / Superficie de actividad de integraciones

## ES

### Objetivo

La Slice 5g lleva al dashboard las señales normalizadas que ya existen en el backend. Su función es dar contexto operativo: qué ha cambiado recientemente en repositorios y otras herramientas conectadas, sin convertir esta superficie en un segundo sistema de alertas ni en una consola de administración de integraciones.

### Separación de responsabilidades

- **Actividad de integraciones**: hechos externos normalizados recientes.
- **Alertas**: condiciones accionables derivadas de esos hechos.
- **Timeline**: historial de cambios/auditoría generado por el servidor sobre Work Manager.

Estas tres superficies no se sustituyen entre sí.

### Alcance

- Visible únicamente en la vista de workspace.
- Solo lectura.
- Consume `GET /v1/integrations/signals` con un límite pequeño para el dashboard.
- Renderiza tipos provider-neutral: commit, pull request, issue, CI, release, calendario y webhook genérico.
- Presenta etiquetas ES/EN y fechas en la zona horaria del usuario.
- Mantiene fallback seguro cuando una señal normalizada es parcial o no contiene campos descriptivos.

### Seguridad de presentación

La UI usa únicamente campos descriptivos normalizados. No muestra `resourceId`, `providerId`, `workspaceId`, referencias de secretos ni credenciales.

Los enlaces externos se renderizan únicamente cuando el valor normalizado `url` es una URL válida con esquema `http:` o `https:`. Esquemas como `javascript:` o `data:` se descartan.

La vista privada no solicita ni renderiza señales del workspace.

### Aceptación

El Docker smoke general:

1. inicia sesión con la identidad standalone real;
2. obtiene el workspace activo desde la sesión autenticada;
3. inserta una señal CI normalizada durable en ese workspace;
4. comprueba que `/es?scope=workspace` muestra `Actividad de integraciones`, la señal y el estado localizado;
5. comprueba la misma señal en `/en?scope=workspace` con textos EN;
6. comprueba que `/es?scope=private` no contiene ni el ID ni el contenido de esa señal workspace.

Los tests unitarios adicionales prueban la presentación de PR/CI, los fallbacks y el rechazo de URLs con esquemas inseguros.

### Fuera de esta slice

- Administración de conexiones o credenciales desde la UI.
- Editor de reglas por cliente.
- Políticas stale para PR/issues.
- OAuth/GitHub App.
- Acciones remotas sobre GitHub desde esta superficie.

## EN

### Goal

Slice 5g brings the normalized signals already available in the backend into the dashboard. Its role is operational context: show what recently changed in repositories and other connected tools without turning this surface into a second alert system or an integration administration console.

### Responsibility boundaries

- **Integration activity**: recent normalized external facts.
- **Alerts**: actionable conditions derived from those facts.
- **Timeline**: server-authored Work Manager change/audit history.

These surfaces complement rather than replace each other.

### Scope

- Workspace view only.
- Read-only.
- Consumes `GET /v1/integrations/signals` with a small dashboard limit.
- Renders provider-neutral commit, pull request, issue, CI, release, calendar and generic webhook types.
- Uses ES/EN labels and the user's timezone for timestamps.
- Provides a safe fallback when a normalized signal is sparse or lacks descriptive fields.

### Presentation security

The UI uses only normalized descriptive fields. It never displays `resourceId`, `providerId`, `workspaceId`, secret references or credentials.

External links are rendered only when normalized `url` is a valid `http:` or `https:` URL. Schemes such as `javascript:` and `data:` are rejected.

The private view does not request or render workspace integration signals.

### Acceptance

The general Docker smoke:

1. signs in through the real standalone identity flow;
2. resolves the active workspace from the authenticated session;
3. inserts one durable normalized CI signal in that workspace;
4. proves `/es?scope=workspace` renders `Actividad de integraciones`, the signal and localized status;
5. proves `/en?scope=workspace` renders the same signal with EN copy;
6. proves `/es?scope=private` contains neither the workspace signal ID nor its content.

Additional unit tests cover PR/CI presentation, safe fallbacks and rejection of unsafe URL schemes.

### Outside this slice

- Connection/credential administration UI.
- Customer rule editor.
- Stale PR/issue policies.
- OAuth/GitHub App.
- Remote GitHub actions from this surface.
