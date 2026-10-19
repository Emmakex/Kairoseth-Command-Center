import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/application';
import type {
  AgentBridgeControlStore,
  AgentBridgeRuntimeSession,
} from '../src/agent-bridge-control-store';
import {
  AgentBridgeApprovalSigningUnavailableError,
  type AgentBridgeCommandAcknowledgement,
  type AgentBridgeCommandEnvelope,
  type AgentBridgeExecutionStore,
  type AgentBridgeQueuedCommand,
} from '../src/agent-bridge-execution-store';

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

const controlStore = {
  async resolveRuntimeSession(accessToken: string) {
    return accessToken === 'runtime-token' ? runtimeSession : null;
  },
} as unknown as AgentBridgeControlStore;

class FakeExecutionStore implements AgentBridgeExecutionStore {
  queued: AgentBridgeQueuedCommand | null = null;
  lastQueueInput: Parameters<AgentBridgeExecutionStore['queueCommand']>[0] | null = null;
  lastAck: AgentBridgeCommandAcknowledgement | null = null;

  async ensureIndexes(): Promise<void> {}

  async queueReadCommand(input: Parameters<AgentBridgeExecutionStore['queueReadCommand']>[0]) {
    if (input.toolId !== 'woocommerce.store.orders.list') return null;
    return this.queueObserved(input, 'READ');
  }

  async queueCommand(input: Parameters<AgentBridgeExecutionStore['queueCommand']>[0]) {
    this.lastQueueInput = input;
    if (input.toolId === 'woocommerce.store.orders.list') {
      return this.queueObserved(input, 'READ');
    }
    if (input.toolId === 'woocommerce.store.orders.update-status') {
      throw new AgentBridgeApprovalSigningUnavailableError();
    }
    return null;
  }

  private queueObserved(
    input: Parameters<AgentBridgeExecutionStore['queueCommand']>[0],
    risk: AgentBridgeQueuedCommand['risk'],
  ): AgentBridgeQueuedCommand {
    this.queued = {
      commandId: 'command-1',
      correlationId: input.correlationId ?? 'correlation-1',
      installationId: input.installationId,
      toolId: input.toolId,
      risk,
      state: 'queued',
      issuedAt: '2026-10-19T13:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      deliveryAttempt: 0,
    };
    return this.queued;
  }

