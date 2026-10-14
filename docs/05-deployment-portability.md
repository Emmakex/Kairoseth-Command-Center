# 05 — Deployment & portability / Despliegue y portabilidad

## Supported editions

### Kairoseth Cloud
Multi-tenant deployment operated by Kairoseth. Uses Kairoseth Identity and product entitlements.

### Kairoseth Private Cloud
Dedicated environment for one customer, operated by Kairoseth or jointly managed.

### Self-Hosted / On-Premise
Customer-operated deployment. Must not require access to Kairoseth infrastructure for normal runtime operation.

### Enterprise Embedded
Future API/SDK edition for embedding Command Center views or workflows into an existing customer portal.

## Portability requirement

The same domain/application packages must be deployable in every edition. Edition-specific behavior lives in configuration and adapters.

## Reference self-hosted topology

```text
reverse proxy / ingress
        |
        +--> web
        +--> api
        `--> worker
               |
               +--> database
               +--> queue (production recommended)
               `--> connector APIs
```

## Containerization

Target distribution should be container-first:

- `command-center-web`
- `command-center-api`
- `command-center-worker`

A development Docker Compose bundle should provide a one-command local environment. Production deployment templates can later include Kubernetes/Helm.

## Configuration classes

Environment-specific settings must be externalized:

- public base URL;
- auth provider;
- database connection;
- queue connection;
- encryption/secret references;
- allowed origins;
- connector credentials/references;
- telemetry destination;
- default locale/timezone;
- feature flags.

No customer-specific URL, credential or Kairoseth-only service should be hard-coded into the domain layer.

## Data residency

Private/self-hosted editions must support keeping operational data inside the customer's selected environment. External connectors naturally exchange only the data required for the enabled integration.

## Upgrades

Self-hosted releases should provide:

1. semantic version;
2. release notes;
3. migration plan;
4. compatibility notes;
5. rollback guidance;
6. signed/checksummed deployment artifacts when distribution matures.

## Backup & restore

A deployable edition is not complete without documented backup/restore for database, configuration metadata and required encryption material. Secrets should be recovered through the customer's secret-management process rather than embedded in backups when possible.

## No lock-in principle

A customer using Command Center must be able to run core functionality without purchasing other Kairoseth products. Kairoseth integrations add value but are optional adapters.
