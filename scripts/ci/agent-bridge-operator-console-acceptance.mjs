import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { mkdtemp, rm } from 'node:fs/promises';
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

const platformBaseUrl = process.env.PLATFORM_BASE_URL ?? 'http://127.0.0.1:4000';
const webBaseUrl = process.env.PLATFORM_WEB_BASE_URL ?? 'http://127.0.0.1:3000';
const readToolId = connectorRuntimeToolId('woocommerce', 'console', 'orders.list');
const writeToolId = connectorRuntimeToolId('woocommerce', 'console', 'orders.update-status');
const stateDir = await mkdtemp(join(tmpdir(), 'kab-operator-console-'));
const secretMarker = 'console-secret-must-never-render';
const connectorCalls = [];

function json(payload, status = 200) {
  return new globalThis.Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function operatorRequest(path, init = {}) {
  const response = await globalThis.fetch(`${platformBaseUrl}${path}`, {
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
    const expectedBasic = Buffer.from('ck_console:cs_console', 'utf8').toString('base64');
    assert.equal(headers.get('authorization'), `Basic ${expectedBasic}`);
    connectorCalls.push({ method, path: url.pathname, query: url.search, body });

    if (method === 'GET' && url.pathname === '/wp-json/wc/v3/orders') {
      assert.equal(url.searchParams.get('per_page'), '1');
      return json([{ id: 42, status: 'processing', accessToken: secretMarker }]);
    }
    if (method === 'PUT' && url.pathname === '/wp-json/wc/v3/orders/42') {
      const payload = JSON.parse(body);
      assert.equal(payload.status, 'completed');
      return json({ id: 42, status: 'completed', password: secretMarker });
    }
    return json({ code: 'unexpected_woocommerce_endpoint' }, 404);
  },
};

const connector = {
  instanceId: 'console',
  connector: createWooCommerceConnector(
    { allowedOrigins: ['https://shop.example.com'] },
    connectorHttp,
  ),
  config: { baseUrl: 'https://shop.example.com' },
  secrets: {
    async getSecret(requirementId, fieldId) {
      if (requirementId !== 'woocommerce_api') return null;
      if (fieldId === 'consumer_key') return 'ck_console';
      if (fieldId === 'consumer_secret') return 'cs_console';
      return null;
    },
  },
};

const runtime = new ProductionRuntime({
  platformBaseUrl,
  stateDir,
  runtimeVersion: '0.1.0-operator-console',
  deploymentMode: 'local',
  connectorInstances: [connector],
  allowInsecureHttp: true,
});

let controller;
let runPromise;

async function startRuntime() {
  controller = new globalThis.AbortController();
  runPromise = runtime.run(controller.signal);
}

async function stopRuntime() {
  if (!controller) return;
  controller.abort();
  if (runPromise) await runPromise;
  controller = undefined;
  runPromise = undefined;
}

async function executeThroughWeb(installationId, toolId, input) {
  const form = new globalThis.FormData();
  form.set('locale', 'es');
  form.set('installationId', installationId);
  form.set('executionToolId', toolId);
  form.set('input', JSON.stringify(input));

  const response = await globalThis.fetch(`${webBaseUrl}/api/agent-bridge/execute`, {
    method: 'POST',
    headers: { cookie: `kcc_session=${process.env.OPERATOR_ACCESS_TOKEN}` },
    body: form,
    redirect: 'manual',
  });
  assert.equal(response.status, 303, `Unexpected web execution status ${response.status}`);
  const location = response.headers.get('location');
  assert.ok(location, 'Execution proxy did not return a redirect location.');
  const target = new URL(location, webBaseUrl);
  assert.equal(target.pathname, '/es/ia/agent-bridge');
  assert.equal(target.searchParams.get('execution'), 'queued', target.toString());
  const commandId = target.searchParams.get('command');
  assert.ok(commandId, 'Execution proxy did not expose the queued command ID.');
  return commandId;
}

async function waitForCompleted(commandId) {
  return waitFor(async () => {
    const result = await operatorRequest(
      `/v1/products/agent-bridge/commands/${encodeURIComponent(commandId)}`,
    );
    return result.response.ok && result.body?.command?.state === 'completed'
      ? result.body.command
      : false;
  }, `Agent Bridge runtime did not complete command ${commandId}.`);
}

try {
  console.log('CONSOLE_STAGE=enrollment:start');
  const binding = await runtime.enroll(process.env.ENROLLMENT_TOKEN);
  assert.equal(binding.tenantId, process.env.WORKSPACE_ID);
  assert.ok(binding.installationId);
  await startRuntime();

  console.log('CONSOLE_STAGE=snapshot:start');
  await waitFor(async () => {
    const { response, body } = await operatorRequest('/v1/products/agent-bridge/runtime-observability');
    if (!response.ok || !body?.summary?.installations) return false;
    const installation = body.summary.installations.find(
      (row) => row.installationId === binding.installationId,
    );
    return installation?.connectivity === 'connected' && installation?.tools?.total >= 2;
  }, 'Real Agent Bridge runtime did not publish operator-console tools.');

  const inventoryResult = await operatorRequest(
    `/v1/products/agent-bridge/installations/${encodeURIComponent(binding.installationId)}/tools`,
  );
  assert.equal(inventoryResult.response.status, 200, JSON.stringify(inventoryResult.body));
  assert.equal(inventoryResult.body?.version, 'kcc.agent-bridge-tool-inventory.v1');
  assert.equal(inventoryResult.body?.inventory?.installationId, binding.installationId);
  const readTool = inventoryResult.body?.inventory?.tools?.find(
    (tool) => tool.executionToolId === readToolId,
  );
  const writeTool = inventoryResult.body?.inventory?.tools?.find(
    (tool) => tool.executionToolId === writeToolId,
  );
  assert.equal(readTool?.risk, 'READ');
  assert.equal(readTool?.availability, 'available');
  assert.equal(writeTool?.risk, 'WRITE');
  assert.equal(writeTool?.availability, 'available');
  const inventoryJson = JSON.stringify(inventoryResult.body);
  for (const forbidden of [
    'approvalToken',
    'sessionId',
    'publicKeyPem',
    'actionFingerprint',
    'connectorInstanceId',
  ]) {
    assert.equal(inventoryJson.includes(forbidden), false, `Inventory exposed ${forbidden}.`);
  }
  console.log('CONSOLE_STAGE=snapshot:ok');

  console.log('CONSOLE_STAGE=read:start');
  const readCommandId = await executeThroughWeb(binding.installationId, readToolId, {
    perPage: 1,
  });
  const completedRead = await waitForCompleted(readCommandId);
  assert.equal(completedRead.acknowledgement?.status, 'executed');
  assert.match(JSON.stringify(completedRead.acknowledgement?.output), /"id":42/);
  const runtimeSessionId = completedRead.acknowledgement?.sessionId;
  assert.ok(runtimeSessionId);
  console.log('CONSOLE_STAGE=read:ok');

  console.log('CONSOLE_STAGE=write:start');
  const writeCommandId = await executeThroughWeb(binding.installationId, writeToolId, {
    orderId: 42,
    status: 'completed',
  });
  const completedWrite = await waitForCompleted(writeCommandId);
  assert.equal(completedWrite.acknowledgement?.status, 'executed');
  assert.match(JSON.stringify(completedWrite.acknowledgement?.output), /"status":"completed"/);

  const writeDocumentEvidence = await operatorRequest(
    `/v1/products/agent-bridge/commands/${encodeURIComponent(writeCommandId)}`,
  );
  assert.equal(writeDocumentEvidence.response.status, 200);
  assert.equal(
    Object.prototype.hasOwnProperty.call(writeDocumentEvidence.body?.command ?? {}, 'approvalToken'),
    false,
    'Operator command projection exposed an approval token.',
  );
  console.log('CONSOLE_STAGE=write:ok');

  const pageResponse = await globalThis.fetch(
    `${webBaseUrl}/es/ia/agent-bridge?command=${encodeURIComponent(writeCommandId)}`,
    {
      headers: { cookie: `kcc_session=${process.env.OPERATOR_ACCESS_TOKEN}` },
    },
  );
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.text();
  assert.match(page, /Agent Bridge/);
  assert.match(page, /Completado|Ejecutado/);
  assert.equal(page.includes(secretMarker), false, 'Console rendered a secret-looking runtime value.');
  assert.equal(page.includes(runtimeSessionId), false, 'Console rendered the runtime session ID.');
  assert.equal(page.includes('approvalToken'), false, 'Console rendered approval-token material.');
  assert.equal(page.includes('actionFingerprint'), false, 'Console rendered action-fingerprint material.');
  console.log('CONSOLE_STAGE=projection:ok');

  assert.deepEqual(
    connectorCalls.map((call) => [call.method, call.path]),
    [
      ['GET', '/wp-json/wc/v3/orders'],
      ['PUT', '/wp-json/wc/v3/orders/42'],
    ],
  );

  console.log(
    JSON.stringify({
      version: 'phase7.operator-console-acceptance.v1',
      installationId: binding.installationId,
      readCommandId,
      writeCommandId,
      readRisk: readTool.risk,
      writeRisk: writeTool.risk,
      commandStatuses: [
        completedRead.acknowledgement?.status,
        completedWrite.acknowledgement?.status,
      ],
      renderedSecret: page.includes(secretMarker),
      renderedRuntimeSession: page.includes(runtimeSessionId),
    }),
  );
} finally {
  await stopRuntime();
  await rm(stateDir, { recursive: true, force: true });
}
