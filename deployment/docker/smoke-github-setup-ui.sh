#!/usr/bin/env bash
set -euo pipefail

: "${KCC_LOCAL_ADMIN_EMAIL:?KCC_LOCAL_ADMIN_EMAIL is required}"
: "${KCC_LOCAL_ADMIN_PASSWORD:?KCC_LOCAL_ADMIN_PASSWORD is required}"
: "${KCC_GITHUB_MOCK_TOKEN:?KCC_GITHUB_MOCK_TOKEN is required}"

API_BASE_URL="${KCC_API_BASE_URL:-http://localhost:4000}"
WEB_BASE_URL="${KCC_WEB_BASE_URL:-http://localhost:3000}"
RUN_ID="${KCC_SMOKE_RUN_ID:-github-setup-ui}"
DISPLAY_NAME="UI GitHub smoke $RUN_ID"

login_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$KCC_LOCAL_ADMIN_EMAIL\",\"password\":\"$KCC_LOCAL_ADMIN_PASSWORD\"}")"
access_token="$(printf '%s' "$login_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"
test -n "$access_token"

web_post() {
  local output_file status
  output_file="$(mktemp)"
  status="$(curl --silent --output "$output_file" --write-out '%{http_code}' \
    -X POST "$WEB_BASE_URL/api/integrations/github" \
    -H "Cookie: kcc_session=$access_token" \
    "$@")"
  if [ "$status" != "303" ]; then
    cat "$output_file" >&2
    rm -f "$output_file"
    echo "Unexpected GitHub setup UI status: $status" >&2
    return 1
  fi
  rm -f "$output_file"
}

web_post \
  --data-urlencode 'locale=es' \
  --data-urlencode 'operation=connection-create' \
  --data-urlencode "displayName=$DISPLAY_NAME" \
  --data-urlencode "token=$KCC_GITHUB_MOCK_TOKEN"

connections_response="$(curl --fail --silent \
  "$API_BASE_URL/v1/integrations/github/connections" \
  -H "authorization: Bearer $access_token")"
connection_id="$(printf '%s' "$connections_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); name=sys.argv[1]; matches=[c for c in data["connections"] if c["displayName"]==name]; assert len(matches)==1; c=matches[0]; assert c["status"]=="unverified"; assert c["credentialConfigured"] is True; print(c["id"])' "$DISPLAY_NAME")"
test -n "$connection_id"
if printf '%s' "$connections_response" | grep -Fq "$KCC_GITHUB_MOCK_TOKEN"; then
  echo 'GitHub setup list leaked provider credential' >&2
  exit 1
fi

workspace_es="$(curl --fail --silent \
  -H "Cookie: kcc_session=$access_token" \
  "$WEB_BASE_URL/es?scope=workspace")"
printf '%s' "$workspace_es" | grep -Fq 'Configuración de GitHub'
printf '%s' "$workspace_es" | grep -Fq "$DISPLAY_NAME"
if printf '%s' "$workspace_es" | grep -Fq "$KCC_GITHUB_MOCK_TOKEN"; then
  echo 'GitHub setup HTML leaked provider credential' >&2
  exit 1
fi

web_post \
  --data-urlencode 'locale=es' \
  --data-urlencode 'operation=connection-validate' \
  --data-urlencode "connectionId=$connection_id"

connections_response="$(curl --fail --silent \
  "$API_BASE_URL/v1/integrations/github/connections" \
  -H "authorization: Bearer $access_token")"
printf '%s' "$connections_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); cid=sys.argv[1]; c=next(c for c in data["connections"] if c["id"]==cid); assert c["status"]=="active"; assert c["remoteAccountLabel"]=="mock-owner"; assert c["lastValidatedAt"]' "$connection_id"

repositories_response="$(curl --fail --silent \
  "$API_BASE_URL/v1/integrations/github/repositories" \
  -H "authorization: Bearer $access_token")"
resource_id="$(printf '%s' "$repositories_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); matches=[r for r in data["repositories"] if r["externalId"]=="emmakex/kairoseth-command-center"]; assert len(matches)==1; print(matches[0]["id"])')"
test -n "$resource_id"

web_post \
  --data-urlencode 'locale=en' \
  --data-urlencode 'operation=repository-bind' \
  --data-urlencode "resourceId=$resource_id" \
  --data-urlencode "connectionId=$connection_id"

repositories_response="$(curl --fail --silent \
  "$API_BASE_URL/v1/integrations/github/repositories" \
  -H "authorization: Bearer $access_token")"
printf '%s' "$repositories_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); rid=sys.argv[1]; cid=sys.argv[2]; r=next(r for r in data["repositories"] if r["id"]==rid); assert r["connectionId"]==cid' "$resource_id" "$connection_id"

web_post \
  --data-urlencode 'locale=en' \
  --data-urlencode 'operation=repository-sync' \
  --data-urlencode "resourceId=$resource_id"

repositories_response="$(curl --fail --silent \
  "$API_BASE_URL/v1/integrations/github/repositories" \
  -H "authorization: Bearer $access_token")"
printf '%s' "$repositories_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); rid=sys.argv[1]; r=next(r for r in data["repositories"] if r["id"]==rid); m=r["metadata"]; assert m["latestCommitSha"]=="0123456789abcdef0123456789abcdef01234567"; assert m["lastSyncedAt"]' "$resource_id"

workspace_en="$(curl --fail --silent \
  -H "Cookie: kcc_session=$access_token" \
  "$WEB_BASE_URL/en?scope=workspace")"
printf '%s' "$workspace_en" | grep -Fq 'GitHub setup'
printf '%s' "$workspace_en" | grep -Fq "$DISPLAY_NAME"
printf '%s' "$workspace_en" | grep -Fq 'Emmakex/Kairoseth-Command-Center'

private_en="$(curl --fail --silent \
  -H "Cookie: kcc_session=$access_token" \
  "$WEB_BASE_URL/en?scope=private")"
if printf '%s' "$private_en" | grep -Fq 'GitHub setup'; then
  echo 'Private dashboard leaked GitHub setup surface' >&2
  exit 1
fi
if printf '%s' "$private_en" | grep -Fq "$DISPLAY_NAME"; then
  echo 'Private dashboard leaked workspace GitHub connection' >&2
  exit 1
fi

printf 'GitHub setup UI smoke: OK (%s -> %s)\n' "$connection_id" "$resource_id"
