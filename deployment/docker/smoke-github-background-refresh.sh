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

# `alert.derived` is delivered through the transactional audit outbox. The refresh job
# may complete in the same worker tick that enqueues the outbox record, so wait for the
# next drain instead of assuming Timeline is synchronous. Uniqueness is still strict.
DERIVED_AUDIT_COUNT=0
for attempt in {1..30}; do
  DERIVED_AUDIT_COUNT="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
print(db.timeline_events.countDocuments({type:'alert.derived',entityId:'$ALERT_ID','scope.workspaceId':'$WORKSPACE_ID'}));
")"
  DERIVED_AUDIT_COUNT="$(printf '%s' "$DERIVED_AUDIT_COUNT" | tr -d '\r\n')"
  if [[ "$DERIVED_AUDIT_COUNT" == "1" ]]; then
    break
  fi
  if [[ "$DERIVED_AUDIT_COUNT" != "0" ]]; then
    echo "Expected exactly one alert.derived event, found $DERIVED_AUDIT_COUNT" >&2
    exit 1
  fi
  sleep 1
done
[[ "$DERIVED_AUDIT_COUNT" == "1" ]]

# Durable alert + audit state above are the canonical behavior assertions. Keep logs
# only for the security invariant that provider credentials must never be emitted.
WORKER_LOGS="$(${COMPOSE[@]} logs --no-color worker)"
[[ "$WORKER_LOGS" != *"${KCC_GITHUB_MOCK_TOKEN}"* ]]

echo "GitHub background refresh + derived alert smoke passed"
