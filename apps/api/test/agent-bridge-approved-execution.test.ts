import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/application';
import type {
  AgentBridgeCommandAcknowledgement,
  AgentBridgeExecutionStore,
  AgentBridgeQueuedCommand,
} from '../src/agent-bridge-execution-store';
import type { AgentBridgeRuntimeSession } from '../src/agent-bridge-control-store';

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

class FakeExecutionStore implements AgentBridgeExecutionStore {
  lastApprovedInput: Parameters<AgentBridgeExecutionStore['queueApprovedCommand']>[0] | null = null;

  async ensureIndexes(): Promise<void> {}

  async queueReadCommand(): Promise<AgentBridgeQueuedCommand | null> {
    return null;
  }

  async queueApprovedCommand(
    input: Parameters<AgentBridgeExecutionStore['queueApprovedCommand']>[0],
  ): Promise<AgentBridgeQueuedCommand | null> {
    this.lastApprovedInput = input;
    if (input.toolId === 'files.local.read-file') return null;
    return {
      commandId: 'command-approved-1',
      correlationId: input.correlationId ?? 'correlation-approved-1',
      installationId: input.installationId,
      toolId: input.toolId,
      state: 'queued',
      issuedAt: '2026-10-19T14:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      deliveryAttempt: 0,
    };
  }

  async pullCommands(_session: AgentBridgeRuntimeSession, _limit: number) {
    return { batchId: 'batch-empty', commands: [] };
  }

  async acknowledgeCommand(
    _session: AgentBridgeRuntimeSession,
    _acknowledgement: AgentBridgeCommandAcknowledgement,
  ): Promise<boolean> {
    return false;
  }

  async getCommand(): Promise<AgentBridgeQueuedCommand | null> {
    return null;
  }
}

describe('Agent Bridge approved mutation route', () => {
  it('queues an explicit approved WRITE/CRITICAL command without exposing a token', async () => {
    const executionStore = new FakeExecutionStore();
    const app = buildApp({ authProvider, agentBridgeExecutionStore: executionStore });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/installations/installation-1/approved-commands',
      headers: { authorization: 'Bearer operator-token' },
      payload: {
        toolId: 'woocommerce.store.orders.update-status',
        input: { orderId: 42, status: 'completed' },
        correlationId: 'correlation-approved-1',
        ttlSeconds: 120,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(executionStore.lastApprovedInput).toEqual({
      tenantId: 'workspace-a',
      installationId: 'installation-1',
      toolId: 'woocommerce.store.orders.update-status',
      input: { orderId: 42, status: 'completed' },
      actor: 'kairoseth-operator:operator-1',
      createdBy: 'operator-1',
      correlationId: 'correlation-approved-1',
      ttlSeconds: 120,
    });
    const body = response.json();
    expect(body.version).toBe('kcc.agent-bridge-command.v1');
    expect(body.approval).toBe('signed');
    expect(body.command.toolId).toBe('woocommerce.store.orders.update-status');
    expect(Object.prototype.hasOwnProperty.call(body.command, 'approvalToken')).toBe(false);

    await app.close();
  });

  it('rejects non-mutation tools, injected approval tokens, invalid TTLs and unauthenticated calls', async () => {
    const executionStore = new FakeExecutionStore();
    const app = buildApp({ authProvider, agentBridgeExecutionStore: executionStore });
    const url = '/v1/products/agent-bridge/installations/installation-1/approved-commands';

    const readAttempt = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: 'Bearer operator-token' },
      payload: {
        toolId: 'files.local.read-file',
        input: { path: '/safe/readme.txt' },
      },
    });
    expect(readAttempt.statusCode).toBe(409);
    expect(readAttempt.json()).toEqual({ code: 'agent_bridge_mutation_tool_unavailable' });

    const injectedApproval = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: 'Bearer operator-token' },
      payload: {
        toolId: 'files.local.write-file',
        input: { path: '/safe/write.txt', content: 'x' },
        approvalToken: 'must-never-be-accepted-from-the-operator',
      },
    });
    expect(injectedApproval.statusCode).toBe(400);

    const invalidTtl = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: 'Bearer operator-token' },
      payload: {
        toolId: 'files.local.write-file',
        input: { path: '/safe/write.txt', content: 'x' },
        ttlSeconds: 301,
      },
    });
    expect(invalidTtl.statusCode).toBe(400);

    const unauthenticated = await app.inject({
      method: 'POST',
      url,
      payload: {
        toolId: 'files.local.write-file',
        input: { path: '/safe/write.txt', content: 'x' },
      },
    });
    expect(unauthenticated.statusCode).toBe(401);

    await app.close();
  });
});
