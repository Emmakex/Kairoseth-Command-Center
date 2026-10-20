#!/usr/bin/env bash
set -euo pipefail

BRIDGE_VERSION="0.1.1"
BRIDGE_COMMIT_SHORT="929acb5ee07f"
BRIDGE_ARCHIVE="agent-bridge-${BRIDGE_VERSION}-${BRIDGE_COMMIT_SHORT}.tar.gz"
BRIDGE_SHA256="04193f06dbedc7555198eb2b5f92b69cd807b223f066002bf81c772c354431af"
BRIDGE_URL="https://github.com/Emmakex/kairoseth-agent-bridge/releases/download/v${BRIDGE_VERSION}/${BRIDGE_ARCHIVE}"
PLATFORM_BASE_URL="${KAB_PHASE7_PLATFORM_BASE_URL:-http://work-manager-edge/}"
LIVE_ENV_FILE="${KAB_PHASE7_LIVE_ENV_FILE:-/srv/kairoseth/apps/work-manager/shared/runtime.env}"
LIVE_APP_NETWORK="${KAB_PHASE7_LIVE_APP_NETWORK:-work-manager-live_app}"
PUBLIC_EDGE_NETWORK="${KAB_PHASE7_PUBLIC_EDGE_NETWORK:-kairoseth-public-edge}"
NODE_IMAGE="${KAB_PHASE7_NODE_IMAGE:-node:22-bookworm-slim}"
WORDPRESS_IMAGE="${KAB_PHASE7_WORDPRESS_IMAGE:-wordpress:7.1.3-php8.2-apache}"
WORDPRESS_CLI_IMAGE="${KAB_PHASE7_WORDPRESS_CLI_IMAGE:-wordpress:cli-2.12.0-php8.2}"
MARIADB_IMAGE="${KAB_PHASE7_MARIADB_IMAGE:-mariadb:11.4.13}"
CADDY_IMAGE="${KAB_PHASE7_CADDY_IMAGE:-caddy:2-alpine}"
CURL_IMAGE="${KAB_PHASE7_CURL_IMAGE:-curlimages/curl:8.16.0}"

run_id="${GITHUB_RUN_ID:-local}-$$"
prefix="kab-phase7-${run_id//[^a-zA-Z0-9_.-]/-}"
network="${prefix}-wc"
db_container="${prefix}-db"
wp_container="${prefix}-wp"
caddy_container="${prefix}-caddy"
acceptance_container="${prefix}-acceptance"
wp_volume="${prefix}-wp-data"
db_volume="${prefix}-db-data"
work_root="${RUNNER_TEMP:-/tmp}/${prefix}"
archive_path="$work_root/$BRIDGE_ARCHIVE"
extract_root="$work_root/stable"
secrets_dir="$work_root/secrets"
evidence_dir="${KAB_PHASE7_EVIDENCE_DIR:-$work_root/evidence}"
state_dir="$work_root/state"
certs_dir="$work_root/certs"

cleanup() {
  set +e
  docker rm -f "$acceptance_container" "$caddy_container" "$wp_container" "$db_container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker volume rm "$wp_volume" "$db_volume" >/dev/null 2>&1 || true
  if [[ -z "${KAB_PHASE7_KEEP_WORKDIR:-}" ]]; then
    rm -rf "$work_root"
  fi
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

for command_name in docker curl openssl sha256sum python3; do
  require_command "$command_name"
done

if [[ ! -f "$LIVE_ENV_FILE" ]]; then
  echo "Protected Work Manager live environment not found: $LIVE_ENV_FILE" >&2
  exit 1
fi
if [[ "$(stat -c '%a' "$LIVE_ENV_FILE")" != "600" ]]; then
  echo "Protected Work Manager live environment must have mode 0600." >&2
  exit 1
fi
if ! docker network inspect "$LIVE_APP_NETWORK" >/dev/null 2>&1; then
  echo "Work Manager live app network not found: $LIVE_APP_NETWORK" >&2
  exit 1
fi
if ! docker network inspect "$PUBLIC_EDGE_NETWORK" >/dev/null 2>&1; then
  echo "Kairoseth public edge network not found: $PUBLIC_EDGE_NETWORK" >&2
  exit 1
fi

mkdir -p "$extract_root" "$secrets_dir" "$evidence_dir" "$state_dir" "$certs_dir"
chmod 700 "$secrets_dir" "$state_dir" "$certs_dir"

curl --fail --silent --show-error --location "$BRIDGE_URL" --output "$archive_path"
printf '%s  %s\n' "$BRIDGE_SHA256" "$archive_path" | sha256sum --check --status || {
  echo "Stable Agent Bridge archive checksum mismatch." >&2
  exit 1
}

tar -xzf "$archive_path" -C "$extract_root"
bridge_dir="$extract_root"
if [[ ! -f "$bridge_dir/package.json" ]]; then
  package_json="$(find "$extract_root" -mindepth 2 -maxdepth 2 -name package.json -print -quit)"
  [[ -n "$package_json" ]] || {
    echo "Stable archive package.json not found." >&2
    exit 1
  }
  bridge_dir="$(dirname "$package_json")"
fi

stable_version="$(python3 - "$bridge_dir/package.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    print(json.load(f)['version'])
PY
)"
[[ "$stable_version" == "$BRIDGE_VERSION" ]] || {
  echo "Stable archive version mismatch: expected $BRIDGE_VERSION, got $stable_version" >&2
  exit 1
}
[[ -f "$bridge_dir/dist/src/cli/phase7-real-platform-acceptance.js" ]] || {
  echo "Stable archive does not contain the Phase 7 acceptance runner." >&2
  exit 1
}

