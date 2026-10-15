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
JOB_ID="background-smoke-${RUN_ID}"
DEDUPE_KEY="github:repository_signals:${RESOURCE_ID}:background-smoke:${RUN_ID}"

insert_job() {
  local job_id="$1"
  local dedupe_key="$2"
  ${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const now = new Date().toISOString();
db.integration_sync_jobs.deleteOne({id:'$job_id'});
db.integration_sync_jobs.insertOne({
  id:'$job_id',
  workspaceId:'$WORKSPACE_ID',
  provider:'github',
  kind:'repository_signals',
  resourceId:'$RESOURCE_ID',
  dedupeKey:'$dedupe_key',
  activeDedupeKey:'$dedupe_key',
  status:'pending',
  attempt:0,
  maxAttempts:8,
  availableAt:now,
  createdAt:now,
  updatedAt:now
});
" >/dev/null
}

wait_for_job() {
  local job_id="$1"
  for attempt in {1..60}; do
    local status
    status="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const doc = db.integration_sync_jobs.findOne({id:'$job_id'});
print(doc ? doc.status : 'missing');
")"
    status="$(printf '%s' "$status" | tr -d '\r\n')"
    if [[ "$status" == "completed" ]]; then
      return 0
    fi
    if [[ "$status" == "dead" ]]; then
      ${COMPOSE[@]} logs --no-color worker github-background-mock >&2
      return 1
    fi
    sleep 1
  done
  return 1
}

set_ci_state() {
  local conclusion="$1"
  local updated_at="$2"
  ${COMPOSE[@]} exec -T github-background-mock node -e "
const response = await fetch('http://127.0.0.1:8081/__test__/workflow', {
  method: 'POST',
  headers: {
    authorization: 'Bearer ' + process.env.KCC_GITHUB_MOCK_TOKEN,
    'content-type': 'application/json'
  },
  body: JSON.stringify({ conclusion: '$conclusion', updatedAt: '$updated_at' })
});
if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
" >/dev/null
}

wait_for_timeline_count() {
  local event_type="$1"
  local alert_id="$2"
  local expected="$3"
  for attempt in {1..30}; do
    local count
    count="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
print(db.timeline_events.countDocuments({type:'$event_type',entityId:'$alert_id','scope.workspaceId':'$WORKSPACE_ID'}));
")"
    count="$(printf '%s' "$count" | tr -d '\r\n')"
    if [[ "$count" == "$expected" ]]; then
      return 0
    fi
    if [[ "$count" != "0" ]]; then
      echo "Expected $expected $event_type event(s), found $count" >&2
      return 1
    fi
    sleep 1
  done
  return 1
}

insert_job "$JOB_ID" "$DEDUPE_KEY"
wait_for_job "$JOB_ID"

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

# Process the same provider signal set again under a different queue job. The derived
# alert must remain one durable record because its fingerprint is rule + signal based.
REPEAT_JOB_ID="${JOB_ID}-repeat"
insert_job "$REPEAT_JOB_ID" "${DEDUPE_KEY}:repeat"
wait_for_job "$REPEAT_JOB_ID"

ALERT_FINGERPRINT="integration-rule:repository.ci.failed.v1:github:workflow-run:701"
ALERT_DATA="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const docs = db.alerts.find({'scope.kind':'workspace','scope.workspaceId':'$WORKSPACE_ID',fingerprint:'$ALERT_FINGERPRINT'}).toArray();
if (docs.length !== 1) quit(2);
const alert = docs[0];
print([docs.length,alert.id,alert.severity,alert.status].join('|'));
")"
ALERT_DATA="$(printf '%s' "$ALERT_DATA" | tr -d '\r\n')"
IFS='|' read -r ALERT_COUNT ALERT_ID ALERT_SEVERITY ALERT_STATUS <<< "$ALERT_DATA"
[[ "$ALERT_COUNT" == "1" ]]
[[ "$ALERT_SEVERITY" == "urgent" ]]
[[ "$ALERT_STATUS" == "open" ]]
[[ -n "$ALERT_ID" ]]

wait_for_timeline_count 'alert.derived' "$ALERT_ID" 1

# The same stable provider signal becomes healthy. Its durable signal record is updated,
# and lifecycle reconciliation must resolve the already-materialized alert without
# creating a second alert or a second alert.derived audit event.
set_ci_state 'success' '2026-10-15T06:40:00Z'
RESOLVE_JOB_ID="${JOB_ID}-resolve"
insert_job "$RESOLVE_JOB_ID" "${DEDUPE_KEY}:resolve"
wait_for_job "$RESOLVE_JOB_ID"

${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const alert=db.alerts.findOne({id:'$ALERT_ID',fingerprint:'$ALERT_FINGERPRINT'});
if (!alert || alert.status !== 'resolved' || !alert.resolvedAt) quit(2);
if (new Date(alert.resolvedAt).toISOString() !== '2026-10-15T06:40:00.000Z') quit(3);
if (db.alerts.countDocuments({'scope.workspaceId':'$WORKSPACE_ID',fingerprint:'$ALERT_FINGERPRINT'}) !== 1) quit(4);
" >/dev/null
wait_for_timeline_count 'alert.auto_resolved' "$ALERT_ID" 1

# A genuinely later failure for the same workflow-run identity must reopen that exact
# durable alert. The fingerprint and alert ID stay stable, resolvedAt is cleared, and
# the original derivation audit event remains unique.
set_ci_state 'failure' '2026-10-15T06:50:00Z'
REOPEN_JOB_ID="${JOB_ID}-reopen"
insert_job "$REOPEN_JOB_ID" "${DEDUPE_KEY}:reopen"
wait_for_job "$REOPEN_JOB_ID"

${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const alert=db.alerts.findOne({id:'$ALERT_ID',fingerprint:'$ALERT_FINGERPRINT'});
if (!alert || alert.status !== 'open' || alert.resolvedAt) quit(2);
if (db.alerts.countDocuments({'scope.workspaceId':'$WORKSPACE_ID',fingerprint:'$ALERT_FINGERPRINT'}) !== 1) quit(3);
if (db.timeline_events.countDocuments({type:'alert.derived',entityId:'$ALERT_ID','scope.workspaceId':'$WORKSPACE_ID'}) !== 1) quit(4);
" >/dev/null
wait_for_timeline_count 'alert.reopened' "$ALERT_ID" 1

# Durable alert + audit state above are the canonical behavior assertions. Keep logs
# only for the security invariant that provider credentials must never be emitted.
WORKER_LOGS="$(${COMPOSE[@]} logs --no-color worker)"
[[ "$WORKER_LOGS" != *"${KCC_GITHUB_MOCK_TOKEN}"* ]]

echo "GitHub background refresh + derived alert lifecycle smoke passed"
