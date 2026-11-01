# 56 — Phase 8 operational acceptance

## Purpose

Phase 8 cannot close only because Work Manager is reachable and usable. The live reference must also prove that persistent data survives a controlled restart, that a real MongoDB backup can be restored, and that the runtime footprint is measurable for later commercial cost modelling.

This microcut adds an explicit operational acceptance path. It does **not** add product features and it does not run automatically on every deployment because it intentionally restarts the live topology.

## Production command

The accepted script is:

```text
deployment/live/phase8-operational-acceptance.sh
```

The canonical GitHub entrypoint is the manually dispatched workflow:

```text
Phase 8 Operational Acceptance
```

The workflow only runs the live job from `main`, requires the exact checked-out `main` SHA to match `origin/main`, and requires the explicit acknowledgement value `RESTART-LIVE` before any production restart is attempted.

## Acceptance sequence

1. Verify the protected runtime environment exists and is not group/world accessible.
2. Verify Mongo, API, worker, web and edge are running/healthy and expose no host ports.
3. Insert a temporary canary document in a dedicated acceptance collection.
4. Create a compressed `mongodump` archive of `kairoseth_command_center`.
5. Require the backup archive to be non-empty, mode `0600`, and record its SHA-256.
6. Restore the archive into an isolated temporary database using namespace rewriting.
7. Prove the restored database contains the canary, then drop the temporary verification database.
8. Restart Mongo first, then API/worker, then web/edge, waiting for readiness after each dependency layer.
9. Prove the original canary survived the controlled restart and remove it from the live database.
10. Capture container CPU/RAM/network/block I/O/PIDs and image sizes.
11. Capture disk usage for the Mongo and Caddy persistent volumes.
12. Retain a sanitized evidence summary and the protected backup on the deployment runner.

## Evidence locations

By default:

```text
/srv/kairoseth/apps/work-manager/backups/
/srv/kairoseth/apps/work-manager/evidence/phase8/<UTC timestamp>/
/srv/kairoseth/apps/work-manager/evidence/phase8/latest
```

Backup and evidence directories are mode `0700`; backup and evidence files are mode `0600`. Backups and raw evidence are never uploaded as public GitHub artifacts.

The summary records only operational metadata: accepted revision, database name, backup path/hash/size, and pass/fail booleans. It does not read or print runtime secrets.

## Failure behavior

The script is fail-closed. Any failed backup, restore verification, service restart, persistence check, missing container, unexpected published port or inaccessible protected environment aborts acceptance.

A cleanup trap removes the temporary canary and temporary restore database when possible. The backup archive is intentionally retained because exercising and retaining a recoverable backup is part of Phase 8 acceptance.

## Phase 8 impact

Once this workflow passes against accepted `main`, the following Phase 8 gates have objective production evidence:

- restart preserves persistent data;
- backup path is exercised and restore-tested;
- CPU/RAM/disk/container footprint is captured.

The remaining dogfooding gates — real daily task/project usage, reminder/recurrence observation, GitHub credential-safe configuration and an Agent Bridge operator/history flow when enrolled — remain separate acceptance evidence and are not fabricated by this script.
