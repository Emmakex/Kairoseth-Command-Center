#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOMAIN="${KCC_LIVE_DOMAIN:-work-manager.kairoseth.com}"
SHARED_EDGE_CONTAINER="${KCC_SHARED_EDGE_CONTAINER:-kairoseth-edge-caddy}"
ROUTE_FRAGMENT="$ROOT_DIR/deployment/live/public-edge-route.caddy"
CADDYFILE_SOURCE="${KCC_SHARED_EDGE_CADDYFILE:-}"
SITES_SOURCE="${KCC_SHARED_EDGE_SITES_DIR:-}"
SITE_FRAGMENT_NAME="work-manager.caddy"
BEGIN_MARKER="# BEGIN work-manager.kairoseth.com managed route"
END_MARKER="# END work-manager.kairoseth.com managed route"

if [[ "$(docker inspect --format '{{.State.Running}}' "$SHARED_EDGE_CONTAINER" 2>/dev/null || true)" != "true" ]]; then
  echo "[work-manager-edge] shared edge container is not running: $SHARED_EDGE_CONTAINER" >&2
  exit 1
fi

if [[ -z "$CADDYFILE_SOURCE" ]]; then
  CADDYFILE_SOURCE="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$SHARED_EDGE_CONTAINER")"
fi

if [[ -z "$SITES_SOURCE" ]]; then
  SITES_SOURCE="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/sites"}}{{.Source}}{{end}}{{end}}' "$SHARED_EDGE_CONTAINER")"
fi

render_route() {
  if [[ "$DOMAIN" == "work-manager.kairoseth.com" ]]; then
    cat "$ROUTE_FRAGMENT"
  else
    printf '%s {\n  reverse_proxy work-manager-edge:80\n}\n' "$DOMAIN"
  fi
}

validate_and_reload() {
  docker exec "$SHARED_EDGE_CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null
  docker exec "$SHARED_EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null
}

has_sites_import() {
  docker exec "$SHARED_EDGE_CONTAINER" sh -lc \
    'grep -Fq "import /etc/caddy/sites/*.caddy" /etc/caddy/Caddyfile || grep -Fq "import /etc/caddy/sites/*" /etc/caddy/Caddyfile'
}

# Preferred mode: install a dedicated fragment in the shared edge sites directory.
# This survives regeneration/replacement of the primary Caddyfile as long as it
# keeps importing /etc/caddy/sites/*.caddy.
if [[ -n "$SITES_SOURCE" && -d "$SITES_SOURCE" && -w "$SITES_SOURCE" ]] && has_sites_import; then
  TARGET="$SITES_SOURCE/$SITE_FRAGMENT_NAME"
  BACKUP=""

  if [[ -f "$TARGET" ]]; then
    DESIRED="$(mktemp)"
    render_route > "$DESIRED"
    if cmp -s "$TARGET" "$DESIRED"; then
      rm -f "$DESIRED"
      echo "[work-manager-edge] persistent shared edge route already installed at $TARGET"
      exit 0
    fi
    rm -f "$DESIRED"
    BACKUP="${TARGET}.backup.$(date -u +%Y%m%dT%H%M%SZ)"
    cp -a "$TARGET" "$BACKUP"
  fi

  TMP="$(mktemp "${TARGET}.tmp.XXXXXX")"
  render_route > "$TMP"
  chmod 0644 "$TMP"
  mv "$TMP" "$TARGET"

  rollback_sites() {
    if [[ -n "$BACKUP" ]]; then
      cp -a "$BACKUP" "$TARGET"
    else
      rm -f "$TARGET"
    fi
    docker exec "$SHARED_EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
  }
  trap 'rollback_sites' ERR

  validate_and_reload
  trap - ERR

  echo "[work-manager-edge] persistent shared edge route installed for $DOMAIN"
  echo "[work-manager-edge] fragment: $TARGET"
  if [[ -n "$BACKUP" ]]; then
    echo "[work-manager-edge] previous fragment preserved at $BACKUP"
  fi
  exit 0
fi

# Compatibility fallback for shared edges that do not expose/import a sites
# directory. This retains the previous managed-block behavior.
if [[ -z "$CADDYFILE_SOURCE" || ! -f "$CADDYFILE_SOURCE" || ! -w "$CADDYFILE_SOURCE" ]]; then
  echo "[work-manager-edge] unable to resolve a writable shared Caddyfile bind mount" >&2
  echo "[work-manager-edge] expose/import /etc/caddy/sites for persistent routing, or set KCC_SHARED_EDGE_CADDYFILE explicitly" >&2
  exit 1
fi

if grep -Fq "$DOMAIN" "$CADDYFILE_SOURCE"; then
  echo "[work-manager-edge] route for $DOMAIN already exists in shared Caddyfile"
  exit 0
fi

BACKUP="${CADDYFILE_SOURCE}.work-manager-backup.$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$CADDYFILE_SOURCE" "$BACKUP"

rollback_caddyfile() {
  cp -a "$BACKUP" "$CADDYFILE_SOURCE"
  docker exec "$SHARED_EDGE_CONTAINER" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true
}
trap 'rollback_caddyfile' ERR

{
  printf '\n%s\n' "$BEGIN_MARKER"
  render_route
  printf '%s\n' "$END_MARKER"
} >> "$CADDYFILE_SOURCE"

validate_and_reload
trap - ERR

echo "[work-manager-edge] shared edge route installed for $DOMAIN using legacy Caddyfile mode"
echo "[work-manager-edge] previous Caddyfile preserved at $BACKUP"
