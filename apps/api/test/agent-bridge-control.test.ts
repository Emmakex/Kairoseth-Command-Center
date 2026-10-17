import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/application';
import type {
  AgentBridgeControlStore,
  AgentBridgeHeartbeat,
  AgentBridgeRegistrationProof,
  AgentBridgeRuntimeObservability,
  AgentBridgeRuntimeSession,
  AgentBridgeRuntimeSnapshot,
  AgentBridgeSessionProof,
} from '../src/agent-bridge-control-store';

const operator: SessionContext = {
  user: {
    id: 'operator-1',
    email: 'operator@example.com',
    displayName: 'Operator',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-1',
  role: 'admin',
  capabilities: ['workspace.manage'],
  productEntitlements: ['agent-bridge'],
};

const authProvider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer operator-token' ? operator : null;
  },
};

const runtimeSession: AgentBridgeRuntimeSession = {
  sessionId: 'session-1',
  tenantId: 'workspace-a',
  installationId: 'installation-1',
  bridgeInstanceId: 'bridge-1',
  keyId: 'key-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
  heartbeatIntervalSeconds: 30,
};

const runtimeSummary: AgentBridgeRuntimeObservability = {
  totalInstallations: 1,
  connectedInstallations: 1,
  degradedInstallations: 0,
  offlineInstallations: 0,
  installations: [
    {
      installationId: 'installation-1',
      bridgeInstanceId: 'bridge-1',
      deploymentMode: 'local',
      runtimeVersion: '0.1.0',
      readiness: 'ready',
      connectivity: 'connected',
      lastHeartbeatAt: '2026-10-17T07:00:00.000Z',
      lastSnapshotAt: '2026-10-17T07:00:01.000Z',
      capabilities: ['files'],
      connectors: { total: 1, healthy: 1, degraded: 0, unhealthy: 0 },
      tools: { total: 1, available: 1, degraded: 0, blocked: 0 },
    },
  ],
};

class FakeControlStore implements AgentBridgeControlStore {
  heartbeat: AgentBridgeHeartbeat | null = null;
  snapshot: AgentBridgeRuntimeSnapshot | null = null;
  enrollmentTenant: string | null = null;

  async ensureIndexes(): Promise<void> {}

  async issueEnrollmentToken(input: { tenantId: string; createdBy: string; ttlSeconds?: number }) {
    this.enrollmentTenant = input.tenantId;
    return { token: 'enrollment-secret', expiresAt: '2099-01-01T00:00:00.000Z' };
  }

  async createEnrollmentChallenge(token: string) {
    return token === 'enrollment-secret'
      ? { nonce: 'enrollment-nonce', expiresAt: '2099-01-01T00:00:00.000Z' }
      : null;
  }

  async registerInstallation(_token: string, _proof: AgentBridgeRegistrationProof) {
    return {
      tenantId: 'workspace-a',
      installationId: 'installation-1',
      bridgeInstanceId: 'bridge-1',
      keyId: 'key-1',
      registeredAt: '2026-10-17T07:00:00.000Z',
    };
  }

  async createSessionChallenge(input: {
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    keyId: string;
  }) {
    return input.installationId === 'installation-1'
      ? { nonce: 'session-nonce', expiresAt: '2099-01-01T00:00:00.000Z' }
      : null;
  }

  async openSession(_proof: AgentBridgeSessionProof) {
    return {
      ...runtimeSession,
      accessToken: 'runtime-token',
      issuedAt: '2026-10-17T07:00:00.000Z',
    };
  }

  async resolveRuntimeSession(accessToken: string) {
    return accessToken === 'runtime-token' ? runtimeSession : null;
  }

  async recordHeartbeat(_session: AgentBridgeRuntimeSession, heartbeat: AgentBridgeHeartbeat) {
    this.heartbeat = heartbeat;
    return { receivedAt: '2026-10-17T07:00:02.000Z', nextHeartbeatInSeconds: 30 };
  }

  async recordRuntimeSnapshot(
    _session: AgentBridgeRuntimeSession,
    snapshot: AgentBridgeRuntimeSnapshot,
  ) {
    this.snapshot = snapshot;
    return { snapshotId: snapshot.snapshotId, receivedAt: '2026-10-17T07:00:03.000Z' };
  }

  async summarizeTenant(tenantId: string) {
    return tenantId === 'workspace-a' ? structuredClone(runtimeSummary) : {
      totalInstallations: 0,
      connectedInstallations: 0,
      degradedInstallations: 0,
      offlineInstallations: 0,
      installations: [],
    };
  }
}

