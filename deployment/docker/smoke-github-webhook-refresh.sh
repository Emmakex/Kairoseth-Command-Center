#!/usr/bin/env bash
set -euo pipefail

: "${KCC_LOCAL_ADMIN_EMAIL:?KCC_LOCAL_ADMIN_EMAIL is required}"
: "${KCC_LOCAL_ADMIN_PASSWORD:?KCC_LOCAL_ADMIN_PASSWORD is required}"
: "${KCC_INTEGRATION_SECRET_KEY:?KCC_INTEGRATION_SECRET_KEY is required}"
: "${KCC_GITHUB_MOCK_TOKEN:?KCC_GITHUB_MOCK_TOKEN is required}"

API_BASE_URL="${KCC_API_BASE_URL:-http://localhost:4000}"
RUN_ID="${KCC_SMOKE_RUN_ID:-github-webhook}"
COMPOSE=(
  docker compose
  -f docker-compose.yml
  -f deployment/docker/docker-compose.github-mock.yml
  -f deployment/docker/docker-compose.github-background-mock.yml
)

# Establish the already-proven authenticated, encrypted and validated GitHub binding.
KCC_SMOKE_RUN_ID="$RUN_ID" bash deployment/docker/smoke-github-live-sync.sh

CONNECTION_ID="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const c=db.integration_connections.findOne({provider:'github',displayName:'Live GitHub smoke $RUN_ID'});
if(!c) quit(2);
print(c.id);
")"
CONNECTION_ID="$(printf '%s' "$CONNECTION_ID" | tr -d '\r\n')"
test -n "$CONNECTION_ID"

RESOURCE_DATA="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const r=db.external_resources.findOne({provider:'github',kind:'repository',connectionId:'$CONNECTION_ID'});
if(!r) quit(2);
print(r.scope.workspaceId + '|' + r.id);
")"
RESOURCE_DATA="$(printf '%s' "$RESOURCE_DATA" | tr -d '\r\n')"
WORKSPACE_ID="${RESOURCE_DATA%%|*}"
RESOURCE_ID="${RESOURCE_DATA#*|}"
[[ -n "$WORKSPACE_ID" && -n "$RESOURCE_ID" && "$WORKSPACE_ID" != "$RESOURCE_ID" ]]

LOGIN_RESPONSE="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$KCC_LOCAL_ADMIN_EMAIL\",\"password\":\"$KCC_LOCAL_ADMIN_PASSWORD\"}")"
ACCESS_TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"

WEBHOOK_RESPONSE="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/integrations/github/connections/$CONNECTION_ID/webhook" \
  -H "authorization: Bearer $ACCESS_TOKEN")"
