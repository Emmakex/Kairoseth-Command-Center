#!/usr/bin/env bash
set -euo pipefail

COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f deployment/docker/docker-compose.github-mock.yml
  -f deployment/docker/docker-compose.github-background-mock.yml
)

# Reuse the proven setup path: local auth, encrypted connection, provider validation,
# repository binding and manual repository sync.
bash deployment/docker/smoke-github-live-sync.sh

RESOURCE_DATA="$(${COMPOSE[@]} exec -T mongodb mongosh --quiet kairoseth_command_center --eval '
const doc = db.external_resources.find({provider:"github",kind:"repository"}).sort({createdAt:-1}).limit(1).next();
if (!doc) quit(2);
print(doc.scope.workspaceId + "|" + doc.id);
')"
RESOURCE_DATA="$(printf '%s' "$RESOURCE_DATA" | tr -d '\r\n')"
WORKSPACE_ID="${RESOURCE_DATA%%|*}"
RESOURCE_ID="${RESOURCE_DATA#*|}"
[[ -n "$WORKSPACE_ID" && -n "$RESOURCE_ID" && "$WORKSPACE_ID" != "$RESOURCE_ID" ]]

RUN_ID="${KCC_SMOKE_RUN_ID:-local}"
JOB_ID="background-smoke-${RUN_ID}"
DEDUPE_KEY="github:repository_signals:${RESOURCE_ID}:background-smoke:${RUN_ID}"

${COMPOSE[@]} exec -T mongodb mongosh --quiet kairoseth_command_center --eval "
const now = new Date().toISOString();
db.integration_sync_jobs.deleteOne({id:'$JOB_ID'});
db.integration_sync_jobs.insertOne({
  id:'$JOB_ID',
  workspaceId:'$WORKSPACE_ID',
  provider:'github',
  kind:'repository_signals',
  resourceId:'$RESOURCE_ID',
  dedupeKey:'$DEDUPE_KEY',
  activeDedupeKey:'$DEDUPE_KEY',
  status:'pending',
  attempt:0,
  maxAttempts:8,
  availableAt:now,
  createdAt:now,
  updatedAt:now
});
" >/dev/null

completed=0
for attempt in {1..60}; do
  STATUS="$(${COMPOSE[@]} exec -T mongodb mongosh --quiet kairoseth_command_center --eval "
const doc = db.integration_sync_jobs.findOne({id:'$JOB_ID'});
print(doc ? doc.status : 'missing');
")"
  STATUS="$(printf '%s' "$STATUS" | tr -d '\r\n')"
  if [[ "$STATUS" == "completed" ]]; then
    completed=1
    break
  fi
  if [[ "$STATUS" == "dead" ]]; then
    ${COMPOSE[@]} logs --no-color worker github-background-mock >&2
    exit 1
  fi
  sleep 1
done
[[ "$completed" == "1" ]]

SIGNAL_IDS="$(${COMPOSE[@]} exec -T mongodb mongosh --quiet kairoseth_command_center --eval "
const docs = db.integration_signals.find({workspaceId:'$WORKSPACE_ID',resourceId:'$RESOURCE_ID'}).toArray();
print(docs.map((doc) => doc.id).sort().join(','));
")"
SIGNAL_IDS="$(printf '%s' "$SIGNAL_IDS" | tr -d '\r\n')"
for expected in \
  github:pull-request:501 \
  github:issue:601 \
  github:workflow-run:701 \
  github:release:801; do
  [[ ",$SIGNAL_IDS," == *",$expected,"* ]]
done

WORKER_LOGS="$(${COMPOSE[@]} logs --no-color worker)"
[[ "$WORKER_LOGS" != *"${KCC_GITHUB_MOCK_TOKEN}"* ]]

echo "GitHub background refresh smoke passed"
