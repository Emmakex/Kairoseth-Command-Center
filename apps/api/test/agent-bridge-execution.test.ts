import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/application';
import type {
  AgentBridgeControlStore,
  AgentBridgeRuntimeSession,
} from '../src/agent-bridge-control-store';
import type {
  AgentBridgeCommandAcknowledgement,
  AgentBridgeCommandEnvelope,
  AgentBridgeExecutionStore,
  AgentBridgeQueuedCommand,
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
  lastQueueInput: Parameters<AgentBridgeExecutionStore['queueReadCommand']>[0] | null = null;
  lastAck: AgentBridgeCommandAcknowledgement | null = null;
  lastListInput: Parameters<AgentBridgeExecutionStore['listCommands']>[0] | null = null;

  async ensureIndexes(): Promise<void> {}

  async queueReadCommand(input: Parameters<AgentBridgeExecutionStore['queueReadCommand']>[0]) {
    this.lastQueueInput = input;
    if (input.toolId !== 'woocommerce.store.orders.list') return null;
    this.queued = {
      commandId: 'command-1',
      correlationId: input.correlationId ?? 'correlation-1',
      installationId: input.installationId,
      toolId: input.toolId,
      state: 'queued',
      issuedAt: '2026-10-19T13:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      deliveryAttempt: 0,
    };
    return this.queued;
  }

  async queueApprovedCommand(
    _input: Parameters<AgentBridgeExecutionStore['queueApprovedCommand']>[0],
  ) {
    return null;
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

  async listCommands(input: Parameters<AgentBridgeExecutionStore['listCommands']>[0]) {
    this.lastListInput = input;
    if (input.tenantId !== 'workspace-a' || input.installationId !== 'installation-1') {
      return { commands: [] };
    }
    const command: AgentBridgeQueuedCommand = {
      commandId: 'history-command-2',
      correlationId: 'history-correlation-secret',
      installationId: 'installation-1',
      toolId: 'woocommerce.store.orders.list',
      state: 'completed',
      issuedAt: '2026-10-20T07:00:00.000Z',
      expiresAt: '2026-10-20T07:05:00.000Z',
      deliveryAttempt: 1,
      acknowledgement: {
        version: 'kab.command-ack.v1',
        commandId: 'history-command-2',
        deliveryAttempt: 1,
        sessionId: 'history-runtime-session-secret',
        correlationId: 'history-correlation-secret',
        status: 'executed',
        completedAt: '2026-10-20T07:00:01.000Z',
        reason: 'Bearer history-bearer-secret token=history-token-secret',
        output: {
          accessToken: 'history-output-secret',
          value: 42,
        },
      },
    };
    return {
      commands: [command],
      nextCursor: {
        createdAt: '2026-10-20T07:00:00.000Z',
        commandId: 'history-command-2',
      },
    };
  }
}

describe('Agent Bridge execution routes', () => {
  it('queues only an observed READ command for the active workspace without exposing correlation data', async () => {
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
      command: {
        commandId: 'command-1',
        installationId: 'installation-1',
        toolId: 'woocommerce.store.orders.list',
        state: 'queued',
        issuedAt: '2026-10-19T13:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        deliveryAttempt: 0,
      },
    });
    expect(response.body).not.toContain('correlation-1');

    const writeAttempt = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/installations/installation-1/commands',
      headers: { authorization: 'Bearer operator-token' },
      payload: {
        toolId: 'woocommerce.store.orders.update-status',
        input: { orderId: 42, status: 'completed' },
      },
    });
    expect(writeAttempt.statusCode).toBe(409);
    expect(writeAttempt.json()).toEqual({ code: 'agent_bridge_read_tool_unavailable' });

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

  it('delivers a session-bound command, accepts its ACK and exposes only a safe result to the operator', async () => {
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
      reason: 'Remote said Bearer raw-runtime-secret and token=another-secret',
      output: [
        {
          id: 42,
          status: 'processing',
          accessToken: 'must-not-be-visible',
          nested: { password: 'also-must-not-be-visible' },
        },
      ],
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
        installationId: 'installation-1',
        toolId: 'woocommerce.store.orders.list',
        state: 'completed',
        issuedAt: '2026-10-19T13:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        deliveryAttempt: 1,
        acknowledgement: {
          version: 'kab.command-ack.v1',
          commandId: 'command-1',
          deliveryAttempt: 1,
          status: 'executed',
          completedAt: '2026-10-19T13:00:02.000Z',
          reason: 'Remote said Bearer [redacted] and token=[redacted]',
          output: [
            {
              id: 42,
              status: 'processing',
              accessToken: '[redacted]',
              nested: { password: '[redacted]' },
            },
          ],
        },
      },
    });
    expect(status.body).not.toContain('session-1');
    expect(status.body).not.toContain('correlation-1');
    expect(status.body).not.toContain('raw-runtime-secret');
    expect(status.body).not.toContain('another-secret');
    expect(status.body).not.toContain('must-not-be-visible');
    expect(status.body).not.toContain('also-must-not-be-visible');

    const operatorTokenOnRuntimeRoute = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/commands/pull',
      headers: { authorization: 'Bearer operator-token' },
      payload: { sessionId: 'session-1', limit: 10 },
    });
    expect(operatorTokenOnRuntimeRoute.statusCode).toBe(401);

    await app.close();
  });

  it('lists bounded workspace-scoped history with an opaque reusable cursor and safe projection', async () => {
    const executionStore = new FakeExecutionStore();
    const app = buildApp({
      authProvider,
      agentBridgeControlStore: controlStore,
      agentBridgeExecutionStore: executionStore,
    });

    const firstPage = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/installations/installation-1/commands?limit=1',
      headers: { authorization: 'Bearer operator-token' },
    });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.headers['cache-control']).toBe('no-store');
    expect(executionStore.lastListInput).toEqual({
      tenantId: 'workspace-a',
      installationId: 'installation-1',
      limit: 1,
    });
    const body = firstPage.json();
    expect(body.version).toBe('kcc.agent-bridge-command-history.v1');
    expect(body.installationId).toBe('installation-1');
    expect(body.commands).toEqual([
      {
        commandId: 'history-command-2',
        installationId: 'installation-1',
        toolId: 'woocommerce.store.orders.list',
        state: 'completed',
        issuedAt: '2026-10-20T07:00:00.000Z',
        expiresAt: '2026-10-20T07:05:00.000Z',
        deliveryAttempt: 1,
        acknowledgement: {
          version: 'kab.command-ack.v1',
          commandId: 'history-command-2',
          deliveryAttempt: 1,
          status: 'executed',
          completedAt: '2026-10-20T07:00:01.000Z',
          reason: 'Bearer [redacted] token=[redacted]',
          output: {
            accessToken: '[redacted]',
            value: 42,
          },
        },
      },
    ]);
    expect(typeof body.nextCursor).toBe('string');
    expect(firstPage.body).not.toContain('history-correlation-secret');
    expect(firstPage.body).not.toContain('history-runtime-session-secret');
    expect(firstPage.body).not.toContain('history-bearer-secret');
    expect(firstPage.body).not.toContain('history-token-secret');
    expect(firstPage.body).not.toContain('history-output-secret');

    const nextPage = await app.inject({
      method: 'GET',
      url: `/v1/products/agent-bridge/installations/installation-1/commands?limit=1&cursor=${encodeURIComponent(body.nextCursor)}`,
      headers: { authorization: 'Bearer operator-token' },
    });
    expect(nextPage.statusCode).toBe(200);
    expect(executionStore.lastListInput).toEqual({
      tenantId: 'workspace-a',
      installationId: 'installation-1',
      limit: 1,
      before: {
        createdAt: '2026-10-20T07:00:00.000Z',
        commandId: 'history-command-2',
      },
    });

    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/installations/installation-1/commands?cursor=not-a-valid-cursor',
      headers: { authorization: 'Bearer operator-token' },
    });
    expect(invalidCursor.statusCode).toBe(400);

    const excessiveLimit = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/installations/installation-1/commands?limit=51',
      headers: { authorization: 'Bearer operator-token' },
    });
    expect(excessiveLimit.statusCode).toBe(400);

    await app.close();
  });
});