WEBHOOK_DATA="$(printf '%s' "$WEBHOOK_RESPONSE" | python3 -c '
import json,sys
r=json.load(sys.stdin)
w=r["webhook"]
assert r["secretVisibleOnce"] is True
assert w["connectionId"]
assert w["path"].endswith(w["id"])
assert "secretRef" not in r and "secretRef" not in w
print(w["id"] + "|" + w["path"] + "|" + r["secret"])
')"
WEBHOOK_ID="${WEBHOOK_DATA%%|*}"
WEBHOOK_REST="${WEBHOOK_DATA#*|}"
WEBHOOK_PATH="${WEBHOOK_REST%%|*}"
WEBHOOK_SECRET="${WEBHOOK_REST#*|}"
[[ "$WEBHOOK_ID" == ghwh_* ]]
[[ "$WEBHOOK_PATH" == "/v1/integrations/github/webhooks/$WEBHOOK_ID" ]]
[[ ${#WEBHOOK_SECRET} -eq 64 ]]
if printf '%s' "$WEBHOOK_RESPONSE" | grep -Fq "$KCC_GITHUB_MOCK_TOKEN"; then
  echo 'Webhook provisioning response leaked provider credential' >&2
  exit 1
fi

RAW_BODY='{"action":"opened","repository":{"full_name":"Emmakex/Kairoseth-Command-Center"}}'
DELIVERY_ID="webhook-${RUN_ID}"
SIGNATURE="$(python3 - "$WEBHOOK_SECRET" "$RAW_BODY" <<'PY'
import hashlib, hmac, sys
print('sha256=' + hmac.new(sys.argv[1].encode(), sys.argv[2].encode(), hashlib.sha256).hexdigest())
PY
)"

RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"' EXIT

STATUS="$(curl --silent --output "$RESPONSE_FILE" --write-out '%{http_code}' \
  -X POST "$API_BASE_URL$WEBHOOK_PATH" \
  -H 'content-type: application/json' \
  -H "x-hub-signature-256: $SIGNATURE" \
  -H "x-github-delivery: $DELIVERY_ID" \
  -H 'x-github-event: pull_request' \
  --data-binary "$RAW_BODY")"
[[ "$STATUS" == "202" ]]
python3 - "$RESPONSE_FILE" <<'PY'
import json,sys
with open(sys.argv[1], encoding='utf-8') as fh:
    r=json.load(fh)
assert r["accepted"] is True
assert r["action"] == "refresh_enqueued"
assert r["jobId"]
PY

# The exact same delivery is acknowledged as a replay and must not enqueue twice.
STATUS="$(curl --silent --output "$RESPONSE_FILE" --write-out '%{http_code}' \
  -X POST "$API_BASE_URL$WEBHOOK_PATH" \
  -H 'content-type: application/json' \
  -H "x-hub-signature-256: $SIGNATURE" \
  -H "x-github-delivery: $DELIVERY_ID" \
  -H 'x-github-event: pull_request' \
  --data-binary "$RAW_BODY")"
[[ "$STATUS" == "202" ]]
python3 - "$RESPONSE_FILE" <<'PY'
import json,sys
with open(sys.argv[1], encoding='utf-8') as fh:
    r=json.load(fh)
assert r == {"accepted": True, "replay": True}
PY

# A different delivery with an invalid signature is rejected before replay persistence.
BAD_DELIVERY_ID="${DELIVERY_ID}-bad-signature"
STATUS="$(curl --silent --output "$RESPONSE_FILE" --write-out '%{http_code}' \
  -X POST "$API_BASE_URL$WEBHOOK_PATH" \
  -H 'content-type: application/json' \
  -H "x-hub-signature-256: sha256=$(printf '0%.0s' {1..64})" \
  -H "x-github-delivery: $BAD_DELIVERY_ID" \
  -H 'x-github-event: pull_request' \
  --data-binary "$RAW_BODY")"
[[ "$STATUS" == "401" ]]

DEDUPE_KEY="webhook:${WEBHOOK_ID}:${DELIVERY_ID}"
COMPLETED=0
for attempt in {1..60}; do
  JOB_STATUS="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const j=db.integration_sync_jobs.findOne({workspaceId:'$WORKSPACE_ID',dedupeKey:'$DEDUPE_KEY'});
print(j ? j.status : 'missing');
")"
  JOB_STATUS="$(printf '%s' "$JOB_STATUS" | tr -d '\r\n')"
  if [[ "$JOB_STATUS" == "completed" ]]; then
    COMPLETED=1
    break
  fi
  if [[ "$JOB_STATUS" == "dead" ]]; then
    ${COMPOSE[@]} logs --no-color worker github-background-mock >&2
    exit 1
  fi
  sleep 1
done
[[ "$COMPLETED" == "1" ]]

SIGNAL_IDS="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const docs=db.integration_signals.find({workspaceId:'$WORKSPACE_ID',resourceId:'$RESOURCE_ID'}).toArray();
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

DELIVERY_COUNT="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
print(db.github_webhook_deliveries.countDocuments({endpointId:'$WEBHOOK_ID',deliveryId:'$DELIVERY_ID'}));
")"
DELIVERY_COUNT="$(printf '%s' "$DELIVERY_COUNT" | tr -d '\r\n')"
[[ "$DELIVERY_COUNT" == "1" ]]

BAD_DELIVERY_COUNT="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
print(db.github_webhook_deliveries.countDocuments({endpointId:'$WEBHOOK_ID',deliveryId:'$BAD_DELIVERY_ID'}));
")"
BAD_DELIVERY_COUNT="$(printf '%s' "$BAD_DELIVERY_COUNT" | tr -d '\r\n')"
[[ "$BAD_DELIVERY_COUNT" == "0" ]]

STORED_WEBHOOK="$(${COMPOSE[@]} exec -T mongo mongosh --quiet kairoseth_command_center --eval "
const w=db.github_webhook_endpoints.findOne({id:'$WEBHOOK_ID'});
if(!w || !w.secretRef) quit(2);
const s=db.integration_secrets.findOne({id:w.secretRef});
if(!s) quit(3);
const j=db.integration_sync_jobs.findOne({workspaceId:'$WORKSPACE_ID',dedupeKey:'$DEDUPE_KEY'});
const d=db.github_webhook_deliveries.findOne({endpointId:'$WEBHOOK_ID',deliveryId:'$DELIVERY_ID'});
print(JSON.stringify({w,s,j,d}));
")"
if printf '%s' "$STORED_WEBHOOK" | grep -Fq "$WEBHOOK_SECRET"; then
  echo 'Webhook secret leaked into operational storage' >&2
  exit 1
fi
if printf '%s' "$STORED_WEBHOOK" | grep -Fq "$KCC_GITHUB_MOCK_TOKEN"; then
  echo 'Provider credential leaked into webhook operational storage' >&2
  exit 1
fi

WORKER_LOGS="$(${COMPOSE[@]} logs --no-color worker)"
[[ "$WORKER_LOGS" != *"$WEBHOOK_SECRET"* ]]
[[ "$WORKER_LOGS" != *"$KCC_GITHUB_MOCK_TOKEN"* ]]

echo "GitHub verified webhook refresh smoke passed"