  async pullCommands(session: AgentBridgeRuntimeSession, limit: number) {
    expect(session).toEqual(runtimeSession);
    expect(limit).toBe(10);
    const command: AgentBridgeCommandEnvelope = {
      version: 'kab.command.v1',
      commandId: 'command-1',
      deliveryAttempt: 1,
      tenantId: 'workspace-a',
      installationId: 'installation-1',
      bridgeInstanceId: 'bridge-1',
      correlationId: 'correlation-1',
      actor: 'kairoseth-operator:operator-1',
      toolId: 'woocommerce.store.orders.list',
      input: { perPage: 1 },
      actionFingerprint: 'fingerprint-1',
      issuedAt: '2026-10-19T13:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    return { batchId: 'batch-1', commands: [command] };
  }

  async acknowledgeCommand(
    session: AgentBridgeRuntimeSession,
    acknowledgement: AgentBridgeCommandAcknowledgement,
  ) {
    expect(session).toEqual(runtimeSession);
    this.lastAck = acknowledgement;
    if (this.queued) {
      this.queued = {
        ...this.queued,
        state: 'completed',
        deliveryAttempt: acknowledgement.deliveryAttempt,
        acknowledgement,
      };
    }
    return true;
  }

  async getCommand(tenantId: string, commandId: string) {
    if (tenantId !== 'workspace-a' || commandId !== this.queued?.commandId) return null;
    return this.queued;
  }
}

describe('Agent Bridge execution routes', () => {
  it('queues observed READ commands and keeps mutating commands closed without a signer', async () => {
    const executionStore = new FakeExecutionStore();
    const app = buildApp({
      authProvider,
      agentBridgeControlStore: controlStore,
      agentBridgeExecutionStore: executionStore,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/installations/installation-1/commands',
      headers: { authorization: 'Bearer operator-token' },
      payload: {
        toolId: 'woocommerce.store.orders.list',
        input: { perPage: 1 },
        correlationId: 'correlation-1',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(executionStore.lastQueueInput).toEqual({
      tenantId: 'workspace-a',
      installationId: 'installation-1',
      toolId: 'woocommerce.store.orders.list',
      input: { perPage: 1 },
      actor: 'kairoseth-operator:operator-1',
      createdBy: 'operator-1',
      correlationId: 'correlation-1',
    });
    expect(response.json()).toEqual({
      version: 'kcc.agent-bridge-command.v1',
      command: executionStore.queued,
    });

    const writeAttempt = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/installations/installation-1/commands',
      headers: { authorization: 'Bearer operator-token' },
      payload: {
        toolId: 'woocommerce.store.orders.update-status',
        input: { orderId: 42, status: 'completed' },
      },
    });
    expect(writeAttempt.statusCode).toBe(503);
    expect(writeAttempt.json()).toEqual({ code: 'agent_bridge_mutating_approval_unavailable' });

    const injectedApproval = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/installations/installation-1/commands',
      headers: { authorization: 'Bearer operator-token' },
      payload: {
        toolId: 'woocommerce.store.orders.list',
        input: { perPage: 1 },
        approvalToken: 'must-not-be-accepted',
      },
    });
    expect(injectedApproval.statusCode).toBe(400);

    await app.close();
  });

  it('delivers a session-bound command, accepts its ACK and exposes the result to the operator', async () => {
    const executionStore = new FakeExecutionStore();
    await executionStore.queueReadCommand({
      tenantId: 'workspace-a',
      installationId: 'installation-1',
      toolId: 'woocommerce.store.orders.list',
      input: { perPage: 1 },
      actor: 'kairoseth-operator:operator-1',
      createdBy: 'operator-1',
      correlationId: 'correlation-1',
    });
    const app = buildApp({
      authProvider,
      agentBridgeControlStore: controlStore,
      agentBridgeExecutionStore: executionStore,
    });

    const pull = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/commands/pull',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { sessionId: 'session-1', limit: 10 },
    });
    expect(pull.statusCode).toBe(200);
    expect(pull.json()).toEqual({
      batch: {
        version: 'kab.command-batch.v1',
        batchId: 'batch-1',
        sessionId: 'session-1',
        commands: [
          expect.objectContaining({
            version: 'kab.command.v1',
            commandId: 'command-1',
            toolId: 'woocommerce.store.orders.list',
            deliveryAttempt: 1,
          }),
        ],
      },
    });

    const acknowledgement: AgentBridgeCommandAcknowledgement = {
      version: 'kab.command-ack.v1',
      commandId: 'command-1',
      deliveryAttempt: 1,
      sessionId: 'session-1',
      correlationId: 'correlation-1',
      status: 'executed',
      completedAt: '2026-10-19T13:00:02.000Z',
      output: [{ id: 42, status: 'processing' }],
    };
    const ack = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/commands/ack',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { acknowledgement },
    });
    expect(ack.statusCode).toBe(204);
    expect(executionStore.lastAck).toEqual(acknowledgement);

    const status = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/commands/command-1',
      headers: { authorization: 'Bearer operator-token' },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      version: 'kcc.agent-bridge-command.v1',
      command: {
        commandId: 'command-1',
        correlationId: 'correlation-1',
        installationId: 'installation-1',
        toolId: 'woocommerce.store.orders.list',
        risk: 'READ',
        state: 'completed',
        issuedAt: '2026-10-19T13:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        deliveryAttempt: 1,
        acknowledgement,
      },
    });

    const operatorTokenOnRuntimeRoute = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/commands/pull',
      headers: { authorization: 'Bearer operator-token' },
      payload: { sessionId: 'session-1', limit: 10 },
    });
    expect(operatorTokenOnRuntimeRoute.statusCode).toBe(401);

    await app.close();
  });
});
