#!/usr/bin/env bash
set -euo pipefail

bridge_ref="f9bf4d550d60b4b2941e8e2be02b1baef84987e0"
bridge_source="${RUNNER_TEMP:-/tmp}/kairoseth-agent-bridge-${GITHUB_RUN_ID:-local}"
export AGENT_BRIDGE_SOURCE="$bridge_source"
export PLATFORM_BASE_URL="http://127.0.0.1:4000"

cleanup() {
  docker compose down -v >/dev/null 2>&1 || true
  rm -rf "$bridge_source"
}
trap cleanup EXIT

rm -rf "$bridge_source"
git clone --quiet https://github.com/Emmakex/kairoseth-agent-bridge.git "$bridge_source"
git -C "$bridge_source" checkout --quiet "$bridge_ref"
(
  cd "$bridge_source"
  npm ci
  npm run build
)

export KCC_AUTH_MODE=local
export KCC_LOCAL_ADMIN_EMAIL="agent-bridge-command-ci@kcc.local"
export KCC_LOCAL_ADMIN_PASSWORD="agent-bridge-command-${GITHUB_RUN_ID:-local}-valid"
export KCC_LOCAL_AUTH_SECRET="$(openssl rand -hex 32)"

docker compose up -d --build
for attempt in {1..45}; do
  if curl --fail --silent "$PLATFORM_BASE_URL/ready" >/dev/null; then
    break
  fi
  if [[ "$attempt" == 45 ]]; then
    docker compose ps
    docker compose logs api mongo
    exit 1
  fi
  sleep 2
done

login_response="$(curl --fail --silent \
  -X POST "$PLATFORM_BASE_URL/v1/auth/local/login" \
  -H 'content-type: application/json' \
  --data "{\"email\":\"$KCC_LOCAL_ADMIN_EMAIL\",\"password\":\"$KCC_LOCAL_ADMIN_PASSWORD\"}")"
export OPERATOR_ACCESS_TOKEN="$(printf '%s' "$login_response" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).accessToken))')"

session_response="$(curl --fail --silent \
  "$PLATFORM_BASE_URL/v1/session" \
  -H "authorization: Bearer $OPERATOR_ACCESS_TOKEN")"
export WORKSPACE_ID="$(printf '%s' "$session_response" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).activeWorkspaceId))')"
printf '%s' "$session_response" | node -e '
let s="";
process.stdin.on("data",d=>s+=d).on("end",()=>{
  const data=JSON.parse(s);
  if (!data.productEntitlements.includes("agent-bridge")) process.exit(1);
  if (!data.capabilities.includes("workspace.manage")) process.exit(1);
});
'

enrollment_response="$(curl --fail --silent \
  -X POST "$PLATFORM_BASE_URL/v1/products/agent-bridge/enrollment-tokens" \
  -H "authorization: Bearer $OPERATOR_ACCESS_TOKEN")"
export ENROLLMENT_TOKEN="$(printf '%s' "$enrollment_response" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);if(d.version!=="kcc.agent-bridge-enrollment-token.v1")process.exit(1);process.stdout.write(d.token)})')"

node scripts/ci/agent-bridge-command-delivery-acceptance.mjs | tee /tmp/agent-bridge-command-delivery-acceptance.json

mongo_result="$(docker compose exec -T mongo mongosh --quiet kairoseth_command_center --eval "
  const command=db.agent_bridge_commands.findOne({tenantId:'$WORKSPACE_ID',correlationId:'phase7-2a-real-read'});
  print(JSON.stringify({
    exists:Boolean(command),
    state:command && command.state,
    deliveryAttempt:command && command.deliveryAttempt,
    ackStatus:command && command.acknowledgement && command.acknowledgement.status,
    hasApprovalToken:command && Object.prototype.hasOwnProperty.call(command,'approvalToken')
  }));
")"
printf '%s' "$mongo_result" | node -e '
let s="";
process.stdin.on("data",d=>s+=d).on("end",()=>{
  const data=JSON.parse(s);
  const expected={exists:true,state:"completed",deliveryAttempt:1,ackStatus:"executed",hasApprovalToken:false};
  if (JSON.stringify(data)!==JSON.stringify(expected)) {
    console.error(data);
    process.exit(1);
  }
});
'
