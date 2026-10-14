#!/usr/bin/env bash
set -euo pipefail

: "${KCC_LOCAL_ADMIN_EMAIL:?KCC_LOCAL_ADMIN_EMAIL is required}"
: "${KCC_LOCAL_ADMIN_PASSWORD:?KCC_LOCAL_ADMIN_PASSWORD is required}"

API_BASE_URL="${KCC_API_BASE_URL:-http://localhost:4000}"
COMPOSE_FILE="${KCC_COMPOSE_FILE:-docker-compose.yml}"
RUN_ID="${KCC_SMOKE_RUN_ID:-github-links}"

compose=(docker compose -f "$COMPOSE_FILE")

login_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$KCC_LOCAL_ADMIN_EMAIL\",\"password\":\"$KCC_LOCAL_ADMIN_PASSWORD\"}")"
access_token="$(printf '%s' "$login_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"

project_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/quick-capture" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $access_token" \
  --data "{\"scope\":\"workspace\",\"kind\":\"project\",\"title\":\"GitHub smoke $RUN_ID\"}")"
project_id="$(printf '%s' "$project_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["project"]["id"])')"
test -n "$project_id"

link_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/integrations/github/repositories" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $access_token" \
  --data "{\"projectId\":\"$project_id\",\"owner\":\"Emmakex\",\"repository\":\"phase4-smoke-$RUN_ID\",\"defaultBranch\":\"main\",\"url\":\"https://attacker.invalid/ignored\"}")"
resource_id="$(printf '%s' "$link_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); repo=data["repository"]; assert repo["scope"]["kind"] == "workspace"; assert repo["url"].startswith("https://github.com/Emmakex/"); assert "attacker.invalid" not in repo["url"]; print(repo["id"])')"
test -n "$resource_id"

listed_response="$(curl --fail --silent \
  "$API_BASE_URL/v1/integrations/github/repositories?projectId=$project_id" \
  -H "authorization: Bearer $access_token")"
printf '%s' "$listed_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert len(data["repositories"]) == 1'

resource_count="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "print(db.external_resources.countDocuments({id:'$resource_id',provider:'github',kind:'repository'}))")"
test "$resource_count" = "1"

curl --fail --silent \
  -X DELETE "$API_BASE_URL/v1/integrations/github/repositories/$resource_id" \
  -H "authorization: Bearer $access_token" >/dev/null

resource_count_after="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "print(db.external_resources.countDocuments({id:'$resource_id'}))")"
test "$resource_count_after" = "0"

for attempt in {1..30}; do
  linked_timeline="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.timeline_events.countDocuments({type:'integration.github.repository_linked',entityId:'$resource_id'}))")"
  unlinked_timeline="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.timeline_events.countDocuments({type:'integration.github.repository_unlinked',entityId:'$resource_id'}))")"
  delivered_outbox="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.audit_outbox.countDocuments({'event.entityId':'$resource_id',status:'delivered'}))")"
  if [ "$linked_timeline" = "1" ] && [ "$unlinked_timeline" = "1" ] && [ "$delivered_outbox" = "2" ]; then
    printf 'GitHub repository link smoke: OK (%s)\n' "$resource_id"
    exit 0
  fi
  sleep 2
done

"${compose[@]}" logs worker api
exit 1
