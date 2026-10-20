#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOMAIN="${KCC_LIVE_DOMAIN:-work-manager.kairoseth.com}"
SHARED_EDGE_CONTAINER="${KCC_SHARED_EDGE_CONTAINER:-kairoseth-edge-caddy}"
ROUTE_FRAGMENT="$ROOT_DIR/deployment/live/public-edge-route.caddy"
CADDYFILE_SOURCE="${KCC_SHARED_EDGE_CADDYFILE:-}"
BEGIN_MARKER="# BEGIN work-manager.kairoseth.com managed route"
END_MARKER="# END work-manager.kairoseth.com managed route"

if [[ "$(docker inspect --format '{{.State.Running}}' "$SHARED_EDGE_CONTAINER" 2>/dev/null || true)" != "true" ]]; then
  echo "[work-manager-edge] shared edge container is not running: $SHARED_EDGE_CONTAINER" >&2
  exit 1
fi

if [[ -z "$CADDYFILE_SOURCE" ]]; then
  CADDYFILE_SOURCE="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$SHARED_EDGE_CONTAINER")"
fi

if [[ -z "$CADDYFILE_SOURCE" || ! -f "$CADDYFILE_SOURCE" || ! -w "$CADDYFILE_SOURCE" ]]; then
  echo "[work-manager-edge] unable to resolve a writable shared Caddyfile bind mount" >&2
  echo "[work-manager-edge] set KCC_SHARED_EDGE_CADDYFILE explicitly if the shared edge uses a non-standard host path" >&2
  exit 1
fi

if grep -Fq "$DOMAIN" "$CADDYFILE_SOURCE"; then
  echo "[work-manager-edge] route for $DOMAIN already exists in shared Caddyfile"
  exit 0
fi

BACKUP="${CADDYFILE_SOURCE}.work-manager-backup.$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$CADDYFILE_SOURCE" "$BACKUP"

rollback() {
  cp -a "$BACKUP" "$CADDYFILE_SOURCE"
  docker exec "$SHARED_EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
}
trap 'rollback' ERR

{
  printf '\n%s\n' "$BEGIN_MARKER"
  cat "$ROUTE_FRAGMENT"
  printf '%s\n' "$END_MARKER"
} >> "$CADDYFILE_SOURCE"

docker run --rm \
  -v "$CADDYFILE_SOURCE:/etc/caddy/Caddyfile:ro" \
  caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile >/dev/null

docker exec "$SHARED_EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null
trap - ERR

echo "[work-manager-edge] shared edge route installed for $DOMAIN"
echo "[work-manager-edge] previous Caddyfile preserved at $BACKUP"
