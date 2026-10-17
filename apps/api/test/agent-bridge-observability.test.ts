import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/application';
import type {
  AgentBridgeA2AObservabilitySummary,
  AgentBridgeA2ASaveResult,
  AgentBridgeA2AScope,
  AgentBridgeA2AStore,
  AgentBridgeA2AStoredTask,
  AgentBridgeA2ATaskState,
  AgentBridgeA2ATransitionClaim,
} from '../src/agent-bridge-a2a-store';

const session: SessionContext = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User One',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-1',
  role: 'admin',
  capabilities: [],
  productEntitlements: ['agent-bridge'],
};

const provider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? session : null;
  },
};

const forbiddenProvider: AuthProvider = {
  name: 'test-forbidden',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token'
      ? { ...session, productEntitlements: ['command-center'] }
      : null;
  },
};

const headers = { authorization: 'Bearer valid-token' };

const summary: AgentBridgeA2AObservabilitySummary = {
  totalTasks: 7,
  activeClaims: 1,
  installations: 2,
  latestUpdatedAt: '2026-10-17T07:00:00.000Z',
  states: {
    TASK_STATE_UNSPECIFIED: 0,
    TASK_STATE_SUBMITTED: 0,
    TASK_STATE_WORKING: 1,
    TASK_STATE_COMPLETED: 4,
    TASK_STATE_FAILED: 1,
    TASK_STATE_CANCELED: 0,
    TASK_STATE_INPUT_REQUIRED: 0,
    TASK_STATE_REJECTED: 0,
    TASK_STATE_AUTH_REQUIRED: 1,
  },
};

class ObservabilityStore implements AgentBridgeA2AStore {
  lastTenantId: string | null = null;

  async ensureIndexes(): Promise<void> {}

  async save(_record: AgentBridgeA2AStoredTask): Promise<AgentBridgeA2ASaveResult> {
    return { ok: true };
  }

  async get(
    _taskId: string,
    _scope: AgentBridgeA2AScope,
  ): Promise<AgentBridgeA2AStoredTask | null> {
    return null;
  }

  async claim(_input: {
    taskId: string;
    scope: AgentBridgeA2AScope;
    expectedState: AgentBridgeA2ATaskState;
    expectedActionFingerprint: string;
    claimId: string;
  }): Promise<AgentBridgeA2ATransitionClaim | null> {
    return null;
  }

  async complete(
    _claim: AgentBridgeA2ATransitionClaim,
    _record: AgentBridgeA2AStoredTask,
  ): Promise<boolean> {
    return false;
  }

  async summarizeTenant(tenantId: string): Promise<AgentBridgeA2AObservabilitySummary> {
    this.lastTenantId = tenantId;
    return structuredClone(summary);
  }
}

describe('Agent Bridge observability API', () => {
  it('returns tenant-bound aggregate observability without sensitive task data', async () => {
    const store = new ObservabilityStore();
    const app = buildApp({ authProvider: provider, agentBridgeA2AStore: store });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/observability',
      headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(store.lastTenantId).toBe('workspace-a');
    expect(response.json()).toEqual({
      version: 'kcc.agent-bridge-observability.v1',
      summary,
    });

    const serialized = response.body;
    expect(serialized).not.toContain('actor');
    expect(serialized).not.toContain('toolId');
    expect(serialized).not.toContain('correlationId');
    expect(serialized).not.toContain('actionFingerprint');
    expect(serialized).not.toContain('input');

    await app.close();
  });

  it('requires authentication and Agent Bridge entitlement', async () => {
    const store = new ObservabilityStore();
    const app = buildApp({ authProvider: provider, agentBridgeA2AStore: store });

    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/observability',
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.headers['cache-control']).toBe('no-store');

    const forbidden = buildApp({
      authProvider: forbiddenProvider,
      agentBridgeA2AStore: store,
    });
    const noEntitlement = await forbidden.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/observability',
      headers,
    });
    expect(noEntitlement.statusCode).toBe(403);
    expect(noEntitlement.json()).toEqual({ code: 'agent_bridge_forbidden' });

    await app.close();
    await forbidden.close();
  });

  it('fails closed when aggregate observability is unavailable', async () => {
    const app = buildApp({ authProvider: provider });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/observability',
      headers,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: 'agent_bridge_observability_unavailable' });
    expect(response.headers['cache-control']).toBe('no-store');

    await app.close();
  });
});
