#!/usr/bin/env bash
set -euo pipefail

bridge_ref="f9bf4d550d60b4b2941e8e2be02b1baef84987e0"
bridge_source="${RUNNER_TEMP:-/tmp}/kairoseth-agent-bridge-rotation-${GITHUB_RUN_ID:-local}"
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
export KCC_LOCAL_ADMIN_EMAIL="agent-bridge-rotation-ci@kcc.local"
export KCC_LOCAL_ADMIN_PASSWORD="agent-bridge-rotation-${GITHUB_RUN_ID:-local}-valid"
export KCC_LOCAL_AUTH_SECRET="$(openssl rand -hex 32)"
export KCC_INTEGRATION_SECRET_KEY="$(openssl rand -hex 32)"

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

enrollment_response="$(curl --fail --silent \
  -X POST "$PLATFORM_BASE_URL/v1/products/agent-bridge/enrollment-tokens" \
  -H "authorization: Bearer $OPERATOR_ACCESS_TOKEN")"
export ENROLLMENT_TOKEN="$(printf '%s' "$enrollment_response" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);if(d.version!=="kcc.agent-bridge-enrollment-token.v1")process.exit(1);process.stdout.write(d.token)})')"

node scripts/ci/agent-bridge-approval-key-rotation-acceptance.mjs \
  | tee /tmp/agent-bridge-approval-key-rotation-acceptance.json

mongo_result="$(docker compose exec -T mongo mongosh --quiet kairoseth_command_center --eval "
  const signer=db.agent_bridge_approval_signers.findOne({tenantId:'$WORKSPACE_ID'});
  const syncStates=db.agent_bridge_approval_key_sync.find({tenantId:'$WORKSPACE_ID'}).toArray();
  const secrets=db.integration_secrets.find({'scope.workspaceId':'$WORKSPACE_ID'}).toArray();
  print(JSON.stringify({
    signer:{
      exists:Boolean(signer),
      generation:signer && signer.generation,
      phase:signer && signer.rotationPhase,
      hasPreviousKey:signer && Object.prototype.hasOwnProperty.call(signer,'previousKeyId'),
      hasPreviousSecret:signer && Object.prototype.hasOwnProperty.call(signer,'previousPrivateKeySecretRef'),
      hasCurrentSecretRef:signer && typeof signer.privateKeySecretRef==='string'
    },
    sync:{
      count:syncStates.length,
      generations:syncStates.map(s=>s.currentGeneration).sort(),
      installationIds:syncStates.map(s=>s.installationId).sort()
    },
    secrets:{
      count:secrets.length,
      allEncrypted:secrets.every(s=>s.algorithm==='aes-256-gcm' && typeof s.ciphertext==='string' && typeof s.authTag==='string'),
      containsPlainPrivatePem:JSON.stringify(secrets).includes('BEGIN PRIVATE KEY')
    }
  }));
")"
printf '%s' "$mongo_result" | node -e '
let s="";
process.stdin.on("data",d=>s+=d).on("end",()=>{
  const data=JSON.parse(s);
  const fail=(message)=>{console.error(message, JSON.stringify(data));process.exit(1)};
  if (!data.signer.exists || data.signer.generation!==2 || data.signer.phase!=="stable") fail("Signer did not reach stable generation 2");
  if (data.signer.hasPreviousKey || data.signer.hasPreviousSecret || !data.signer.hasCurrentSecretRef) fail("Retired signer material still referenced");
  if (data.sync.count!==2 || data.sync.generations.some(generation=>generation!==2)) fail("Runtime generation acknowledgements did not converge");
  if (data.secrets.count!==1 || !data.secrets.allEncrypted || data.secrets.containsPlainPrivatePem) fail("Approval private-key secret boundary mismatch");
});
'
