#!/usr/bin/env bash
set -euo pipefail

: "${KCC_LOCAL_ADMIN_EMAIL:?KCC_LOCAL_ADMIN_EMAIL is required}"
: "${KCC_LOCAL_ADMIN_PASSWORD:?KCC_LOCAL_ADMIN_PASSWORD is required}"
: "${KCC_LOCAL_AUTH_SECRET:?KCC_LOCAL_AUTH_SECRET is required}"

COMPOSE_FILE="${KCC_STANDALONE_COMPOSE_FILE:-docker-compose.standalone.yml}"
ENV_FILE="${KCC_STANDALONE_ENV_FILE:-.env.standalone}"
API_PORT="${KCC_API_HOST_PORT:-4000}"
WEB_PORT="${KCC_WEB_PORT:-3000}"
API_BASE_URL="http://127.0.0.1:${API_PORT}"
WEB_BASE_URL="http://127.0.0.1:${WEB_PORT}"
RUN_ID="${KCC_SMOKE_RUN_ID:-release}"
BACKUP_FILE="$(mktemp -u "/tmp/work-manager-${RUN_ID}-XXXXXX.archive.gz")"

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

cleanup() {
  rm -f "$BACKUP_FILE" "$BACKUP_FILE.sha256"
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${compose[@]}" config >/dev/null
"${compose[@]}" up -d --build

for attempt in {1..60}; do
  if curl --fail --silent "$API_BASE_URL/ready" >/dev/null; then
    break
  fi
  if [ "$attempt" = "60" ]; then
    "${compose[@]}" ps
    "${compose[@]}" logs api
    exit 1
  fi
  sleep 2
done

for attempt in {1..30}; do
  if curl --fail --silent "$WEB_BASE_URL/es" >/dev/null && \
     curl --fail --silent "$WEB_BASE_URL/en" >/dev/null; then
    break
  fi
  if [ "$attempt" = "30" ]; then
    "${compose[@]}" ps
    "${compose[@]}" logs web
    exit 1
  fi
  sleep 2
done

# MongoDB must remain internal-only in the production-oriented profile.
if [ -n "$("${compose[@]}" port mongo 27017 2>/dev/null || true)" ]; then
  echo "MongoDB unexpectedly publishes port 27017." >&2
  exit 1
fi

KCC_API_BASE_URL="$API_BASE_URL" \
KCC_SMOKE_RUN_ID="$RUN_ID" \
  bash deployment/docker/smoke-local-identities.sh

KCC_STANDALONE_COMPOSE_FILE="$COMPOSE_FILE" \
KCC_STANDALONE_ENV_FILE="$ENV_FILE" \
  bash deployment/docker/backup-standalone.sh "$BACKUP_FILE"

test -s "$BACKUP_FILE"
sha256sum --check "$BACKUP_FILE.sha256"

KCC_RESTORE_CONFIRM=RESTORE \
KCC_STANDALONE_COMPOSE_FILE="$COMPOSE_FILE" \
KCC_STANDALONE_ENV_FILE="$ENV_FILE" \
  bash deployment/docker/restore-standalone.sh "$BACKUP_FILE"

# Verify the restored persisted owner can still authenticate and resolve a session.
login_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$KCC_LOCAL_ADMIN_EMAIL\",\"password\":\"$KCC_LOCAL_ADMIN_PASSWORD\"}")"
access_token="$(printf '%s' "$login_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"
curl --fail --silent "$API_BASE_URL/v1/session" \
  -H "authorization: Bearer $access_token" >/dev/null

printf 'standalone release smoke: OK\n'
