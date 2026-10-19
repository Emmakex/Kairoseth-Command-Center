import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
const writeToolId = connectorRuntimeToolId('woocommerce', 'store', 'orders.update-status');
const readCorrelationId = 'phase7-2b-real-read';
const writeCorrelationId = 'phase7-2b-real-write';
const connectorCalls = [];
const recoverableErrors = [];
const stateDir = await mkdtemp(join(tmpdir(), 'kab-platform-7-2b-'));

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

async function waitForAuditDrain() {
  const outboxPath = join(stateDir, 'audit', 'outbox.json');
  await waitFor(async () => {
    try {
      const parsed = JSON.parse(await readFile(outboxPath, 'utf8'));
      return parsed?.version === 'kab.audit-outbox.v1' && parsed.events?.length === 0;
    } catch {
      return false;
    }
  }, 'Agent Bridge audit outbox did not drain to Platform.');
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
    const body = String(init.body ?? '');
    const expectedBasic = Buffer.from('ck_phase7_2b:cs_phase7_2b', 'utf8').toString('base64');
    assert.equal(headers.get('authorization'), `Basic ${expectedBasic}`);
    connectorCalls.push({ method, path: url.pathname, query: url.search, body });

    if (method === 'GET' && url.pathname === '/wp-json/wc/v3/orders') {
      assert.equal(url.searchParams.get('per_page'), '1');
      return json([{ id: 42, status: 'processing' }]);
    }
    if (method === 'PUT' && url.pathname === '/wp-json/wc/v3/orders/42') {
      assert.deepEqual(JSON.parse(body), { status: 'completed' });
      return json({ id: 42, status: 'completed' });
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
      if (fieldId === 'consumer_key') return 'ck_phase7_2b';
      if (fieldId === 'consumer_secret') return 'cs_phase7_2b';
      return null;
    },
  },
};

const runtime = new ProductionRuntime({
  platformBaseUrl: baseUrl,
  stateDir,
  runtimeVersion: '0.1.0-phase7-2b',
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
  assert.equal(binding.trustedApprovalKeys.length, 1);
  assert.ok(binding.trustedApprovalKeys[0]?.keyId);
  assert.match(binding.trustedApprovalKeys[0]?.publicKeyPem ?? '', /BEGIN PUBLIC KEY/);
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
    return installation?.connectivity === 'connected' && installation?.tools?.total >= 2;
  }, 'Real Agent Bridge runtime did not publish the WooCommerce READ/WRITE inventory.');
  console.log('E2E_STAGE=snapshot:ok');

  console.log('E2E_STAGE=read:start');
  const queuedRead = await operatorRequest(
    `/v1/products/agent-bridge/installations/${encodeURIComponent(binding.installationId)}/commands`,
    {
      method: 'POST',
      body: JSON.stringify({
        toolId: readToolId,
        input: { perPage: 1 },
        correlationId: readCorrelationId,
      }),
    },
  );
  assert.equal(queuedRead.response.status, 201, JSON.stringify(queuedRead.body));
  const readCommandId = queuedRead.body?.command?.commandId;
  assert.ok(readCommandId);

  const completedRead = await waitFor(async () => {
    const result = await operatorRequest(
      `/v1/products/agent-bridge/commands/${encodeURIComponent(readCommandId)}`,
    );
    return result.response.ok && result.body?.command?.state === 'completed'
      ? result.body.command
      : false;
  }, 'Real Agent Bridge runtime did not execute the queued READ command.');
  assert.equal(completedRead.deliveryAttempt, 1);
  assert.equal(completedRead.acknowledgement?.status, 'executed');
  assert.equal(completedRead.acknowledgement?.correlationId, readCorrelationId);
  assert.match(JSON.stringify(completedRead.acknowledgement?.output), /"id":42/);
  console.log('E2E_STAGE=read:ok');

  console.log('E2E_STAGE=write:start');
  const queuedWrite = await operatorRequest(
    `/v1/products/agent-bridge/installations/${encodeURIComponent(binding.installationId)}/approved-commands`,
    {
      method: 'POST',
      body: JSON.stringify({
        toolId: writeToolId,
        input: { orderId: 42, status: 'completed' },
        correlationId: writeCorrelationId,
        ttlSeconds: 120,
      }),
    },
  );
  assert.equal(queuedWrite.response.status, 201, JSON.stringify(queuedWrite.body));
  assert.equal(queuedWrite.body?.approval, 'signed');
  assert.equal(queuedWrite.body?.command?.toolId, writeToolId);
  assert.equal(
    Object.prototype.hasOwnProperty.call(queuedWrite.body?.command ?? {}, 'approvalToken'),
    false,
    'Operator projection must never expose the signed approval token.',
  );
  const writeCommandId = queuedWrite.body?.command?.commandId;
  assert.ok(writeCommandId);

  const completedWrite = await waitFor(async () => {
    const result = await operatorRequest(
      `/v1/products/agent-bridge/commands/${encodeURIComponent(writeCommandId)}`,
    );
    return result.response.ok && result.body?.command?.state === 'completed'
      ? result.body.command
      : false;
  }, 'Real Agent Bridge runtime did not execute the signed WRITE command.');
  assert.equal(completedWrite.deliveryAttempt, 1);
  assert.equal(completedWrite.acknowledgement?.status, 'executed');
  assert.equal(completedWrite.acknowledgement?.correlationId, writeCorrelationId);
  assert.match(JSON.stringify(completedWrite.acknowledgement?.output), /"status":"completed"/);
  console.log('E2E_STAGE=write:ok');

  await waitForAuditDrain();
  assert.deepEqual(
    connectorCalls.map((call) => [call.method, call.path]),
    [
      ['GET', '/wp-json/wc/v3/orders'],
      ['PUT', '/wp-json/wc/v3/orders/42'],
    ],
  );

  console.log(JSON.stringify({
    version: 'phase7.2b-command-delivery-evidence.v1',
    installationId: binding.installationId,
    bridgeInstanceId: binding.bridgeInstanceId,
    readCommandId,
    writeCommandId,
    readToolId,
    writeToolId,
    readStatus: completedRead.acknowledgement.status,
    writeStatus: completedWrite.acknowledgement.status,
    readDeliveryAttempt: completedRead.deliveryAttempt,
    writeDeliveryAttempt: completedWrite.deliveryAttempt,
    trustedApprovalKeyCount: binding.trustedApprovalKeys.length,
    connectorCalls: connectorCalls.length,
    recoverableSources: [...new Set(recoverableErrors.map((item) => item.source))].sort(),
  }));
} finally {
  controller?.abort();
  if (runPromise) await runPromise;
  await rm(stateDir, { recursive: true, force: true });
}