docker run --rm \
  -v "$bridge_dir:/app" \
  -w /app \
  "$NODE_IMAGE" \
  npm ci --omit=dev --no-audit --no-fund >/dev/null

# shellcheck disable=SC1090
. "$LIVE_ENV_FILE"
: "${KCC_LOCAL_ADMIN_EMAIL:?KCC_LOCAL_ADMIN_EMAIL missing from live environment}"
: "${KCC_LOCAL_ADMIN_PASSWORD:?KCC_LOCAL_ADMIN_PASSWORD missing from live environment}"

login_payload="$(KCC_EMAIL="$KCC_LOCAL_ADMIN_EMAIL" KCC_PASSWORD="$KCC_LOCAL_ADMIN_PASSWORD" python3 - <<'PY'
import json, os
print(json.dumps({'email': os.environ['KCC_EMAIL'], 'password': os.environ['KCC_PASSWORD']}))
PY
)"
login_response="$(printf '%s' "$login_payload" | docker run --rm -i \
  --network "$LIVE_APP_NETWORK" \
  "$CURL_IMAGE" \
  --fail --silent --show-error \
  -X POST http://api:4000/v1/auth/local/login \
  -H 'content-type: application/json' \
  --data-binary @-)"
operator_token="$(printf '%s' "$login_response" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"
unset login_payload login_response KCC_LOCAL_ADMIN_EMAIL KCC_LOCAL_ADMIN_PASSWORD
unset KCC_LOCAL_AUTH_SECRET KCC_INTEGRATION_SECRET_KEY || true
printf '%s' "$operator_token" > "$secrets_dir/operator-token"
chmod 600 "$secrets_dir/operator-token"
unset operator_token

# A real but disposable WooCommerce instance keeps Phase 7.3 away from customer orders.
docker network create "$network" >/dev/null
docker volume create "$wp_volume" >/dev/null
docker volume create "$db_volume" >/dev/null

db_root_password="$(openssl rand -hex 24)"
db_password="$(openssl rand -hex 24)"
wp_admin_password="$(openssl rand -hex 24)"

docker run -d --name "$db_container" \
  --network "$network" --network-alias db \
  -e MARIADB_ROOT_PASSWORD="$db_root_password" \
  -e MARIADB_DATABASE=wordpress \
  -e MARIADB_USER=wordpress \
  -e MARIADB_PASSWORD="$db_password" \
  -v "$db_volume:/var/lib/mysql" \
  "$MARIADB_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$db_container" mariadb-admin ping -h 127.0.0.1 -uroot -p"$db_root_password" --silent >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$db_container" mariadb-admin ping -h 127.0.0.1 -uroot -p"$db_root_password" --silent >/dev/null

docker run -d --name "$wp_container" \
  --network "$network" --network-alias wordpress \
  -e WORDPRESS_DB_HOST=db:3306 \
  -e WORDPRESS_DB_USER=wordpress \
  -e WORDPRESS_DB_PASSWORD="$db_password" \
  -e WORDPRESS_DB_NAME=wordpress \
  -v "$wp_volume:/var/www/html" \
  "$WORDPRESS_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$wp_container" test -f /var/www/html/wp-config.php >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$wp_container" test -f /var/www/html/wp-config.php

