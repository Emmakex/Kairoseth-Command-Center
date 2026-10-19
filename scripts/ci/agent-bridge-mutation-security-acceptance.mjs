import assert from 'node:assert/strict';
import process from 'node:process';

import {
  BridgeIdentityManager,
  InMemoryBridgeIdentityStore,
} from '../../agent-bridge-source/dist/src/identity/installation-identity.js';
import { InstallationEnrollmentClient } from '../../agent-bridge-source/dist/src/control-channel/enrollment.js';
import { HttpEnrollmentTransport } from '../../agent-bridge-source/dist/src/control-channel/http-enrollment-transport.js';
import { ControlSessionClient } from '../../agent-bridge-source/dist/src/control-channel/session.js';
import { HttpSessionTransport } from '../../agent-bridge-source/dist/src/control-channel/http-session-transport.js';
import { HttpRuntimeSnapshotTransport } from '../../agent-bridge-source/dist/src/control-channel/http-runtime-snapshot-transport.js';
import { HttpCommandTransport } from '../../agent-bridge-source/dist/src/control-channel/http-command-transport.js';
import { HttpApprovalKeySetTransport } from '../../agent-bridge-source/dist/src/control-channel/http-approval-key-set-transport.js';
import { HttpAuditDeliveryTransport } from '../../agent-bridge-source/dist/src/control-channel/http-audit-delivery-transport.js';
import { SignedApprovalVerifier } from '../../agent-bridge-source/dist/src/security/approval.js';

assert.ok(process.env.OPERATOR_ACCESS_TOKEN, 'OPERATOR_ACCESS_TOKEN is required');
assert.ok(process.env.WORKSPACE_ID, 'WORKSPACE_ID is required');
assert.ok(process.env.ENROLLMENT_TOKEN, 'ENROLLMENT_TOKEN is required');

const baseUrl = process.env.PLATFORM_BASE_URL ?? 'http://127.0.0.1:4000';
const runtimeVersion = '0.1.0-phase7-2b';
const identityManager = new BridgeIdentityManager(new InMemoryBridgeIdentityStore());

const enrollmentClient = new InstallationEnrollmentClient(
  identityManager,
  new HttpEnrollmentTransport({ baseUrl, allowInsecureHttp: true }),
  { runtimeVersion, deploymentMode: 'local', capabilities: ['files'] },
);
const binding = await enrollmentClient.enroll(process.env.ENROLLMENT_TOKEN);
assert.equal(binding.version, 'kab.installation-binding.v1');
assert.equal(binding.tenantId, process.env.WORKSPACE_ID);
assert.equal(binding.trustedApprovalKeys.length, 1);
const trustedKey = binding.trustedApprovalKeys[0];
assert.ok(trustedKey?.keyId);
assert.match(trustedKey?.publicKeyPem ?? '', /BEGIN PUBLIC KEY/);

const sessionClient = new ControlSessionClient(
  identityManager,
  new HttpSessionTransport({ baseUrl, allowInsecureHttp: true }),
  { runtimeVersion, capabilities: ['files'] },
);
const controlSession = await sessionClient.open(binding);
await controlSession.heartbeat('ready');

const snapshot = {
  version: 'kab.runtime-snapshot.v1',
  snapshotId: `ci-mutation-snapshot-${process.env.GITHUB_RUN_ID ?? 'local'}`,
  generatedAt: new Date().toISOString(),
  connectors: [{
    connectorId: 'files',
    connectorInstanceId: 'ci-files',
    name: 'Files',
    version: '1.0.0',
    description: 'Mutation security acceptance connector',
    capabilities: ['files'],
    tools: [
      {
        toolId: 'write-file',
        runtimeToolId: 'files.ci-files.write-file',
        name: 'Write file',
        description: 'Write an allowed file',
        risk: 'WRITE',
      },
      {
        toolId: 'delete-file',
        runtimeToolId: 'files.ci-files.delete-file',
        name: 'Delete file',
        description: 'Delete an allowed file',
        risk: 'CRITICAL',
      },
    ],
  }],
  health: [{
    connectorId: 'files',
    connectorInstanceId: 'ci-files',
    status: 'healthy',
    checkedAt: new Date().toISOString(),
    tools: [
      {
        toolId: 'write-file',
        runtimeToolId: 'files.ci-files.write-file',
        availability: 'available',
      },
      {
        toolId: 'delete-file',
        runtimeToolId: 'files.ci-files.delete-file',
        availability: 'available',
      },
    ],
  }],
};
const snapshotTransport = new HttpRuntimeSnapshotTransport({ baseUrl, allowInsecureHttp: true });
await snapshotTransport.report(controlSession.credential.accessToken, snapshot);

const keySync = new HttpApprovalKeySetTransport({ baseUrl, allowInsecureHttp: true });
const keyUpdate = await keySync.fetchApprovalKeySet(
  controlSession.credential.accessToken,
  controlSession.credential.sessionId,
  0,
);
assert.equal(keyUpdate, null);

const operatorHeaders = {
  authorization: `Bearer ${process.env.OPERATOR_ACCESS_TOKEN}`,
  'content-type': 'application/json',
};

async function queueApproved(toolId, input, correlationId) {
  const response = await fetch(
    `${baseUrl}/v1/products/agent-bridge/installations/${binding.installationId}/approved-commands`,
    {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({ toolId, input, correlationId, ttlSeconds: 120 }),
    },
  );
  const payload = await response.json();
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.equal(payload.version, 'kcc.agent-bridge-command.v1');
  assert.equal(payload.approval, 'signed');
  assert.equal(payload.command.state, 'queued');
  assert.equal(payload.command.toolId, toolId);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.command, 'approvalToken'), false);
  return payload.command;
}

