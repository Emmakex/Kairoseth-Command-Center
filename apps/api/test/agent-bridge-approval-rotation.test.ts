import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type {
  AgentBridgeApprovalRotationStatus,
  AgentBridgeApprovalService,
  AgentBridgeSignedApprovalKeySet,
} from '../src/agent-bridge-approval-store';
import type {
  AgentBridgeControlStore,
  AgentBridgeRuntimeSession,
} from '../src/agent-bridge-control-store';
import { buildApp } from '../src/application';

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
  keyId: 'bridge-key-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
  heartbeatIntervalSeconds: 30,
};

const controlStore = {
  async resolveRuntimeSession(accessToken: string) {
    return accessToken === 'runtime-token' ? runtimeSession : null;
  },
} as unknown as AgentBridgeControlStore;

class FakeApprovalService implements AgentBridgeApprovalService {
  generationValue = 0;
  beginRotationTenant: string | null = null;
  rotationStatusTenant: string | null = null;
  syncInputs: Array<Parameters<AgentBridgeApprovalService['syncApprovalKeys']>[0]> = [];
  nextUpdate: AgentBridgeSignedApprovalKeySet | null = null;

  async ensureIndexes(): Promise<void> {}

  async trustedApprovalKeys() {
    return [{ keyId: 'approval-key-old', publicKeyPem: 'public-key' }];
  }

  async generation() {
    return this.generationValue;
  }

  async rotationStatus(tenantId: string): Promise<AgentBridgeApprovalRotationStatus> {
    this.rotationStatusTenant = tenantId;
    return this.status(this.generationValue === 0 ? 'stable' : 'overlap');
  }

  async beginRotation(tenantId: string): Promise<AgentBridgeApprovalRotationStatus> {
    this.beginRotationTenant = tenantId;
    this.generationValue = 1;
    return this.status('overlap');
  }

  async syncApprovalKeys(input: Parameters<AgentBridgeApprovalService['syncApprovalKeys']>[0]) {
    this.syncInputs.push(input);
    return {
      update: this.nextUpdate,
      status: this.status(this.generationValue === 0 ? 'stable' : 'overlap'),
    };
  }

  async signApproval() {
    return 'signed-approval-token';
  }

  private status(
    phase: AgentBridgeApprovalRotationStatus['phase'] = 'stable',
  ): AgentBridgeApprovalRotationStatus {
    return {
      generation: this.generationValue,
      phase,
      signingKeyId: 'approval-key-old',
      trustedKeyIds:
        phase === 'overlap'
          ? ['approval-key-old', 'approval-key-new']
          : ['approval-key-old'],
    };
  }
}

describe('Agent Bridge approval-key security routes', () => {
  it('returns rotation status only to an authorized workspace operator', async () => {
    const approvals = new FakeApprovalService();
    const app = buildApp({
      authProvider,
      agentBridgeControlStore: controlStore,
      agentBridgeApprovalService: approvals,
    });

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/approval-keys/rotation',
    });
    expect(unauthorized.statusCode).toBe(401);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/approval-keys/rotation',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(approvals.rotationStatusTenant).toBe('workspace-a');
    expect(response.json()).toEqual({
      version: 'kcc.agent-bridge-approval-rotation.v1',
      status: {
        generation: 0,
        phase: 'stable',
        signingKeyId: 'approval-key-old',
        trustedKeyIds: ['approval-key-old'],
      },
    });

    await app.close();
  });

  it('starts rotation only from an authorized workspace operator', async () => {
    const approvals = new FakeApprovalService();
    const app = buildApp({
      authProvider,
      agentBridgeControlStore: controlStore,
      agentBridgeApprovalService: approvals,
    });

    const unauthorized = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/approval-keys/rotate',
    });
    expect(unauthorized.statusCode).toBe(401);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/approval-keys/rotate',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(approvals.beginRotationTenant).toBe('workspace-a');
    expect(response.json()).toEqual({
      version: 'kcc.agent-bridge-approval-rotation.v1',
      status: {
        generation: 1,
        phase: 'overlap',
        signingKeyId: 'approval-key-old',
        trustedKeyIds: ['approval-key-old', 'approval-key-new'],
      },
    });

    await app.close();
  });

  it('serves the signed keyset update in the authenticated runtime scope', async () => {
    const approvals = new FakeApprovalService();
    approvals.generationValue = 1;
    approvals.nextUpdate = {
      payload: {
        version: 'kab.approval-keyset.v1',
        tenantId: 'workspace-a',
        installationId: 'installation-1',
        bridgeInstanceId: 'bridge-1',
        generation: 1,
        keys: [
          { keyId: 'approval-key-old', publicKeyPem: 'old-public-key' },
          { keyId: 'approval-key-new', publicKeyPem: 'new-public-key' },
        ],
        issuedAt: '2026-10-19T14:00:00.000Z',
      },
      signerKeyId: 'approval-key-old',
      signature: 'signature',
    };
    const app = buildApp({
      authProvider,
      agentBridgeControlStore: controlStore,
      agentBridgeApprovalService: approvals,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/approval-keys/sync',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { sessionId: 'session-1', currentGeneration: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(approvals.syncInputs).toEqual([
      {
        tenantId: 'workspace-a',
        installationId: 'installation-1',
        bridgeInstanceId: 'bridge-1',
        currentGeneration: 0,
      },
    ]);
    expect(response.json()).toEqual({ update: approvals.nextUpdate });

    await app.close();
  });

  it('rejects a future generation before recording runtime synchronization', async () => {
    const approvals = new FakeApprovalService();
    approvals.generationValue = 1;
    const app = buildApp({
      authProvider,
      agentBridgeControlStore: controlStore,
      agentBridgeApprovalService: approvals,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/approval-keys/sync',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { sessionId: 'session-1', currentGeneration: 2 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'approval_key_generation_ahead',
      currentGeneration: 1,
    });
    expect(approvals.syncInputs).toEqual([]);

    await app.close();
  });
});
