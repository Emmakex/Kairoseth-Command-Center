#!/usr/bin/env bash
set -euo pipefail

: "${KCC_LOCAL_ADMIN_EMAIL:?KCC_LOCAL_ADMIN_EMAIL is required}"
: "${KCC_LOCAL_ADMIN_PASSWORD:?KCC_LOCAL_ADMIN_PASSWORD is required}"

API_BASE_URL="${KCC_API_BASE_URL:-http://localhost:4000}"
RUN_ID="${KCC_SMOKE_RUN_ID:-local}"
MEMBER_EMAIL="member-${RUN_ID}@kcc.local"
MEMBER_PASSWORD="member-${RUN_ID}-password-valid"
CHANGED_PASSWORD="member-${RUN_ID}-password-changed"

json_value() {
  local expression="$1"
  python3 -c "import json,sys; data=json.load(sys.stdin); print(${expression})"
}

owner_login="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$KCC_LOCAL_ADMIN_EMAIL\",\"password\":\"$KCC_LOCAL_ADMIN_PASSWORD\"}")"
owner_token="$(printf '%s' "$owner_login" | json_value 'data["accessToken"]')"
owner_id="$(printf '%s' "$owner_login" | json_value 'data["user"]["id"]')"

member_response="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/members" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $owner_token" \
  --data "{\"email\":\"$MEMBER_EMAIL\",\"displayName\":\"Smoke Member\",\"locale\":\"en\",\"timezone\":\"Europe/Madrid\",\"role\":\"member\",\"password\":\"$MEMBER_PASSWORD\"}")"
member_id="$(printf '%s' "$member_response" | json_value 'data["member"]["id"]')"
test -n "$member_id"

member_login="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$MEMBER_PASSWORD\"}")"
member_token="$(printf '%s' "$member_login" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data["role"] == "member"; print(data["accessToken"])')"

member_manage_status="$(curl --silent --output /tmp/kcc-member-manage.json --write-out '%{http_code}' \
  "$API_BASE_URL/v1/auth/local/members" \
  -H "authorization: Bearer $member_token")"
test "$member_manage_status" = "403"
python3 -c 'import json; assert json.load(open("/tmp/kcc-member-manage.json"))["error"] == "forbidden"'

owner_protection_status="$(curl --silent --output /tmp/kcc-owner-protection.json --write-out '%{http_code}' \
  -X PATCH "$API_BASE_URL/v1/auth/local/members/$owner_id" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $owner_token" \
  --data '{"role":"member"}')"
test "$owner_protection_status" = "409"
python3 -c 'import json; assert json.load(open("/tmp/kcc-owner-protection.json"))["error"] == "owner_protected"'

curl --fail --silent --output /dev/null \
  -X POST "$API_BASE_URL/v1/auth/local/change-password" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $member_token" \
  --data "{\"currentPassword\":\"$MEMBER_PASSWORD\",\"newPassword\":\"$CHANGED_PASSWORD\"}"

stale_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  "$API_BASE_URL/v1/session" \
  -H "authorization: Bearer $member_token")"
test "$stale_status" = "401"

old_password_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$MEMBER_PASSWORD\"}")"
test "$old_password_status" = "401"

renewed_login="$(curl --fail --silent \
  -X POST "$API_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$CHANGED_PASSWORD\"}")"
renewed_token="$(printf '%s' "$renewed_login" | python3 -c 'import json,sys; data=json.load(sys.stdin); assert data["role"] == "member"; print(data["accessToken"])')"
curl --fail --silent "$API_BASE_URL/v1/session" \
  -H "authorization: Bearer $renewed_token" >/dev/null

printf 'persistent local identity smoke: OK (%s)\n' "$member_id"