wp() {
  docker run --rm \
    --network "$network" \
    --volumes-from "$wp_container" \
    -e WORDPRESS_DB_HOST=db:3306 \
    -e WORDPRESS_DB_USER=wordpress \
    -e WORDPRESS_DB_PASSWORD="$db_password" \
    -e WORDPRESS_DB_NAME=wordpress \
    --user 33:33 \
    "$WORDPRESS_CLI_IMAGE" "$@"
}

wp core install \
  --url=https://wc-phase7 \
  --title='Kairoseth Agent Bridge Phase 7 Acceptance' \
  --admin_user=phase7-operator \
  --admin_password="$wp_admin_password" \
  --admin_email=phase7@example.invalid \
  --skip-email >/dev/null
wp plugin install woocommerce --activate >/dev/null
wp rewrite structure '/%postname%/' --hard >/dev/null

order_id="$(wp eval '$order=wc_create_order();$order->set_status("processing");$order->set_currency("EUR");$order->set_billing_first_name("Phase");$order->set_billing_last_name("Seven");$order->set_billing_email("phase7@example.invalid");$order->set_total(10);$order->save();echo $order->get_id();')"
[[ "$order_id" =~ ^[1-9][0-9]*$ ]] || {
  echo "Controlled WooCommerce order creation failed." >&2
  exit 1
}

keys_json="$(wp eval 'global $wpdb;$key="ck_".wc_rand_hash();$secret="cs_".wc_rand_hash();$ok=$wpdb->insert($wpdb->prefix."woocommerce_api_keys",array("user_id"=>1,"description"=>"Phase 7 stable acceptance","permissions"=>"read_write","consumer_key"=>wc_api_hash($key),"consumer_secret"=>$secret,"truncated_key"=>substr($key,-7)));if(!$ok){fwrite(STDERR,"api key insert failed\n");exit(1);}echo wp_json_encode(array("consumer_key"=>$key,"consumer_secret"=>$secret));')"
consumer_key="$(printf '%s' "$keys_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["consumer_key"])')"
consumer_secret="$(printf '%s' "$keys_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["consumer_secret"])')"
unset keys_json wp_admin_password db_root_password
printf '%s' "$consumer_key" > "$secrets_dir/wc-consumer-key"
printf '%s' "$consumer_secret" > "$secrets_dir/wc-consumer-secret"
chmod 600 "$secrets_dir/wc-consumer-key" "$secrets_dir/wc-consumer-secret"
unset consumer_key consumer_secret

openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
  -subj '/CN=Kairoseth Phase 7 Acceptance CA' \
  -keyout "$certs_dir/ca.key" -out "$certs_dir/ca.crt" >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes \
  -subj '/CN=wc-phase7' \
  -keyout "$certs_dir/server.key" -out "$certs_dir/server.csr" >/dev/null 2>&1
cat > "$certs_dir/server.ext" <<'EOF_CERT'
subjectAltName=DNS:wc-phase7
extendedKeyUsage=serverAuth
EOF_CERT
openssl x509 -req -days 2 \
  -in "$certs_dir/server.csr" \
  -CA "$certs_dir/ca.crt" -CAkey "$certs_dir/ca.key" -CAcreateserial \
  -extfile "$certs_dir/server.ext" \
  -out "$certs_dir/server.crt" >/dev/null 2>&1
chmod 600 "$certs_dir/ca.key" "$certs_dir/server.key"
cp "$certs_dir/ca.crt" "$secrets_dir/wc-ca.crt"
chmod 600 "$secrets_dir/wc-ca.crt"

cat > "$work_root/Caddyfile" <<'EOF_CADDY'
https://wc-phase7 {
  tls /certs/server.crt /certs/server.key
  reverse_proxy wordpress:80
}
EOF_CADDY

docker run -d --name "$caddy_container" \
  --network "$network" --network-alias wc-phase7 \
  -v "$work_root/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$certs_dir:/certs:ro" \
  "$CADDY_IMAGE" >/dev/null