const runId = process.env.GITHUB_RUN_ID ?? 'local';
const writeInput = { path: '/safe/write.txt', content: 'approved-write' };
const criticalInput = { path: '/safe/delete.txt' };
const writeCorrelation = `ci-write-${runId}`;
const criticalCorrelation = `ci-critical-${runId}`;
const queuedWrite = await queueApproved(
  'files.ci-files.write-file',
  writeInput,
  writeCorrelation,
);
const queuedCritical = await queueApproved(
  'files.ci-files.delete-file',
  criticalInput,
  criticalCorrelation,
);

const commandTransport = new HttpCommandTransport({ baseUrl, allowInsecureHttp: true });
const batch = await commandTransport.fetchCommands(
  controlSession.credential.accessToken,
  controlSession.credential.sessionId,
  10,
);
assert.equal(batch.commands.length, 2);

const keyById = new Map(binding.trustedApprovalKeys.map((key) => [key.keyId, key.publicKeyPem]));
const verifier = new SignedApprovalVerifier({
  resolvePublicKey: async (keyId) => keyById.get(keyId) ?? null,
});

for (const command of batch.commands) {
  assert.equal(typeof command.approvalToken, 'string');
  assert.ok(command.approvalToken.length > 0);
  const verification = await verifier.verify(command.approvalToken, {
    tenantId: command.tenantId,
    installationId: command.installationId,
    toolId: command.toolId,
    correlationId: command.correlationId,
    input: command.input,
  });
  assert.equal(verification.valid, true);
  assert.equal(verification.decision, 'ALLOW');
  assert.equal(verification.payload.actionFingerprint, command.actionFingerprint);

  const tampered = await verifier.verify(command.approvalToken, {
    tenantId: command.tenantId,
    installationId: command.installationId,
    toolId: command.toolId,
    correlationId: command.correlationId,
    input: { tampered: true },
  });
  assert.equal(tampered.valid, false);
  assert.match(tampered.reason, /fingerprint/i);

  await commandTransport.acknowledgeCommand(controlSession.credential.accessToken, {
    version: 'kab.command-ack.v1',
    commandId: command.commandId,
    deliveryAttempt: command.deliveryAttempt,
    sessionId: controlSession.credential.sessionId,
    correlationId: command.correlationId,
    status: 'executed',
    completedAt: new Date().toISOString(),
    output: { accepted: true },
  });
}

for (const queued of [queuedWrite, queuedCritical]) {
  const statusResponse = await fetch(
    `${baseUrl}/v1/products/agent-bridge/commands/${queued.commandId}`,
    { headers: { authorization: `Bearer ${process.env.OPERATOR_ACCESS_TOKEN}` } },
  );
  const status = await statusResponse.json();
  assert.equal(statusResponse.status, 200, JSON.stringify(status));
  assert.equal(status.command.state, 'completed');
  assert.equal(status.command.acknowledgement.status, 'executed');
  assert.equal(Object.prototype.hasOwnProperty.call(status.command, 'approvalToken'), false);
}

const auditTransport = new HttpAuditDeliveryTransport({ baseUrl, allowInsecureHttp: true });
const now = new Date().toISOString();
const auditBatch = {
  version: 'kab.audit-batch.v1',
  batchId: `ci-audit-${runId}`,
  sessionId: controlSession.credential.sessionId,
  tenantId: binding.tenantId,
  installationId: binding.installationId,
  bridgeInstanceId: binding.bridgeInstanceId,
  events: [
    {
      version: 'kab.audit-event.v1',
      eventId: `ci-audit-write-${runId}`,
      tenantId: binding.tenantId,
      installationId: binding.installationId,
      bridgeInstanceId: binding.bridgeInstanceId,
      type: 'EXECUTION_SUCCEEDED',
      correlationId: writeCorrelation,
      toolId: 'files.ci-files.write-file',
      actor: 'kairoseth-operator:ci',
      risk: 'WRITE',
      occurredAt: now,
      outcome: 'ALLOW',
      message: 'WRITE completed; Authorization: Bearer must-not-persist token=also-secret',
    },
    {
      version: 'kab.audit-event.v1',
      eventId: `ci-audit-critical-${runId}`,
      tenantId: binding.tenantId,
      installationId: binding.installationId,
      bridgeInstanceId: binding.bridgeInstanceId,
      type: 'EXECUTION_SUCCEEDED',
      correlationId: criticalCorrelation,
      toolId: 'files.ci-files.delete-file',
      actor: 'kairoseth-operator:ci',
      risk: 'CRITICAL',
      occurredAt: now,
      outcome: 'ALLOW',
      message: 'CRITICAL completed safely.',
    },
  ],
};
const auditAck = await auditTransport.sendAuditBatch(
  controlSession.credential.accessToken,
  auditBatch,
);
assert.equal(auditAck.version, 'kab.audit-batch-ack.v1');
assert.equal(auditAck.batchId, auditBatch.batchId);
assert.deepEqual(
  new Set(auditAck.acceptedEventIds),
  new Set(auditBatch.events.map((event) => event.eventId)),
);

console.log(JSON.stringify({
  version: 'phase7.2b-mutation-security-evidence.v1',
  result: 'accepted',
  installationId: binding.installationId,
  trustedApprovalKeyId: trustedKey.keyId,
  commandIds: batch.commands.map((command) => command.commandId),
  auditEventIds: auditAck.acceptedEventIds,
  tamperRejected: true,
}));
