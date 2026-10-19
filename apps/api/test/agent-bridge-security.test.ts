import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/application';
import type { AgentBridgeApprovalService } from '../src/agent-bridge-approval-store';
import type {
  AgentBridgeAuditBatch,
  AgentBridgeAuditEvent,
  AgentBridgeAuditStore,
} from '../src/agent-bridge-audit-store';
import type {
  AgentBridgeControlStore,
  AgentBridgeRuntimeSession,
} from '../src/agent-bridge-control-store';

const runtimeSession: AgentBridgeRuntimeSession = {
  sessionId: 'session-1',
  tenantId: 'workspace-a',
  installationId: 'installation-1',
  bridgeInstanceId: 'bridge-1',
  keyId: 'runtime-key-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
  heartbeatIntervalSeconds: 30,
};

const controlStore = {
  async resolveRuntimeSession(accessToken: string) {
    return accessToken === 'runtime-token' ? runtimeSession : null;
  },
} as unknown as AgentBridgeControlStore;

const approvalService: AgentBridgeApprovalService = {
  async ensureIndexes() {},
  async trustedApprovalKeys() {
    return [];
  },
  async generation() {
    return 0;
  },
  async rotationStatus() {
    return { generation: 0, phase: 'stable' as const, signingKeyId: 'unused', trustedKeyIds: [] };
  },
  async beginRotation() {
    return { generation: 1, phase: 'overlap' as const, signingKeyId: 'unused', trustedKeyIds: [] };
  },
  async syncApprovalKeys() {
    return {
      update: null,
      status: { generation: 0, phase: 'stable' as const, signingKeyId: 'unused', trustedKeyIds: [] },
    };
  },
  async signApproval() {
    return 'unused';
  },
};

class FakeAuditStore implements AgentBridgeAuditStore {
  lastBatch: AgentBridgeAuditBatch | null = null;

  async ensureIndexes(): Promise<void> {}

  async ingestBatch(
    session: AgentBridgeRuntimeSession,
    batch: AgentBridgeAuditBatch,
  ): Promise<string[]> {
    if (
      batch.sessionId !== session.sessionId ||
      batch.tenantId !== session.tenantId ||
      batch.installationId !== session.installationId ||
      batch.bridgeInstanceId !== session.bridgeInstanceId
    ) {
      throw new Error('scope mismatch');
    }
    this.lastBatch = batch;
    return batch.events.map((event) => event.eventId);
  }
}

function auditEvent(overrides: Partial<AgentBridgeAuditEvent> = {}): AgentBridgeAuditEvent {
  return {
    version: 'kab.audit-event.v1',
    eventId: 'event-1',
    tenantId: 'workspace-a',
    installationId: 'installation-1',
    bridgeInstanceId: 'bridge-1',
    type: 'EXECUTION_SUCCEEDED',
    correlationId: 'correlation-1',
    toolId: 'files.local.write-file',
    actor: 'kairoseth-operator:operator-1',
    risk: 'WRITE',
    occurredAt: new Date().toISOString(),
    outcome: 'ALLOW',
    message: 'Write completed safely.',
    ...overrides,
  };
}

function auditBatch(events: AgentBridgeAuditEvent[], overrides: Partial<AgentBridgeAuditBatch> = {}) {
  return {
    version: 'kab.audit-batch.v1' as const,
    batchId: 'batch-1',
    sessionId: 'session-1',
    tenantId: 'workspace-a',
    installationId: 'installation-1',
    bridgeInstanceId: 'bridge-1',
    events,
    ...overrides,
  };
}

describe('Agent Bridge approval-key sync and runtime audit security', () => {
  it('accepts only the authenticated runtime session at the current approval generation', async () => {
    const app = buildApp({
      agentBridgeControlStore: controlStore,
      agentBridgeApprovalService: approvalService,
    });

    const current = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/approval-keys/sync',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { sessionId: 'session-1', currentGeneration: 0 },
    });
    expect(current.statusCode).toBe(204);

    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/approval-keys/sync',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { sessionId: 'session-1', currentGeneration: 1 },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toEqual({
      code: 'approval_key_generation_ahead',
      currentGeneration: 0,
    });

    const wrongSession = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/approval-keys/sync',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { sessionId: 'session-other', currentGeneration: 0 },
    });
    expect(wrongSession.statusCode).toBe(400);

    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/approval-keys/sync',
      headers: { authorization: 'Bearer invalid-token' },
      payload: { sessionId: 'session-1', currentGeneration: 0 },
    });
    expect(unauthenticated.statusCode).toBe(401);

    await app.close();
  });

  it('redacts secrets before audit events reach durable persistence', async () => {
    const auditStore = new FakeAuditStore();
    const app = buildApp({
      agentBridgeControlStore: controlStore,
      agentBridgeAuditStore: auditStore,
    });
    const event = auditEvent({
      message: 'Authorization: Bearer must-not-persist token=another-secret',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/audit/batch',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { batch: auditBatch([event]) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ack: {
        version: 'kab.audit-batch-ack.v1',
        batchId: 'batch-1',
        acceptedEventIds: ['event-1'],
      },
    });
    const persistedMessage = auditStore.lastBatch?.events[0]?.message ?? '';
    expect(persistedMessage).toContain('[REDACTED]');
    expect(persistedMessage).not.toContain('must-not-persist');
    expect(persistedMessage).not.toContain('another-secret');

    await app.close();
  });

  it('rejects cross-scope audit batches and duplicate event IDs', async () => {
    const auditStore = new FakeAuditStore();
    const app = buildApp({
      agentBridgeControlStore: controlStore,
      agentBridgeAuditStore: auditStore,
    });

    const crossScope = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/audit/batch',
      headers: { authorization: 'Bearer runtime-token' },
      payload: {
        batch: auditBatch(
          [auditEvent({ tenantId: 'workspace-b' })],
          { tenantId: 'workspace-b' },
        ),
      },
    });
    expect(crossScope.statusCode).toBe(409);

    const first = auditEvent();
    const duplicate = auditEvent({ message: 'same id, different body' });
    const duplicateIds = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/audit/batch',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { batch: auditBatch([first, duplicate]) },
    });
    expect(duplicateIds.statusCode).toBe(400);

    await app.close();
  });
});
