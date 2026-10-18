# Agent Bridge control + runtime observability / Control + observabilidad runtime de Agent Bridge

Status: **implemented pending CI acceptance / implementado pendiente de aceptación CI**

This slice closes the insecure gap between the Agent Bridge runtime contracts and Kairoseth Platform. Runtime heartbeat and health snapshots are accepted only through a short-lived runtime session cryptographically bound to the enrolled installation.

Esta microfase cierra el hueco inseguro entre los contratos del runtime de Agent Bridge y Kairoseth Platform. Heartbeats y snapshots de salud se aceptan únicamente mediante una sesión runtime de corta duración ligada criptográficamente a la instalación enrolada.

## Enrollment / Enrolamiento

An authorized workspace operator with the `agent-bridge` entitlement and `workspace.manage` can create a one-time enrollment credential:

`POST /v1/products/agent-bridge/enrollment-tokens`

The returned secret is not stored in plaintext. Platform stores only its SHA-256 digest and binds it to the authenticated workspace.

El secreto devuelto no se almacena en texto plano. Platform guarda únicamente su SHA-256 y lo liga al workspace autenticado.

Agent Bridge then uses its existing transport contract:

- `POST /api/products/agent-bridge/enrollment/challenge`
- `POST /api/products/agent-bridge/enrollment/register`

Registration requires the existing `kab.registration.v1` Ed25519 proof. Platform verifies:

- one-time, non-expired enrollment credential;
- exact challenge nonce and challenge expiry;
- proof timestamp skew;
- Ed25519 public-key fingerprint = `keyId`;
- canonical JSON signature;
- normalized capabilities;
- supported deployment mode.

Platform assigns the authoritative `tenantId` and a new `installationId`. The runtime cannot self-select either value during registration.

## Runtime session / Sesión runtime

The existing Agent Bridge session transport is implemented at:

- `POST /api/products/agent-bridge/session/challenge`
- `POST /api/products/agent-bridge/session/open`
- `POST /api/products/agent-bridge/session/heartbeat`

Session opening verifies an exact `kab.session-proof.v1` signature using the public key already registered for the installation. The challenge is single-use and short-lived.

A successful session returns `kab.session-credential.v1` with a high-entropy opaque access token. Platform stores only the SHA-256 token digest. The token is bound server-side to:

- session ID;
- tenant;
- installation;
- bridge instance;
- key ID;
- expiration;
- heartbeat interval.

Current policy uses a 15-minute runtime session and a 30-second heartbeat interval. A runtime is considered connected only while its most recent accepted heartbeat is within three heartbeat intervals (90 seconds).

La política actual usa una sesión runtime de 15 minutos y heartbeat cada 30 segundos. Un runtime se considera conectado únicamente mientras su último heartbeat aceptado esté dentro de tres intervalos (90 segundos).

## Heartbeat

`kab.heartbeat.v1` must match the authenticated runtime session exactly for:

- `sessionId`;
- `tenantId`;
- `installationId`;
- `bridgeInstanceId`.

The payload provides authoritative operator data for:

- runtime version;
- readiness (`starting`, `ready`, `degraded`);
- normalized capabilities;
- last heartbeat time.

A user/operator bearer token is never accepted as a runtime token.

## Runtime snapshot

Agent Bridge sends the existing `kab.runtime-snapshot.v1` contract to:

`POST /api/products/agent-bridge/runtime-snapshot`

Platform validates and bounds the complete safe snapshot shape before persistence:

- maximum connector/tool counts;
- connector and runtime-tool uniqueness;
- exact ES/EN localization shape when present;
- risk enum;
- reduced connector health enum;
- reduced tool availability enum;
- health rows must correspond exactly to inventory rows;
- health tools must correspond to declared runtime tool IDs;
- no config, credentials, private URLs, inputs, outputs or probe detail fields are accepted by the schema.

Only the latest snapshot per tenant + installation is retained for operator projection.

## Operator observability

`GET /v1/products/agent-bridge/runtime-observability`

requires an authenticated Platform session, active workspace and `agent-bridge` entitlement. It returns safe operator data only:

- installation ID and bridge instance ID;
- deployment mode;
- runtime version;
- connectivity and readiness;
- latest heartbeat and snapshot timestamps;
- capabilities;
- aggregate connector health counts;
- aggregate tool availability counts.

It never returns enrollment tokens, runtime access tokens, public keys, key IDs, raw task data, inputs, outputs or probe details.

The ES/EN Platform surface at `/{locale}/ia/agent-bridge` now shows this runtime state alongside A2A task observability.

## Remaining boundary / Límite pendiente

This slice establishes the full authenticated telemetry path needed by Platform observability. Before the Agent Bridge Phase 6 observability checks are marked complete, the cross-repository acceptance must be green and the Agent Bridge roadmap/evidence must be synchronized with the merged Platform commit.

Esta microfase establece la ruta autenticada completa de telemetría necesaria para observabilidad. Antes de marcar los checks de Fase 6 como completados, la aceptación cross-repository debe quedar verde y el roadmap/evidencia de Agent Bridge debe sincronizarse con el commit mergeado de Platform.