for _ in $(seq 1 45); do
  if docker run --rm --network "$network" \
    -v "$certs_dir:/certs:ro" \
    "$CURL_IMAGE" \
    --cacert /certs/ca.crt --fail --silent --show-error \
    https://wc-phase7/wp-json/ >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker run --rm --network "$network" \
  -v "$certs_dir:/certs:ro" \
  -v "$secrets_dir:/secrets:ro" \
  "$CURL_IMAGE" sh -ceu '
    key="$(cat /secrets/wc-consumer-key)"
    secret="$(cat /secrets/wc-consumer-secret)"
    curl --cacert /certs/ca.crt --fail --silent --show-error \
      --user "$key:$secret" \
      "https://wc-phase7/wp-json/wc/v3/orders/'"$order_id"'" >/dev/null
  '

# The acceptance process is created on the disposable WooCommerce network and
# then attached to the existing Kairoseth public-edge network. This exercises
# the real live Agent Bridge edge contract without exposing local auth.
docker create --name "$acceptance_container" \
  --network "$network" \
  -v "$bridge_dir:/app" \
  -v "$secrets_dir:/secrets:ro" \
  -v "$evidence_dir:/evidence" \
  -v "$state_dir:/state" \
  -w /app \
  -e NODE_EXTRA_CA_CERTS=/secrets/wc-ca.crt \
  -e KAB_PLATFORM_BASE_URL="$PLATFORM_BASE_URL" \
  -e KAB_ACCEPTANCE_ALLOW_INSECURE_PLATFORM_HTTP=true \
  -e KAB_STATE_DIR=/state \
  -e KAB_ACCEPTANCE_ARTIFACT_SHA256="sha256:${BRIDGE_SHA256}" \
  -e KAB_ACCEPTANCE_OPERATOR_TOKEN_FILE=/secrets/operator-token \
  -e KAB_ACCEPTANCE_WC_BASE_URL=https://wc-phase7/ \
  -e KAB_ACCEPTANCE_WC_CONSUMER_KEY_FILE=/secrets/wc-consumer-key \
  -e KAB_ACCEPTANCE_WC_CONSUMER_SECRET_FILE=/secrets/wc-consumer-secret \
  -e KAB_ACCEPTANCE_WC_ORDER_ID="$order_id" \
  -e KAB_ACCEPTANCE_WC_EXPECTED_STATUS=processing \
  -e KAB_ACCEPTANCE_WC_TARGET_STATUS=completed \
  -e KAB_ACCEPTANCE_ALLOW_PRIVATE_WC_NETWORK=true \
  -e KAB_ACCEPTANCE_TIMEOUT_MS=180000 \
  -e KAB_ACCEPTANCE_EVIDENCE_PATH=/evidence/phase7-real-platform.json \
  "$NODE_IMAGE" \
  npm run acceptance:phase7-platform >/dev/null

docker network connect "$PUBLIC_EDGE_NETWORK" "$acceptance_container"
docker start -a "$acceptance_container"

python3 - "$evidence_dir/phase7-real-platform.json" "$BRIDGE_SHA256" <<'PY'
import json, sys
path, digest = sys.argv[1], sys.argv[2]
with open(path, encoding='utf-8') as f:
    evidence = json.load(f)
assert evidence['result'] == 'passed'
assert evidence['runtimeVersion'] == '0.1.1'
assert evidence['artifactSha256'] == f'sha256:{digest}'
assert evidence['read']['status'] == 'executed'
assert evidence['write']['status'] == 'executed'
assert evidence['restart']['identityPreserved'] is True
assert evidence['restart']['bindingPreserved'] is True
assert evidence['restart']['completedCommandsNotRedelivered'] is True
assert evidence['auditOutboxDrained'] is True
assert evidence['durableStateSecretScan'] == 'passed'
print('Phase 7.3 stable acceptance: PASS')
print(f"installationId={evidence['installationId']}")
print(f"runtimeVersion={evidence['runtimeVersion']}")
print(f"artifactSha256={evidence['artifactSha256']}")
PY

# Preserve only the sanitized evidence for the workflow artifact.
if [[ "$evidence_dir" == "$work_root/evidence" ]]; then
  final_evidence_dir="${RUNNER_TEMP:-/tmp}/kab-phase7-evidence-${GITHUB_RUN_ID:-local}"
  rm -rf "$final_evidence_dir"
  mkdir -p "$final_evidence_dir"
  cp "$evidence_dir/phase7-real-platform.json" "$final_evidence_dir/phase7-real-platform.json"
  echo "KAB_PHASE7_EVIDENCE_PATH=$final_evidence_dir/phase7-real-platform.json" >> "${GITHUB_ENV:-/dev/null}"
fi
