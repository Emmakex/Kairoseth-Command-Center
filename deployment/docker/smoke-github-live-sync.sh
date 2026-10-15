#!/usr/bin/env bash
set -euo pipefail

: "${KCC_LOCAL_ADMIN_EMAIL:?KCC_LOCAL_ADMIN_EMAIL is required}"
: "${KCC_LOCAL_ADMIN_PASSWORD:?KCC_LOCAL_ADMIN_PASSWORD is required}"
: "${KCC_INTEGRATION_SECRET_KEY:?KCC_INTEGRATION_SECRET_KEY is required}"
: "${KCC_GITHUB_MOCK_TOKEN:?KCC_GITHUB_MOCK_TOKEN is required}"

API_BASE_URL="${KCC_API_BASE_URL:-http://localhost:4000}"
RUN_ID="${KCC_SMOKE_RUN_ID:-github-live-sync}"
compose=(docker compose -f docker-compose.yml -f deployment/docker/docker-compose.github-mock.yml)

login_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$KCC_LOCAL_ADMIN_EMAIL\",\"password\":\"$KCC_LOCAL_ADMIN_PASSWORD\"}")"
access_token="$(printf '%s' "$login_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"

connection_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/integrations/github/connections" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $access_token" \
  --data "{\"displayName\":\"Live GitHub smoke $RUN_ID\",\"token\":\"$KCC_GITHUB_MOCK_TOKEN\"}")"
connection_id="$(printf '%s' "$connection_response" | python3 -c 'import json,sys; c=json.load(sys.stdin)["connection"]; assert c["status"] == "unverified"; assert c["credentialConfigured"] is True; assert "secretRef" not in c; print(c["id"])')"
test -n "$connection_id"
if printf '%s' "$connection_response" | grep -Fq "$KCC_GITHUB_MOCK_TOKEN"; then
  echo 'Connection response leaked provider credential' >&2
  exit 1
fi

validate_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/integrations/github/connections/$connection_id/validate" \
  -H "authorization: Bearer $access_token")"
printf '%s' "$validate_response" | python3 -c 'import json,sys; c=json.load(sys.stdin)["connection"]; assert c["status"] == "active"; assert c["remoteAccountId"] == "101"; assert c["remoteAccountLabel"] == "mock-owner"; assert c["lastValidatedAt"]; assert "secretRef" not in c'
if printf '%s' "$validate_response" | grep -Fq "$KCC_GITHUB_MOCK_TOKEN"; then
  echo 'Validation response leaked provider credential' >&2
  exit 1
fi

project_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/quick-capture" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $access_token" \
  --data "{\"scope\":\"workspace\",\"kind\":\"project\",\"title\":\"GitHub live sync $RUN_ID\"}")"
project_id="$(printf '%s' "$project_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["project"]["id"])')"
test -n "$project_id"

link_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/integrations/github/repositories" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $access_token" \
  --data "{\"projectId\":\"$project_id\",\"owner\":\"Emmakex\",\"repository\":\"Kairoseth-Command-Center\"}")"
resource_id="$(printf '%s' "$link_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["repository"]["id"])')"
test -n "$resource_id"

bind_response="$(curl --fail --silent \
  -X PATCH "$API_BASE_URL/v1/integrations/github/repositories/$resource_id/connection" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $access_token" \
  --data "{\"connectionId\":\"$connection_id\"}")"
printf '%s' "$bind_response" | python3 -c 'import json,sys; r=json.load(sys.stdin)["repository"]; assert r["connectionId"] == sys.argv[1]' "$connection_id"

sync_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/integrations/github/repositories/$resource_id/sync" \
  -H "authorization: Bearer $access_token")"
printf '%s' "$sync_response" | python3 -c 'import json,sys; r=json.load(sys.stdin)["repository"]; m=r["metadata"]; assert m["githubRepositoryId"] == "1418536661"; assert m["remoteFullName"] == "Emmakex/Kairoseth-Command-Center"; assert m["defaultBranch"] == "main"; assert m["latestCommitSha"] == "0123456789abcdef0123456789abcdef01234567"; assert m["private"] is False; assert m["archived"] is False; assert m["lastSyncedAt"]'
if printf '%s' "$sync_response" | grep -Fq "$KCC_GITHUB_MOCK_TOKEN"; then
  echo 'Sync response leaked provider credential' >&2
  exit 1
fi

resource_doc="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "const r=db.external_resources.findOne({id:'$resource_id'}); if(!r) quit(2); print(JSON.stringify(r))")"
printf '%s' "$resource_doc" | python3 -c 'import json,sys; r=json.load(sys.stdin); m=r["metadata"]; assert r["connectionId"] == sys.argv[1]; assert m["githubRepositoryId"] == "1418536661"; assert m["defaultBranch"] == "main"; assert m["latestCommitSha"] == "0123456789abcdef0123456789abcdef01234567"; assert m["lastSyncedAt"]' "$connection_id"

secret_doc="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "const c=db.integration_connections.findOne({id:'$connection_id'}); if(!c || !c.secretRef) quit(2); const s=db.integration_secrets.findOne({id:c.secretRef}); if(!s) quit(3); print(JSON.stringify(s))")"
if printf '%s' "$secret_doc" | grep -Fq "$KCC_GITHUB_MOCK_TOKEN"; then
  echo 'Mongo secret storage leaked provider credential' >&2
  exit 1
fi

for attempt in {1..30}; do
  validated="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.timeline_events.countDocuments({type:'integration.github.validation_succeeded',entityId:'$connection_id'}))")"
  bound="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.timeline_events.countDocuments({type:'integration.github.repository_connection_bound',entityId:'$resource_id'}))")"
  synced="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.timeline_events.countDocuments({type:'repository.sync.completed',entityId:'$resource_id'}))")"
  if [ "$validated" = "1" ] && [ "$bound" = "1" ] && [ "$synced" = "1" ]; then
    printf 'GitHub live validation/sync smoke: OK (%s -> %s)\n' "$connection_id" "$resource_id"
    exit 0
  fi
  sleep 2
done

"${compose[@]}" logs worker api github-mock
exit 1
