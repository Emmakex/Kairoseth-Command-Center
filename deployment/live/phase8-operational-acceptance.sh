#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deployment/live/docker-compose.yml"
ENV_SOURCE="${KCC_LIVE_ENV_FILE:-/srv/kairoseth/apps/work-manager/shared/runtime.env}"
PROJECT_NAME="${KCC_LIVE_PROJECT_NAME:-work-manager-live}"
DB_NAME="${KCC_PHASE8_DB_NAME:-kairoseth_command_center}"
EVIDENCE_ROOT="${KCC_PHASE8_EVIDENCE_ROOT:-/srv/kairoseth/apps/work-manager/evidence/phase8}"
BACKUP_ROOT="${KCC_PHASE8_BACKUP_ROOT:-/srv/kairoseth/apps/work-manager/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CANARY_ID="phase8-${STAMP}-$$"
VERIFY_DB="${DB_NAME}_phase8_verify_${STAMP//[^0-9A-Za-z]/_}"
EVIDENCE_DIR="$EVIDENCE_ROOT/$STAMP"
BACKUP_FILE="$BACKUP_ROOT/work-manager-$STAMP.archive.gz"

cd "$ROOT_DIR"

for command_name in docker sha256sum stat install date awk sed; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[phase8-ops] required command is missing: $command_name" >&2
    exit 1
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  echo "[phase8-ops] docker compose is required" >&2
  exit 1
fi
if [[ ! -r "$ENV_SOURCE" ]]; then
  echo "[phase8-ops] runtime environment is missing or unreadable: $ENV_SOURCE" >&2
  exit 1
