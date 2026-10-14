#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${KCC_STANDALONE_COMPOSE_FILE:-docker-compose.standalone.yml}"
ENV_FILE="${KCC_STANDALONE_ENV_FILE:-.env.standalone}"
BACKUP_DIR="${KCC_BACKUP_DIR:-backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${1:-$BACKUP_DIR/work-manager-$TIMESTAMP.archive.gz}"

mkdir -p "$(dirname "$BACKUP_FILE")"

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

if ! "${compose[@]}" ps --status running mongo --quiet | grep -q .; then
  echo "MongoDB standalone service is not running." >&2
  exit 1
fi

"${compose[@]}" exec -T mongo \
  mongodump \
  --quiet \
  --db kairoseth_command_center \
  --archive \
  --gzip > "$BACKUP_FILE"

if [ ! -s "$BACKUP_FILE" ]; then
  echo "Backup is empty; refusing to report success." >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
printf 'Backup created: %s\n' "$BACKUP_FILE"
printf 'Checksum: %s\n' "$BACKUP_FILE.sha256"
