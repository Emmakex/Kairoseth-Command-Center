import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/application';
import type { AgentBridgeAuditEvent, AgentBridgeAuditStore } from '../src/agent-bridge-audit-store';
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

class FakeAuditStore implements AgentBridgeAuditStore {
  lastSession: AgentBridgeRuntimeSession | null = null;
  lastEvents: readonly AgentBridgeAuditEvent[] = [];

  async ensureIndexes(): Promise<void> {}

  async ingestEvents(
    session: AgentBridgeRuntimeSession,
    events: readonly AgentBridgeAuditEvent[],
  ): Promise<string[]> {
    this.lastSession = session;
    this.lastEvents = events;
    return events.map((event) => event.eventId);
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

describe('Agent Bridge approval-key sync and runtime audit routes', () => {
  it('accepts a session-bound generation-0 approval key sync', async () => {
    const app = buildApp({ agentBridgeControlStore: controlStore });

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/approval-keys/sync',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { sessionId: 'session-1', currentGeneration: 0 },
    });

    expect(response.statusCode).toBe(204);

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
      headers: { authorization: 'Bearer operator-or-invalid-token' },
      payload: { sessionId: 'session-1', currentGeneration: 0 },
    });
    expect(unauthenticated.statusCode).toBe(401);

    await app.close();
  });

  it('accepts scoped audit events and returns the Agent Bridge batch acknowledgement contract', async () => {
    const auditStore = new FakeAuditStore();
    const app = buildApp({
      agentBridgeControlStore: controlStore,
      agentBridgeAuditStore: auditStore,
    });
    const event = auditEvent();

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/audit/batch',
      headers: { authorization: 'Bearer runtime-token' },
      payload: {
        batch: {
          version: 'kab.audit-batch.v1',
          batchId: 'batch-1',
          sessionId: 'session-1',
          tenantId: 'workspace-a',
          installationId: 'installation-1',
          bridgeInstanceId: 'bridge-1',
          events: [event],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ack: {
        version: 'kab.audit-batch-ack.v1',
        batchId: 'batch-1',
        acceptedEventIds: ['event-1'],
      },
    });
    expect(auditStore.lastSession).toEqual(runtimeSession);
    expect(auditStore.lastEvents).toEqual([event]);

    await app.close();
  });

  it('rejects audit batches that escape the authenticated runtime scope', async () => {
    const auditStore = new FakeAuditStore();
    const app = buildApp({
      agentBridgeControlStore: controlStore,
      agentBridgeAuditStore: auditStore,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/audit/batch',
      headers: { authorization: 'Bearer runtime-token' },
      payload: {
        batch: {
          version: 'kab.audit-batch.v1',
          batchId: 'batch-cross-tenant',
          sessionId: 'session-1',
          tenantId: 'workspace-b',
          installationId: 'installation-1',
          bridgeInstanceId: 'bridge-1',
          events: [auditEvent({ tenantId: 'workspace-b' })],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(auditStore.lastEvents).toEqual([]);

    await app.close();
  });

  it('rejects duplicate event IDs inside one audit batch before persistence', async () => {
    const auditStore = new FakeAuditStore();
    const app = buildApp({
      agentBridgeControlStore: controlStore,
      agentBridgeAuditStore: auditStore,
    });
    const first = auditEvent();
    const duplicate = auditEvent({ message: 'Different event body with same ID.' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/audit/batch',
      headers: { authorization: 'Bearer runtime-token' },
      payload: {
        batch: {
          version: 'kab.audit-batch.v1',
          batchId: 'batch-duplicate',
          sessionId: 'session-1',
          tenantId: 'workspace-a',
          installationId: 'installation-1',
          bridgeInstanceId: 'bridge-1',
          events: [first, duplicate],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(auditStore.lastEvents).toEqual([]);

    await app.close();
  });
});
