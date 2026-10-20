#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deployment/live/docker-compose.yml"
ENV_SOURCE="${KCC_LIVE_ENV_FILE:-/srv/kairoseth/apps/work-manager/shared/runtime.env}"
PROJECT_NAME="${KCC_LIVE_PROJECT_NAME:-work-manager-live}"
DOMAIN="${KCC_LIVE_DOMAIN:-work-manager.kairoseth.com}"
PUBLIC_EDGE_NETWORK="${KCC_PUBLIC_EDGE_NETWORK:-kairoseth-public-edge}"

cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "[work-manager-live] docker with compose is required" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "[work-manager-live] openssl is required" >&2
  exit 1
fi

quote_env() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\'/\\\'}"
  printf "'%s'" "$value"
}

bootstrap_env_if_missing() {
  if [[ -f "$ENV_SOURCE" ]]; then
    return 0
  fi

  : "${KCC_BOOTSTRAP_ADMIN_EMAIL:?Set KCC_BOOTSTRAP_ADMIN_EMAIL for the first live deployment}"
  : "${KCC_BOOTSTRAP_ADMIN_PASSWORD:?Set KCC_BOOTSTRAP_ADMIN_PASSWORD for the first live deployment}"

  if (( ${#KCC_BOOTSTRAP_ADMIN_PASSWORD} < 12 )); then
    echo "[work-manager-live] bootstrap admin password must be at least 12 characters" >&2
    exit 1
  fi
  if [[ "$KCC_BOOTSTRAP_ADMIN_EMAIL" == *$'\n'* || "$KCC_BOOTSTRAP_ADMIN_PASSWORD" == *$'\n'* ]]; then
    echo "[work-manager-live] bootstrap credentials must not contain newlines" >&2
    exit 1
  fi

  install -d -m 700 "$(dirname "$ENV_SOURCE")"
  local auth_secret integration_secret temp_file
  auth_secret="$(openssl rand -hex 48)"
  integration_secret="$(openssl rand -hex 32)"
  temp_file="$(mktemp "$(dirname "$ENV_SOURCE")/.runtime.env.XXXXXX")"
  chmod 600 "$temp_file"
  {
    printf 'KCC_LOCAL_ADMIN_EMAIL=%s\n' "$(quote_env "$KCC_BOOTSTRAP_ADMIN_EMAIL")"
    printf 'KCC_LOCAL_ADMIN_PASSWORD=%s\n' "$(quote_env "$KCC_BOOTSTRAP_ADMIN_PASSWORD")"
    printf 'KCC_LOCAL_AUTH_SECRET=%s\n' "$auth_secret"
    printf 'KCC_INTEGRATION_SECRET_KEY=%s\n' "$integration_secret"
    printf 'KCC_LOCAL_ADMIN_DISPLAY_NAME=%s\n' "$(quote_env "${KCC_BOOTSTRAP_ADMIN_DISPLAY_NAME:-Owner}")"
    printf 'KCC_LOCAL_LOCALE=es\n'
    printf 'KCC_LOCAL_TIMEZONE=Europe/Madrid\n'
    printf 'KCC_LOCAL_USER_ID=live-owner\n'
    printf 'KCC_LOCAL_WORKSPACE_ID=work-manager-live\n'
    printf 'KCC_LOCAL_WORKSPACE_NAME=%s\n' "$(quote_env 'Work Manager')"
    printf 'KCC_LOCAL_SESSION_TTL_SECONDS=43200\n'
    printf 'KCC_GITHUB_API_BASE_URL=https://api.github.com\n'
    printf 'KCC_WORKER_POLL_MS=5000\n'
  } > "$temp_file"
  mv "$temp_file" "$ENV_SOURCE"
  chmod 600 "$ENV_SOURCE"
  echo "[work-manager-live] protected runtime environment bootstrapped at $ENV_SOURCE"
}

bootstrap_env_if_missing

if [[ ! -r "$ENV_SOURCE" ]]; then
  echo "[work-manager-live] missing or unreadable runtime environment: $ENV_SOURCE" >&2
  exit 1
fi

perm="$(stat -c '%a' "$ENV_SOURCE")"
if (( (8#$perm & 077) != 0 )); then
  echo "[work-manager-live] runtime env must not be group/world accessible: mode=$perm" >&2
  exit 1
fi

for key in KCC_LOCAL_ADMIN_EMAIL KCC_LOCAL_ADMIN_PASSWORD KCC_LOCAL_AUTH_SECRET KCC_INTEGRATION_SECRET_KEY; do
  if ! grep -Eq "^${key}=.+" "$ENV_SOURCE"; then
    echo "[work-manager-live] missing required key in protected runtime environment: $key" >&2
    exit 1
  fi
done

REVISION="${KCC_DEPLOYMENT_REVISION:-$(git rev-parse --short=12 HEAD 2>/dev/null || printf 'release')}"
if [[ -n "${GITHUB_SHA:-}" ]]; then
  CHECKED_OUT_SHA="$(git rev-parse HEAD)"
  if [[ "$CHECKED_OUT_SHA" != "$GITHUB_SHA" ]]; then
    echo "[work-manager-live] checkout SHA mismatch: checkout=$CHECKED_OUT_SHA expected=$GITHUB_SHA" >&2
    exit 1
  fi
fi
export KCC_DEPLOYMENT_REVISION="$REVISION"

compose() {
  docker compose \
    -p "$PROJECT_NAME" \
    --env-file "$ENV_SOURCE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

wait_healthy() {
  local service="$1"
  local cid status
  cid="$(compose ps -q "$service")"
  if [[ -z "$cid" ]]; then
    echo "[work-manager-live] missing container for $service" >&2
    exit 1
  fi
  for _ in $(seq 1 60); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
    if [[ "$status" == "healthy" || ( "$status" == "running" && "$service" == "edge" ) ]]; then
      return 0
    fi
    if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
      echo "[work-manager-live] $service failed with status=$status" >&2
      compose logs --no-color --tail=160 "$service" >&2 || true
      exit 1
    fi
    sleep 2
  done
  echo "[work-manager-live] $service did not become healthy in time" >&2
  compose logs --no-color --tail=160 "$service" >&2 || true
  exit 1
}

echo "[work-manager-live] revision=$REVISION"
echo "[work-manager-live] project=$PROJECT_NAME"
echo "[work-manager-live] domain=$DOMAIN"

docker network inspect "$PUBLIC_EDGE_NETWORK" >/dev/null 2>&1 || docker network create "$PUBLIC_EDGE_NETWORK" >/dev/null
compose config >/dev/null

compose build --pull api worker web
compose up -d mongo api worker web edge

wait_healthy mongo
wait_healthy api
wait_healthy web
wait_healthy edge

for service in api worker web; do
  cid="$(compose ps -q "$service")"
  deployed_revision="$(docker inspect --format '{{ index .Config.Labels "com.kairoseth.work-manager.revision" }}' "$cid")"
  if [[ "$deployed_revision" != "$REVISION" ]]; then
    echo "[work-manager-live] revision mismatch for $service: deployed=$deployed_revision expected=$REVISION" >&2
    exit 1
  fi
done

for service in mongo api worker web edge; do
  cid="$(compose ps -q "$service")"
  if [[ -n "$(docker port "$cid" 2>/dev/null)" ]]; then
    echo "[work-manager-live] service unexpectedly publishes a host port: $service" >&2
    docker port "$cid" >&2 || true
    exit 1
  fi
done

docker run --rm --network "$PUBLIC_EDGE_NETWORK" curlimages/curl:8.16.0 \
  --retry 20 --retry-delay 2 --retry-connrefused --max-time 90 -fsS \
  "http://work-manager-edge/es/login" >/dev/null

echo "[work-manager-live] internal shared-edge route verified"

if curl -fsS --max-time 20 "https://$DOMAIN/es/login" >/dev/null 2>&1; then
  echo "[work-manager-live] public HTTPS probe verified: https://$DOMAIN/es/login"
elif [[ "${KCC_PUBLIC_PROBE_REQUIRED:-0}" == "1" ]]; then
  echo "[work-manager-live] public HTTPS probe failed for https://$DOMAIN/es/login" >&2
  exit 1
else
  echo "[work-manager-live] runtime is healthy; public DNS/shared-edge route is not verified yet"
fi

compose ps

echo "[work-manager-live] live reference runtime accepted: $REVISION"
