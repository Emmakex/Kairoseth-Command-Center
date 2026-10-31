import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/application';
import {
  StaticAgentBridgeConsumerAuthProvider,
  parseAgentBridgeConsumerBindings,
} from '../src/agent-bridge-consumer-auth';
import type { AgentBridgeExecutionStore } from '../src/agent-bridge-execution-store';
import type { AgentBridgeToolInventoryStore } from '../src/agent-bridge-tool-inventory-store';

const token = 'ia-empleado-reference-lab-consumer-token';
const tokenSha256 = createHash('sha256').update(token).digest('hex');

function provider(permissions = ['tools.read', 'commands.execute-read', 'commands.read']) {
  return StaticAgentBridgeConsumerAuthProvider.fromJson(
    JSON.stringify([
      {
        consumerId: 'ia-empleado-reference-lab',
        tenantId: 'workspace-reference-lab',
        installationId: 'installation-reference-lab',
        tokenSha256,
        permissions,
      },
    ]),
  );
}

function stores() {
  const getInstallationTools = vi.fn(async (tenantId: string, installationId: string) => ({
    installationId,
    snapshotId: 'snapshot-1',
    generatedAt: '2026-10-31T10:00:00.000Z',
    receivedAt: '2026-10-31T10:00:01.000Z',
    tools: [
      {
        executionToolId: 'woocommerce.store.orders.get',
        name: 'Get order',
        description: 'Read one WooCommerce order',
        risk: 'READ' as const,
        availability: 'available' as const,
        connector: {
          connectorId: 'woocommerce',
          name: 'WooCommerce',
          version: '1',
        },
      },
    ],
  }));
  const queueReadCommand = vi.fn(async (input: Record<string, unknown>) => ({
    commandId: 'command-1',
    correlationId: input.correlationId ?? 'correlation-1',
    installationId: input.installationId,
    toolId: input.toolId,
    state: 'queued' as const,
    issuedAt: '2026-10-31T10:01:00.000Z',
    expiresAt: '2026-10-31T10:06:00.000Z',
    deliveryAttempt: 0,
  }));
  const getCommand = vi.fn(async (tenantId: string, commandId: string) => ({
    commandId,
    correlationId: 'correlation-1',
    installationId: 'installation-reference-lab',
    toolId: 'woocommerce.store.orders.get',
    state: 'completed' as const,
    issuedAt: '2026-10-31T10:01:00.000Z',
    expiresAt: '2026-10-31T10:06:00.000Z',
    deliveryAttempt: 1,
    acknowledgement: {
      version: 'kab.command-ack.v1' as const,
      commandId,
      deliveryAttempt: 1,
      sessionId: 'runtime-session-secret-value',
      correlationId: 'correlation-1',
      status: 'executed' as const,
      completedAt: '2026-10-31T10:01:02.000Z',
      output: { ok: true, body: { id: 42, status: 'processing' } },
    },
  }));

  return {
    toolInventoryStore: { getInstallationTools } as AgentBridgeToolInventoryStore,
    executionStore: { queueReadCommand, getCommand } as unknown as AgentBridgeExecutionStore,
    getInstallationTools,
    queueReadCommand,
    getCommand,
  };
}

describe('Agent Bridge consumer contract', () => {
  it('fails closed when consumer authentication is not configured', async () => {
    const app = buildApp({ logger: false });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/consumer/tools',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: 'agent_bridge_consumer_auth_unavailable' });
    await app.close();
  });

  it('derives tenant and installation exclusively from the bound machine credential', async () => {
    const state = stores();
    const app = buildApp({
      logger: false,
      agentBridgeConsumerAuthProvider: provider(),
      agentBridgeToolInventoryStore: state.toolInventoryStore,
      agentBridgeExecutionStore: state.executionStore,
    });

    const tools = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/consumer/tools',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(tools.statusCode).toBe(200);
    expect(state.getInstallationTools).toHaveBeenCalledWith(
      'workspace-reference-lab',
      'installation-reference-lab',
    );
    expect(tools.json()).toMatchObject({
      version: 'kcc.agent-bridge-consumer-tools.v1',
      consumerId: 'ia-empleado-reference-lab',
      installation: { installationId: 'installation-reference-lab' },
      tools: [{ executionToolId: 'woocommerce.store.orders.get', risk: 'READ' }],
    });
    expect(tools.body).not.toContain('workspace-reference-lab');

    const command = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/consumer/commands',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        toolId: 'woocommerce.store.orders.get',
        input: { orderId: 42 },
        actorReference: 'employee-clara',
        correlationId: 'ia-employee-task-42',
      },
    });
    expect(command.statusCode).toBe(201);
    expect(state.queueReadCommand).toHaveBeenCalledWith({
      tenantId: 'workspace-reference-lab',
      installationId: 'installation-reference-lab',
      toolId: 'woocommerce.store.orders.get',
      input: { orderId: 42 },
      actor: 'kairoseth-consumer:ia-empleado-reference-lab:employee-clara',
      createdBy: 'kairoseth-consumer:ia-empleado-reference-lab',
      correlationId: 'ia-employee-task-42',
    });

    await app.close();
  });

  it('rejects caller-supplied routing authority and keeps command results sanitized', async () => {
    const state = stores();
    const app = buildApp({
      logger: false,
      agentBridgeConsumerAuthProvider: provider(),
      agentBridgeToolInventoryStore: state.toolInventoryStore,
      agentBridgeExecutionStore: state.executionStore,
    });

    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/products/agent-bridge/consumer/commands',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: {
        tenantId: 'other-tenant',
        installationId: 'other-installation',
        toolId: 'woocommerce.store.orders.get',
        input: { orderId: 42 },
        actorReference: 'employee-clara',
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(state.queueReadCommand).not.toHaveBeenCalled();

    const status = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/consumer/commands/command-1',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      command: {
        commandId: 'command-1',
        acknowledgement: {
          status: 'executed',
          output: { ok: true, body: { id: 42, status: 'processing' } },
        },
      },
    });
    expect(status.body).not.toContain('runtime-session-secret-value');
    expect(status.body).not.toContain('correlation-1');

    await app.close();
  });

  it('validates consumer bindings strictly and hashes raw tokens outside configuration', async () => {
    expect(() =>
      parseAgentBridgeConsumerBindings(
        JSON.stringify([
          {
            consumerId: 'ia-empleado',
            tenantId: 'tenant',
            installationId: 'installation',
            tokenSha256: 'not-a-digest',
            permissions: ['tools.read'],
          },
        ]),
      ),
    ).toThrow(/SHA-256/);

    const binding = await provider(['tools.read']).resolveConsumer(token);
    expect(binding).toMatchObject({
      consumerId: 'ia-empleado-reference-lab',
      tenantId: 'workspace-reference-lab',
      installationId: 'installation-reference-lab',
      permissions: ['tools.read'],
    });
    expect(await provider().resolveConsumer('wrong-token')).toBeNull();
  });
});
