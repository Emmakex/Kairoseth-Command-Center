import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL, pathToFileURL } from 'node:url';

const bridgeRoot = process.env.AGENT_BRIDGE_SOURCE;
assert.ok(bridgeRoot, 'AGENT_BRIDGE_SOURCE is required');
assert.ok(process.env.OPERATOR_ACCESS_TOKEN, 'OPERATOR_ACCESS_TOKEN is required');
assert.ok(process.env.WORKSPACE_ID, 'WORKSPACE_ID is required');
assert.ok(process.env.ENROLLMENT_TOKEN, 'ENROLLMENT_TOKEN is required');

const bridge = await import(pathToFileURL(join(bridgeRoot, 'dist/src/index.js')).href);
const {
  ProductionRuntime,
  connectorRuntimeToolId,
  createWooCommerceConnector,
} = bridge;

const baseUrl = process.env.PLATFORM_BASE_URL ?? 'http://127.0.0.1:4000';
const readToolId = connectorRuntimeToolId('woocommerce', 'store', 'orders.list');
const correlationId = 'phase7-2a-real-read';
const connectorCalls = [];
const recoverableErrors = [];
const stateDir = await mkdtemp(join(tmpdir(), 'kab-platform-7-2a-'));

function json(payload, status = 200) {
  return new globalThis.Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function operatorRequest(path, init = {}) {
  const response = await globalThis.fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.OPERATOR_ACCESS_TOKEN}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

async function waitFor(check, message, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(250);
  }
  throw new Error(message);
}

async function bootstrapReadOnlyApprovalTrust(binding) {
  assert.deepEqual(
    binding.trustedApprovalKeys,
    [],
    'Phase 7.2A must not silently enable Platform-signed WRITE approvals.',
  );

  const { publicKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const securityDir = join(stateDir, 'security');
  await mkdir(securityDir, { recursive: true, mode: 0o700 });
  await writeFile(
    join(securityDir, 'approval-keyset.json'),
    `${JSON.stringify(
      {
        version: 'kab.approval-keyset-state.v1',
        tenantId: binding.tenantId,
        installationId: binding.installationId,
        bridgeInstanceId: binding.bridgeInstanceId,
        generation: 0,
        keys: [
          {
            keyId: 'phase7-2a-read-only-bootstrap',
            publicKeyPem,
          },
        ],
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
}

const connectorHttp = {
  async resolveHost(hostname) {
    assert.equal(hostname, 'shop.example.com');
    return ['93.184.216.34'];
  },
  async fetch(input, init) {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const headers = new globalThis.Headers(init.headers);
    const expectedBasic = Buffer.from('ck_phase7_2a:cs_phase7_2a', 'utf8').toString('base64');
    assert.equal(headers.get('authorization'), `Basic ${expectedBasic}`);
    connectorCalls.push({ method, path: url.pathname, query: url.search });

    if (method === 'GET' && url.pathname === '/wp-json/wc/v3/orders') {
      assert.equal(url.searchParams.get('per_page'), '1');
      return json([{ id: 42, status: 'processing' }]);
    }
    return json({ code: 'unexpected_woocommerce_endpoint' }, 404);
  },
};

const connector = {
  instanceId: 'store',
  connector: createWooCommerceConnector(
    { allowedOrigins: ['https://shop.example.com'] },
    connectorHttp,
  ),
  config: { baseUrl: 'https://shop.example.com' },
  secrets: {
    async getSecret(requirementId, fieldId) {
      if (requirementId !== 'woocommerce_api') return null;
      if (fieldId === 'consumer_key') return 'ck_phase7_2a';
      if (fieldId === 'consumer_secret') return 'cs_phase7_2a';
      return null;
    },
  },
};

const runtime = new ProductionRuntime({
  platformBaseUrl: baseUrl,
  stateDir,
  runtimeVersion: '0.1.0-phase7-2a',
  deploymentMode: 'local',
  connectorInstances: [connector],
  allowInsecureHttp: true,
  onRecoverableError(source, retryDelayMs) {
    recoverableErrors.push({ source, retryDelayMs });
  },
});

let controller;
let runPromise;
try {
  console.log('E2E_STAGE=enrollment:start');
  const binding = await runtime.enroll(process.env.ENROLLMENT_TOKEN);
  assert.equal(binding.tenantId, process.env.WORKSPACE_ID);
  assert.ok(binding.installationId);
  assert.ok(binding.bridgeInstanceId);
  await bootstrapReadOnlyApprovalTrust(binding);
  console.log('E2E_STAGE=enrollment:ok');

  controller = new globalThis.AbortController();
  runPromise = runtime.run(controller.signal);

  console.log('E2E_STAGE=snapshot:start');
  await waitFor(async () => {
    const { response, body } = await operatorRequest('/v1/products/agent-bridge/runtime-observability');
    if (!response.ok || !body?.summary?.installations) return false;
    const installation = body.summary.installations.find(
      (row) => row.installationId === binding.installationId,
    );
    return installation?.connectivity === 'connected' && installation?.tools?.total >= 1;
  }, 'Real Agent Bridge runtime did not publish a usable snapshot.');
  console.log('E2E_STAGE=snapshot:ok');

  console.log('E2E_STAGE=queue:start');
  const queued = await operatorRequest(
    `/v1/products/agent-bridge/installations/${encodeURIComponent(binding.installationId)}/commands`,
    {
      method: 'POST',
      body: JSON.stringify({
        toolId: readToolId,
        input: { perPage: 1 },
        correlationId,
      }),
    },
  );
  assert.equal(queued.response.status, 201, JSON.stringify(queued.body));
  assert.equal(queued.body?.version, 'kcc.agent-bridge-command.v1');
  assert.equal(queued.body?.command?.state, 'queued');
  assert.equal(queued.body?.command?.toolId, readToolId);
  const commandId = queued.body.command.commandId;
  assert.ok(commandId);
  console.log('E2E_STAGE=queue:ok');

  console.log('E2E_STAGE=execution:start');
  const completed = await waitFor(async () => {
    const result = await operatorRequest(
      `/v1/products/agent-bridge/commands/${encodeURIComponent(commandId)}`,
    );
    if (!result.response.ok) return false;
    return result.body?.command?.state === 'completed' ? result.body.command : false;
  }, 'Real Agent Bridge runtime did not execute and acknowledge the queued READ command.');

  assert.equal(completed.deliveryAttempt, 1);
  assert.equal(completed.acknowledgement?.status, 'executed');
  assert.equal(completed.acknowledgement?.correlationId, correlationId);
  assert.match(JSON.stringify(completed.acknowledgement?.output), /"id":42/);
  assert.deepEqual(connectorCalls.map((call) => [call.method, call.path]), [
    ['GET', '/wp-json/wc/v3/orders'],
  ]);
  console.log('E2E_STAGE=execution:ok');

  console.log(JSON.stringify({
    version: 'phase7.2a-command-delivery-evidence.v1',
    installationId: binding.installationId,
    bridgeInstanceId: binding.bridgeInstanceId,
    commandId,
    toolId: readToolId,
    commandState: completed.state,
    acknowledgementStatus: completed.acknowledgement.status,
    deliveryAttempt: completed.deliveryAttempt,
    connectorCalls: connectorCalls.length,
    approvalTrustMode: 'acceptance-read-only-bootstrap',
    recoverableSources: [...new Set(recoverableErrors.map((item) => item.source))].sort(),
  }));
} finally {
  controller?.abort();
  if (runPromise) await runPromise;
  await rm(stateDir, { recursive: true, force: true });
}
