#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${KCC_STANDALONE_COMPOSE_FILE:-docker-compose.standalone.yml}"
ENV_FILE="${KCC_STANDALONE_ENV_FILE:-.env.standalone}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup.archive.gz>" >&2
  exit 2
fi

if [ -f "$BACKUP_FILE.sha256" ]; then
  sha256sum --check "$BACKUP_FILE.sha256"
fi

if [ "${KCC_RESTORE_CONFIRM:-}" != "RESTORE" ]; then
  echo "Restore is destructive for the application database." >&2
  echo "Re-run with KCC_RESTORE_CONFIRM=RESTORE after verifying the backup." >&2
  exit 3
fi

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

if ! "${compose[@]}" ps --status running mongo --quiet | grep -q .; then
  echo "MongoDB standalone service is not running." >&2
  exit 1
fi

cat "$BACKUP_FILE" | "${compose[@]}" exec -T mongo \
  mongorestore \
  --quiet \
  --archive \
  --gzip \
  --drop \
  --nsInclude='kairoseth_command_center.*'

printf 'Restore completed from: %s\n' "$BACKUP_FILE"
