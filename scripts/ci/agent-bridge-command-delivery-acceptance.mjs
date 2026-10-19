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
const rotatedWriteCorrelationId = 'phase7-rotation-real-write';
const connectorCalls = [];
const recoverableErrors = [];
const stateDir = await mkdtemp(join(tmpdir(), 'kab-platform-rotation-'));
const approvalKeyStatePath = join(stateDir, 'security', 'approval-keyset.json');

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

async function readApprovalKeyState() {
  try {
    return JSON.parse(await readFile(approvalKeyStatePath, 'utf8'));
  } catch {
    return null;
  }
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
      const payload = JSON.parse(body);
      assert.ok(['completed', 'processing'].includes(payload.status));
      return json({ id: 42, status: payload.status });
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

function createRuntime() {
  return new ProductionRuntime({
    platformBaseUrl: baseUrl,
    stateDir,
    runtimeVersion: '0.1.0-phase7-rotation',
    deploymentMode: 'local',
    connectorInstances: [connector],
    allowInsecureHttp: true,
    onRecoverableError(source, retryDelayMs) {
      recoverableErrors.push({ source, retryDelayMs });
    },
  });
}

let runtime = createRuntime();
let controller;
let runPromise;

async function startRuntime() {
  assert.equal(controller, undefined, 'Runtime is already started.');
  controller = new globalThis.AbortController();
  runPromise = runtime.run(controller.signal);
}

async function stopRuntime() {
  if (!controller) return;
  controller.abort();
  if (runPromise) await runPromise;
  controller = undefined;
  runPromise = undefined;
  runtime = createRuntime();
}

try {
  console.log('E2E_STAGE=enrollment:start');
  const binding = await runtime.enroll(process.env.ENROLLMENT_TOKEN);
  assert.equal(binding.tenantId, process.env.WORKSPACE_ID);
  assert.ok(binding.installationId);
  assert.ok(binding.bridgeInstanceId);
  assert.equal(binding.trustedApprovalKeys.length, 1);
  assert.ok(binding.trustedApprovalKeys[0]?.keyId);
  assert.match(binding.trustedApprovalKeys[0]?.publicKeyPem ?? '', /BEGIN PUBLIC KEY/);
  const initialApprovalKeyId = binding.trustedApprovalKeys[0].keyId;
  console.log('E2E_STAGE=enrollment:ok');

  await startRuntime();

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

  console.log('E2E_STAGE=rotation:start');
  const rotation = await operatorRequest('/v1/products/agent-bridge/approval-keys/rotate', {
    method: 'POST',
  });
  assert.equal(rotation.response.status, 202, JSON.stringify(rotation.body));
  assert.equal(rotation.body?.status?.generation, 1);
  assert.equal(rotation.body?.status?.phase, 'overlap');
  assert.equal(rotation.body?.status?.signingKeyId, initialApprovalKeyId);
  assert.equal(rotation.body?.status?.trustedKeyIds?.length, 2);
  const rotatedApprovalKeyId = rotation.body.status.trustedKeyIds.find(
    (keyId) => keyId !== initialApprovalKeyId,
  );
  assert.ok(rotatedApprovalKeyId);

  await stopRuntime();
  await startRuntime();
  const overlapState = await waitFor(async () => {
    const state = await readApprovalKeyState();
    return state?.generation === 1 && state?.keys?.length === 2 ? state : false;
  }, 'Agent Bridge runtime did not apply approval-key overlap generation 1.');
  assert.deepEqual(
    new Set(overlapState.keys.map((key) => key.keyId)),
    new Set([initialApprovalKeyId, rotatedApprovalKeyId]),
  );

  await stopRuntime();
  await startRuntime();
  const rotatedState = await waitFor(async () => {
    const state = await readApprovalKeyState();
    return state?.generation === 2 && state?.keys?.length === 1 ? state : false;
  }, 'Agent Bridge runtime did not promote the new approval key to generation 2.');
  assert.equal(rotatedState.keys[0]?.keyId, rotatedApprovalKeyId);
  console.log('E2E_STAGE=rotation:keyset-ok');

  console.log('E2E_STAGE=rotated-write:start');
  const queuedRotatedWrite = await operatorRequest(
    `/v1/products/agent-bridge/installations/${encodeURIComponent(binding.installationId)}/approved-commands`,
    {
      method: 'POST',
      body: JSON.stringify({
        toolId: writeToolId,
        input: { orderId: 42, status: 'processing' },
        correlationId: rotatedWriteCorrelationId,
        ttlSeconds: 120,
      }),
    },
  );
  assert.equal(
    queuedRotatedWrite.response.status,
    201,
    JSON.stringify(queuedRotatedWrite.body),
  );
  assert.equal(queuedRotatedWrite.body?.approval, 'signed');
  assert.equal(
    Object.prototype.hasOwnProperty.call(queuedRotatedWrite.body?.command ?? {}, 'approvalToken'),
    false,
  );
  const rotatedWriteCommandId = queuedRotatedWrite.body?.command?.commandId;
  assert.ok(rotatedWriteCommandId);

  const completedRotatedWrite = await waitFor(async () => {
    const result = await operatorRequest(
      `/v1/products/agent-bridge/commands/${encodeURIComponent(rotatedWriteCommandId)}`,
    );
    return result.response.ok && result.body?.command?.state === 'completed'
      ? result.body.command
      : false;
  }, 'Real Agent Bridge runtime did not execute WRITE signed by the rotated key.');
  assert.equal(completedRotatedWrite.deliveryAttempt, 1);
  assert.equal(completedRotatedWrite.acknowledgement?.status, 'executed');
  assert.equal(completedRotatedWrite.acknowledgement?.correlationId, rotatedWriteCorrelationId);
  assert.match(
    JSON.stringify(completedRotatedWrite.acknowledgement?.output),
    /"status":"processing"/,
  );
  await waitForAuditDrain();
  console.log('E2E_STAGE=rotated-write:ok');

  await stopRuntime();
  await startRuntime();
  const stableRotation = await waitFor(async () => {
    const result = await operatorRequest('/v1/products/agent-bridge/approval-keys/rotation');
    return result.response.ok &&
      result.body?.status?.generation === 2 &&
      result.body?.status?.phase === 'stable'
      ? result.body.status
      : false;
  }, 'Platform did not retire the old approval key after generation 2 acknowledgement.');
  assert.equal(stableRotation.signingKeyId, rotatedApprovalKeyId);
  assert.deepEqual(stableRotation.trustedKeyIds, [rotatedApprovalKeyId]);
  console.log('E2E_STAGE=rotation:stable');

  assert.deepEqual(
    connectorCalls.map((call) => [call.method, call.path]),
    [
      ['GET', '/wp-json/wc/v3/orders'],
      ['PUT', '/wp-json/wc/v3/orders/42'],
      ['PUT', '/wp-json/wc/v3/orders/42'],
    ],
  );

  console.log(JSON.stringify({
    version: 'phase7.approval-key-rotation-evidence.v1',
    installationId: binding.installationId,
    bridgeInstanceId: binding.bridgeInstanceId,
    readCommandId,
    writeCommandId,
    rotatedWriteCommandId,
    readToolId,
    writeToolId,
    readStatus: completedRead.acknowledgement.status,
    writeStatus: completedWrite.acknowledgement.status,
    rotatedWriteStatus: completedRotatedWrite.acknowledgement.status,
    readDeliveryAttempt: completedRead.deliveryAttempt,
    writeDeliveryAttempt: completedWrite.deliveryAttempt,
    rotatedWriteDeliveryAttempt: completedRotatedWrite.deliveryAttempt,
    initialApprovalKeyId,
    rotatedApprovalKeyId,
    approvalKeyGeneration: stableRotation.generation,
    approvalKeyPhase: stableRotation.phase,
    connectorCalls: connectorCalls.length,
    recoverableSources: [...new Set(recoverableErrors.map((item) => item.source))].sort(),
  }));
} finally {
  await stopRuntime();
  await rm(stateDir, { recursive: true, force: true });
}