fi
perm="$(stat -c '%a' "$ENV_SOURCE")"
if (( (8#$perm & 077) != 0 )); then
  echo "[phase8-ops] runtime env must not be group/world accessible: mode=$perm" >&2
  exit 1
fi

install -d -m 700 "$EVIDENCE_ROOT" "$BACKUP_ROOT" "$EVIDENCE_DIR"

compose() {
  docker compose \
    -p "$PROJECT_NAME" \
    --env-file "$ENV_SOURCE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

wait_service() {
  local service="$1"
  local cid status
  cid="$(compose ps -q "$service")"
  if [[ -z "$cid" ]]; then
    echo "[phase8-ops] missing container for $service" >&2
    exit 1
  fi

  for _ in $(seq 1 60); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")"
    if [[ "$status" == "healthy" || ( "$status" == "running" && ( "$service" == "worker" || "$service" == "edge" ) ) ]]; then
      return 0
    fi
    if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
      echo "[phase8-ops] $service failed with status=$status" >&2
      compose logs --no-color --tail=160 "$service" >&2 || true
      exit 1
    fi
    sleep 2
  done

  echo "[phase8-ops] $service did not become ready in time" >&2
  compose logs --no-color --tail=160 "$service" >&2 || true
  exit 1
}

mongo_eval() {
  local database="$1"
  local expression="$2"
  compose exec -T mongo mongosh --quiet "$database" --eval "$expression" | tr -d '\r' | tail -n 1
}

cleanup() {
  compose exec -T mongo mongosh --quiet "$DB_NAME" --eval \
    "db.phase8_operational_acceptance.deleteOne({_id:'$CANARY_ID'})" >/dev/null 2>&1 || true
  compose exec -T mongo mongosh --quiet "$VERIFY_DB" --eval 'db.dropDatabase()' >/dev/null 2>&1 || true
}
trap cleanup EXIT

for service in mongo api worker web edge; do
  wait_service "$service"
  cid="$(compose ps -q "$service")"
  if [[ -n "$(docker port "$cid" 2>/dev/null)" ]]; then
    echo "[phase8-ops] service unexpectedly publishes a host port: $service" >&2
    exit 1
  fi
done

compose exec -T mongo sh -lc 'command -v mongodump >/dev/null && command -v mongorestore >/dev/null'

mongo_eval "$DB_NAME" \
  "db.phase8_operational_acceptance.insertOne({_id:'$CANARY_ID',createdAt:new Date(),purpose:'restart-persistence'}); print('inserted')" \
  | grep -Fqx 'inserted'

before_count="$(mongo_eval "$DB_NAME" "print(db.phase8_operational_acceptance.countDocuments({_id:'$CANARY_ID'}))")"
if [[ "$before_count" != "1" ]]; then
  echo "[phase8-ops] persistence canary was not created" >&2
  exit 1
fi

echo "[phase8-ops] creating protected MongoDB backup"
umask 077
compose exec -T mongo mongodump --quiet --db "$DB_NAME" --archive --gzip > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "[phase8-ops] backup archive is empty" >&2
  exit 1
fi
backup_sha256="$(sha256sum "$BACKUP_FILE" | awk '{print $1}')"
backup_bytes="$(stat -c '%s' "$BACKUP_FILE")"

echo "[phase8-ops] restoring backup into isolated verification database"
cat "$BACKUP_FILE" | compose exec -T mongo mongorestore \
  --quiet \
  --archive \
  --gzip \
  --nsFrom="${DB_NAME}.*" \
  --nsTo="${VERIFY_DB}.*"

restored_count="$(mongo_eval "$VERIFY_DB" "print(db.phase8_operational_acceptance.countDocuments({_id:'$CANARY_ID'}))")"
if [[ "$restored_count" != "1" ]]; then
  echo "[phase8-ops] backup restore verification did not recover the canary" >&2
  exit 1
fi
mongo_eval "$VERIFY_DB" 'db.dropDatabase(); print("dropped")' >/dev/null

echo "[phase8-ops] restarting persistent topology in dependency order"
compose restart mongo
wait_service mongo
compose restart api worker
wait_service api
wait_service worker
compose restart web edge
wait_service web
wait_service edge

after_count="$(mongo_eval "$DB_NAME" "print(db.phase8_operational_acceptance.countDocuments({_id:'$CANARY_ID'}))")"
if [[ "$after_count" != "1" ]]; then
  echo "[phase8-ops] live data did not survive the controlled restart" >&2
  exit 1
fi

mongo_eval "$DB_NAME" \
  "db.phase8_operational_acceptance.deleteOne({_id:'$CANARY_ID'}); print('deleted')" \
  | grep -Fqx 'deleted'

revision="$(git rev-parse HEAD 2>/dev/null || printf 'unknown')"
accepted_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
summary_file="$EVIDENCE_DIR/summary.txt"
container_file="$EVIDENCE_DIR/container-footprint.txt"
volume_file="$EVIDENCE_DIR/volume-footprint.txt"

{
  echo "accepted_at=$accepted_at"
  echo "revision=$revision"
  echo "project=$PROJECT_NAME"
  echo "database=$DB_NAME"
  echo "backup_file=$BACKUP_FILE"
  echo "backup_sha256=$backup_sha256"
  echo "backup_bytes=$backup_bytes"
  echo "backup_restore_verified=true"
  echo "restart_persistence_verified=true"
} > "$summary_file"
chmod 600 "$summary_file"

printf 'service|container|image|image_bytes|cpu|memory_usage|memory_percent|network_io|block_io|pids\n' > "$container_file"
for service in mongo api worker web edge; do
  cid="$(compose ps -q "$service")"
  image="$(docker inspect --format '{{.Config.Image}}' "$cid")"
  image_bytes="$(docker image inspect --format '{{.Size}}' "$image")"
  stats="$(docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}' "$cid")"
  printf '%s|%s|%s|%s|%s\n' "$service" "$cid" "$image" "$image_bytes" "$stats" >> "$container_file"
done
chmod 600 "$container_file"

mongo_cid="$(compose ps -q mongo)"
edge_cid="$(compose ps -q edge)"
mongo_image="$(docker inspect --format '{{.Config.Image}}' "$mongo_cid")"
edge_image="$(docker inspect --format '{{.Config.Image}}' "$edge_cid")"
printf 'volume|size_kib\n' > "$volume_file"
for volume in work-manager-live-mongo-data work-manager-live-caddy-data work-manager-live-caddy-config; do
  docker volume inspect "$volume" >/dev/null
  probe_image="$edge_image"
  if [[ "$volume" == "work-manager-live-mongo-data" ]]; then
    probe_image="$mongo_image"
  fi
  size_kib="$(docker run --rm --entrypoint sh -v "$volume:/volume:ro" "$probe_image" -c "du -sk /volume 2>/dev/null | awk '{print \$1}'")"
  printf '%s|%s\n' "$volume" "$size_kib" >> "$volume_file"
done
chmod 600 "$volume_file"

ln -sfn "$STAMP" "$EVIDENCE_ROOT/latest"
trap - EXIT
cleanup

echo "[phase8-ops] operational acceptance passed"
echo "[phase8-ops] evidence=$EVIDENCE_DIR"
echo "[phase8-ops] backup=$BACKUP_FILE"