const snapshotPayload = {
  version: 'kab.runtime-snapshot.v1',
  snapshotId: 'snapshot-1',
  generatedAt: '2026-10-17T07:00:01.000Z',
  connectors: [
    {
      connectorId: 'files',
      connectorInstanceId: 'files-main',
      name: 'Files',
      version: '1.0.0',
      description: 'Root-scoped file access',
      localizations: {
        es: { name: 'Archivos', description: 'Acceso a archivos por raíz' },
        en: { name: 'Files', description: 'Root-scoped file access' },
      },
      capabilities: ['files'],
      tools: [
        {
          toolId: 'read-file',
          runtimeToolId: 'files.files-main.read-file',
          name: 'Read file',
          description: 'Read an allowed file',
          risk: 'READ',
        },
      ],
    },
  ],
  health: [
    {
      connectorId: 'files',
      connectorInstanceId: 'files-main',
      status: 'healthy',
      checkedAt: '2026-10-17T07:00:01.000Z',
      tools: [
        {
          toolId: 'read-file',
          runtimeToolId: 'files.files-main.read-file',
          availability: 'available',
        },
      ],
    },
  ],
} as const;

describe('Agent Bridge control plane routes', () => {
  it('issues a workspace-bound enrollment token only to an authorized operator', async () => {
    const store = new FakeControlStore();
    const app = buildApp({ authProvider, agentBridgeControlStore: store });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/enrollment-tokens',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(store.enrollmentTenant).toBe('workspace-a');
    expect(response.json()).toEqual({
      version: 'kcc.agent-bridge-enrollment-token.v1',
      token: 'enrollment-secret',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    await app.close();
  });

  it('accepts authenticated heartbeat and returns the Agent Bridge ack contract', async () => {
    const store = new FakeControlStore();
    const app = buildApp({ authProvider, agentBridgeControlStore: store });
    const payload = {
      version: 'kab.heartbeat.v1',
      sessionId: 'session-1',
      tenantId: 'workspace-a',
      installationId: 'installation-1',
      bridgeInstanceId: 'bridge-1',
      sentAt: '2026-10-17T07:00:01.000Z',
      readiness: 'ready',
      runtimeVersion: '0.1.0',
      capabilities: ['files'],
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/session/heartbeat',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { heartbeat: payload },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(store.heartbeat).toEqual(payload);
    expect(response.json()).toEqual({
      ack: {
        version: 'kab.heartbeat-ack.v1',
        receivedAt: '2026-10-17T07:00:02.000Z',
        nextHeartbeatInSeconds: 30,
      },
    });

    await app.close();
  });

  it('accepts the exact safe runtime snapshot contract and rejects inventory-health mismatch', async () => {
    const store = new FakeControlStore();
    const app = buildApp({ authProvider, agentBridgeControlStore: store });

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { snapshot: snapshotPayload },
    });
    expect(accepted.statusCode).toBe(200);
    expect(store.snapshot).toEqual(snapshotPayload);
    expect(accepted.json()).toEqual({
      ack: {
        version: 'kab.runtime-snapshot-ack.v1',
        snapshotId: 'snapshot-1',
        receivedAt: '2026-10-17T07:00:03.000Z',
      },
    });

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer runtime-token' },
      payload: {
        snapshot: {
          ...snapshotPayload,
          health: [{ ...snapshotPayload.health[0], connectorInstanceId: 'other' }],
        },
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toEqual({ code: 'invalid_runtime_snapshot' });

    await app.close();
  });

  it('exposes only workspace-bound runtime observability to entitled operators', async () => {
    const store = new FakeControlStore();
    const app = buildApp({ authProvider, agentBridgeControlStore: store });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/runtime-observability',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      version: 'kcc.agent-bridge-runtime-observability.v1',
      summary: runtimeSummary,
    });
    expect(response.body).not.toContain('accessToken');
    expect(response.body).not.toContain('publicKeyPem');
    expect(response.body).not.toContain('keyId');

    await app.close();
  });

  it('rejects runtime traffic authenticated with an operator token', async () => {
    const store = new FakeControlStore();
    const app = buildApp({ authProvider, agentBridgeControlStore: store });

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer operator-token' },
      payload: { snapshot: snapshotPayload },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: 'invalid_runtime_session' });

    await app.close();
  });
});
