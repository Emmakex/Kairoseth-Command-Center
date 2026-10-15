#!/usr/bin/env bash
set -euo pipefail

COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f deployment/docker/docker-compose.github-mock.yml
  -f deployment/docker/docker-compose.github-background-mock.yml
)

# Reuse the proven setup path: local auth, encrypted connection, provider validation,
# repository binding and manual repository metadata sync.
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

RUN_ID="${KCC_SMOKE_RUN_ID:-local}"
SCHEDULE_ID="background-schedule-${RUN_ID}"
FORCED_DUE_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# Seed one deterministic due schedule rather than a job. The worker must turn the
# schedule into a durable job, execute it and advance the schedule itself.
${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const now = new Date().toISOString();
const query = {
  workspaceId:'$WORKSPACE_ID',
  provider:'github',
  kind:'repository_signals',
  resourceId:'$RESOURCE_ID'
};
db.integration_sync_schedules.updateOne(
  query,
  {
    \$setOnInsert: {
      id:'$SCHEDULE_ID',
      createdAt:now
    },
    \$set: {
      intervalMs:60000,
      nextRunAt:'$FORCED_DUE_AT',
      enabled:true,
      updatedAt:now
    },
    \$unset: {
      claimToken:'',
      claimedAt:'',
      leaseExpiresAt:''
    }
  },
  {upsert:true}
);
" >/dev/null

completed=0
SCHEDULE_JOB_ID=""
for attempt in {1..60}; do
  JOB_DATA="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const doc = db.integration_sync_jobs.find({
  workspaceId:'$WORKSPACE_ID',
  provider:'github',
  kind:'repository_signals',
  resourceId:'$RESOURCE_ID',
  dedupeKey:{\$regex:'^schedule:'}
}).sort({createdAt:-1}).limit(1).next();
print(doc ? doc.id + '|' + doc.status : 'missing|missing');
")"
  JOB_DATA="$(printf '%s' "$JOB_DATA" | tr -d '\r\n')"
  SCHEDULE_JOB_ID="${JOB_DATA%%|*}"
  STATUS="${JOB_DATA#*|}"
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
[[ -n "$SCHEDULE_JOB_ID" && "$SCHEDULE_JOB_ID" != "missing" ]]

SCHEDULE_STATE="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const doc = db.integration_sync_schedules.findOne({
  workspaceId:'$WORKSPACE_ID',
  provider:'github',
  kind:'repository_signals',
  resourceId:'$RESOURCE_ID'
});
if (!doc) quit(2);
print(JSON.stringify({
  nextRunAt:doc.nextRunAt,
  enabled:doc.enabled,
  claimed:Boolean(doc.claimToken || doc.claimedAt || doc.leaseExpiresAt)
}));
")"
printf '%s' "$SCHEDULE_STATE" | python3 -c '
import datetime,json,sys
state=json.load(sys.stdin)
forced=datetime.datetime.fromisoformat(sys.argv[1].replace("Z","+00:00"))
next_run=datetime.datetime.fromisoformat(state["nextRunAt"].replace("Z","+00:00"))
assert state["enabled"] is True
assert state["claimed"] is False
assert next_run > forced
' "$FORCED_DUE_AT"

SCHEDULE_JOB_COUNT="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
print(db.integration_sync_jobs.countDocuments({
  workspaceId:'$WORKSPACE_ID',
  provider:'github',
  kind:'repository_signals',
  resourceId:'$RESOURCE_ID',
  dedupeKey:{\$regex:'^schedule:'},
  status:'completed'
}));
")"
[[ "$SCHEDULE_JOB_COUNT" -ge 1 ]]

SIGNAL_IDS="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
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
[[ "$WORKER_LOGS" == *'"scheduleGeneration":"enqueued"'* ]]
[[ "$WORKER_LOGS" == *'"githubRefresh":"processed"'* ]]

echo "GitHub recurring background refresh smoke passed ($SCHEDULE_JOB_ID)"
