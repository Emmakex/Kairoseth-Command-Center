#!/usr/bin/env bash
set -euo pipefail

COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f deployment/docker/docker-compose.github-mock.yml
  -f deployment/docker/docker-compose.github-background-mock.yml
)

# Reuse the proven local auth + encrypted GitHub binding setup.
bash deployment/docker/smoke-github-live-sync.sh

RESOURCE_DATA="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval '
const doc = db.external_resources.find({provider:"github",kind:"repository"}).sort({createdAt:-1}).limit(1).next();
if (!doc) quit(2);
print(doc.scope.workspaceId + "|" + doc.id);
')"
RESOURCE_DATA="$(printf '%s' "$RESOURCE_DATA" | tr -d '\r\n')"
WORKSPACE_ID="${RESOURCE_DATA%%|*}"
RESOURCE_ID="${RESOURCE_DATA#*|}"
[[ -n "$WORKSPACE_ID" && -n "$RESOURCE_ID" && "$WORKSPACE_ID" != "$RESOURCE_ID" ]]

# Wait for discovery to create the durable schedule, then force it due without
# waiting for the normal 15-minute interval.
SCHEDULE_ID=""
for attempt in {1..30}; do
  SCHEDULE_ID="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const doc = db.integration_sync_schedules.findOne({workspaceId:'$WORKSPACE_ID',provider:'github',kind:'repository_signals',resourceId:'$RESOURCE_ID'});
print(doc ? doc.id : '');
")"
  SCHEDULE_ID="$(printf '%s' "$SCHEDULE_ID" | tr -d '\r\n')"
  [[ -n "$SCHEDULE_ID" ]] && break
  sleep 1
done
[[ -n "$SCHEDULE_ID" ]]

DUE_AT="2000-01-01T00:00:00.000Z"
${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
db.integration_sync_schedules.updateOne(
  {id:'$SCHEDULE_ID'},
  {
    \$set:{nextRunAt:'$DUE_AT',updatedAt:new Date().toISOString()},
    \$unset:{claimToken:'',claimedAt:'',leaseExpiresAt:''}
  }
);
" >/dev/null

JOB_ID=""
completed=0
for attempt in {1..60}; do
  JOB_DATA="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const doc = db.integration_sync_jobs.find({workspaceId:'$WORKSPACE_ID',resourceId:'$RESOURCE_ID',dedupeKey:'schedule:$SCHEDULE_ID:$DUE_AT'}).sort({createdAt:-1}).limit(1).next();
print(doc ? (doc.id + '|' + doc.status) : '|missing');
")"
  JOB_DATA="$(printf '%s' "$JOB_DATA" | tr -d '\r\n')"
  JOB_ID="${JOB_DATA%%|*}"
  STATUS="${JOB_DATA#*|}"
  if [[ -n "$JOB_ID" && "$STATUS" == "completed" ]]; then
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

SCHEDULE_DATA="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const doc = db.integration_sync_schedules.findOne({id:'$SCHEDULE_ID'});
if (!doc) quit(2);
print(doc.nextRunAt + '|' + (doc.lastEnqueuedAt || '') + '|' + (doc.claimToken || ''));
")"
SCHEDULE_DATA="$(printf '%s' "$SCHEDULE_DATA" | tr -d '\r\n')"
NEXT_RUN_AT="${SCHEDULE_DATA%%|*}"
REST="${SCHEDULE_DATA#*|}"
LAST_ENQUEUED_AT="${REST%%|*}"
CLAIM_TOKEN="${REST#*|}"

node -e "
const next = Date.parse(process.argv[1]);
const last = Date.parse(process.argv[2]);
if (!Number.isFinite(next) || !Number.isFinite(last) || next <= last) process.exit(1);
" "$NEXT_RUN_AT" "$LAST_ENQUEUED_AT"
[[ -z "$CLAIM_TOKEN" ]]

SIGNAL_COUNT="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
print(db.integration_signals.countDocuments({workspaceId:'$WORKSPACE_ID',resourceId:'$RESOURCE_ID'}));
")"
SIGNAL_COUNT="$(printf '%s' "$SIGNAL_COUNT" | tr -d '\r\n')"
(( SIGNAL_COUNT >= 4 ))

# The durable operational records must never contain the provider token.
SCHEDULE_JSON="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "printjson(db.integration_sync_schedules.findOne({id:'$SCHEDULE_ID'}));")"
JOB_JSON="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "printjson(db.integration_sync_jobs.findOne({id:'$JOB_ID'}));")"
[[ "$SCHEDULE_JSON$JOB_JSON" != *"${KCC_GITHUB_MOCK_TOKEN}"* ]]

echo "GitHub recurring refresh smoke passed"
