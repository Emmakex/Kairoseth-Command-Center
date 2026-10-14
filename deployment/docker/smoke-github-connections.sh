#!/usr/bin/env bash
set -euo pipefail

: "${KCC_LOCAL_ADMIN_EMAIL:?KCC_LOCAL_ADMIN_EMAIL is required}"
: "${KCC_LOCAL_ADMIN_PASSWORD:?KCC_LOCAL_ADMIN_PASSWORD is required}"
: "${KCC_INTEGRATION_SECRET_KEY:?KCC_INTEGRATION_SECRET_KEY is required}"

API_BASE_URL="${KCC_API_BASE_URL:-http://localhost:4000}"
COMPOSE_FILE="${KCC_COMPOSE_FILE:-docker-compose.yml}"
RUN_ID="${KCC_SMOKE_RUN_ID:-github-connections}"
compose=(docker compose -f "$COMPOSE_FILE")

token_one="github_pat_smoke_${RUN_ID}_first_credential_1234567890"
token_two="github_pat_smoke_${RUN_ID}_rotated_credential_0987654321"

login_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$KCC_LOCAL_ADMIN_EMAIL\",\"password\":\"$KCC_LOCAL_ADMIN_PASSWORD\"}")"
access_token="$(printf '%s' "$login_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"

ready_response="$(curl --fail --silent "$API_BASE_URL/ready")"
printf '%s' "$ready_response" | python3 -c 'import json,sys; assert json.load(sys.stdin)["checks"]["integrationSecrets"] == "ok"'

create_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/integrations/github/connections" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $access_token" \
  --data "{\"displayName\":\"GitHub smoke $RUN_ID\",\"token\":\"$token_one\",\"workspaceId\":\"attacker-workspace\",\"secretRef\":\"attacker-ref\"}")"
connection_id="$(printf '%s' "$create_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); c=data["connection"]; assert c["provider"] == "github"; assert c["credentialConfigured"] is True; assert "secretRef" not in c; assert "token" not in c; print(c["id"])')"
test -n "$connection_id"
if printf '%s' "$create_response" | grep -Fq "$token_one"; then
  echo 'Create response leaked plaintext token' >&2
  exit 1
fi

secret_ref="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "const c=db.integration_connections.findOne({id:'$connection_id',provider:'github'}); if(!c) quit(2); print(c.secretRef)")"
test -n "$secret_ref"
test "$secret_ref" != "attacker-ref"

secret_doc_before="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "const s=db.integration_secrets.findOne({id:'$secret_ref'}); if(!s) quit(2); print(JSON.stringify(s))")"
if printf '%s' "$secret_doc_before" | grep -Fq "$token_one"; then
  echo 'Mongo integration_secrets leaked plaintext token' >&2
  exit 1
fi
ciphertext_before="$(printf '%s' "$secret_doc_before" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ciphertext"])')"
test -n "$ciphertext_before"

list_response="$(curl --fail --silent \
  "$API_BASE_URL/v1/integrations/github/connections" \
  -H "authorization: Bearer $access_token")"
printf '%s' "$list_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert len(data["connections"]) == 1; c=data["connections"][0]; assert c["credentialConfigured"] is True; assert "secretRef" not in c; assert "token" not in c'

rotate_response="$(curl --fail --silent \
  -X PATCH "$API_BASE_URL/v1/integrations/github/connections/$connection_id/credential" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $access_token" \
  --data "{\"token\":\"$token_two\"}")"
if printf '%s' "$rotate_response" | grep -Fq "$token_two"; then
  echo 'Rotate response leaked plaintext token' >&2
  exit 1
fi
printf '%s' "$rotate_response" | python3 -c 'import json,sys; c=json.load(sys.stdin)["connection"]; assert c["credentialConfigured"] is True; assert "secretRef" not in c; assert "token" not in c'

secret_doc_after="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "const s=db.integration_secrets.findOne({id:'$secret_ref'}); if(!s) quit(2); print(JSON.stringify(s))")"
if printf '%s' "$secret_doc_after" | grep -Fq "$token_two"; then
  echo 'Rotated Mongo secret leaked plaintext token' >&2
  exit 1
fi
ciphertext_after="$(printf '%s' "$secret_doc_after" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ciphertext"])')"
test -n "$ciphertext_after"
test "$ciphertext_after" != "$ciphertext_before"

curl --fail --silent \
  -X DELETE "$API_BASE_URL/v1/integrations/github/connections/$connection_id" \
  -H "authorization: Bearer $access_token" >/dev/null

connection_count="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "print(db.integration_connections.countDocuments({id:'$connection_id'}))")"
secret_count="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
  "print(db.integration_secrets.countDocuments({id:'$secret_ref'}))")"
test "$connection_count" = "0"
test "$secret_count" = "0"

for attempt in {1..30}; do
  connected="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.timeline_events.countDocuments({type:'integration.github.connected',entityId:'$connection_id'}))")"
  rotated="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.timeline_events.countDocuments({type:'integration.github.credential_rotated',entityId:'$connection_id'}))")"
  disconnected="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.timeline_events.countDocuments({type:'integration.github.disconnected',entityId:'$connection_id'}))")"
  delivered="$("${compose[@]}" exec -T mongo mongosh --quiet kairoseth_command_center --eval \
    "print(db.audit_outbox.countDocuments({'event.entityId':'$connection_id',status:'delivered'}))")"
  if [ "$connected" = "1" ] && [ "$rotated" = "1" ] && [ "$disconnected" = "1" ] && [ "$delivered" = "3" ]; then
    printf 'GitHub encrypted connection smoke: OK (%s)\n' "$connection_id"
    exit 0
  fi
  sleep 2
done

"${compose[@]}" logs worker api
exit 1
