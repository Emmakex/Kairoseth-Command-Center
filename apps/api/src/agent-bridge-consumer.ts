import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
  AgentBridgeConsumerAuthProvider,
  AgentBridgeConsumerBinding,
  AgentBridgeConsumerPermission,
} from './agent-bridge-consumer-auth';
import { projectAgentBridgeOperatorCommand } from './agent-bridge-command-projection';
import type { AgentBridgeExecutionStore } from './agent-bridge-execution-store';
import type { AgentBridgeToolInventoryStore } from './agent-bridge-tool-inventory-store';

const MAX_ID = 512;
const MAX_ACTOR_REFERENCE = 160;

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = MAX_ID): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > max) return null;
  for (const character of normalized) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return null;
  }
  return normalized;
}

function bearer(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization) return null;
  const [scheme, credential] = authorization.trim().split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && credential ? credential : null;
}

async function consumerBinding(
  request: FastifyRequest,
  provider?: AgentBridgeConsumerAuthProvider,
): Promise<{ binding: AgentBridgeConsumerBinding | null; unavailable: boolean }> {
  if (!provider) return { binding: null, unavailable: true };
  const accessToken = bearer(request);
  if (!accessToken) return { binding: null, unavailable: false };
  return { binding: await provider.resolveConsumer(accessToken), unavailable: false };
}

function permitted(
  binding: AgentBridgeConsumerBinding,
  permission: AgentBridgeConsumerPermission,
): boolean {
  return binding.permissions.includes(permission);
}

export function registerAgentBridgeConsumerRoutes(
  app: FastifyInstance,
  options: {
    consumerAuthProvider?: AgentBridgeConsumerAuthProvider;
    executionStore?: AgentBridgeExecutionStore;
    toolInventoryStore?: AgentBridgeToolInventoryStore;
  },
): void {
  app.get('/v1/products/agent-bridge/consumer/tools', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await consumerBinding(request, options.consumerAuthProvider);
    if (auth.unavailable) {
      return reply.code(503).send({ code: 'agent_bridge_consumer_auth_unavailable' });
    }
    if (!auth.binding) return reply.code(401).send({ code: 'unauthorized' });
    if (!permitted(auth.binding, 'tools.read')) {
      return reply.code(403).send({ code: 'agent_bridge_consumer_forbidden' });
    }
    if (!options.toolInventoryStore) {
      return reply.code(503).send({ code: 'agent_bridge_tool_inventory_unavailable' });
    }

    try {
      const inventory = await options.toolInventoryStore.getInstallationTools(
        auth.binding.tenantId,
        auth.binding.installationId,
      );
      if (!inventory) {
        return reply.code(404).send({ code: 'agent_bridge_tool_inventory_not_found' });
      }
      return {
        version: 'kcc.agent-bridge-consumer-tools.v1',
        consumerId: auth.binding.consumerId,
        installation: {
          installationId: inventory.installationId,
          snapshotId: inventory.snapshotId,
          generatedAt: inventory.generatedAt,
          receivedAt: inventory.receivedAt,
        },
        tools: inventory.tools,
      };
    } catch {
      return reply.code(503).send({ code: 'agent_bridge_tool_inventory_unavailable' });
    }
  });

  app.post('/v1/products/agent-bridge/consumer/commands', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await consumerBinding(request, options.consumerAuthProvider);
    if (auth.unavailable) {
      return reply.code(503).send({ code: 'agent_bridge_consumer_auth_unavailable' });
    }
    if (!auth.binding) return reply.code(401).send({ code: 'unauthorized' });
    if (!permitted(auth.binding, 'commands.execute-read')) {
      return reply.code(403).send({ code: 'agent_bridge_consumer_forbidden' });
    }
    if (!options.executionStore) {
      return reply.code(503).send({ code: 'agent_bridge_execution_unavailable' });
    }

    const body = object(request.body);
    const toolId = text(body?.toolId);
    const actorReference = text(body?.actorReference, MAX_ACTOR_REFERENCE);
    const correlationId = body?.correlationId === undefined
      ? undefined
      : text(body.correlationId);
    const allowedKeys = new Set(['toolId', 'input', 'actorReference', 'correlationId']);
    if (
      !body ||
      !toolId ||
      !actorReference ||
      !Object.prototype.hasOwnProperty.call(body, 'input') ||
      (body.correlationId !== undefined && !correlationId) ||
      Object.keys(body).some((key) => !allowedKeys.has(key))
    ) {
      return reply.code(400).send({ code: 'invalid_agent_bridge_consumer_command' });
    }

    try {
      const actor = `kairoseth-consumer:${auth.binding.consumerId}:${actorReference}`;
      const command = await options.executionStore.queueReadCommand({
        tenantId: auth.binding.tenantId,
        installationId: auth.binding.installationId,
        toolId,
        input: body.input,
        actor,
        createdBy: `kairoseth-consumer:${auth.binding.consumerId}`,
        ...(correlationId ? { correlationId } : {}),
      });
      if (!command) {
        return reply.code(409).send({ code: 'agent_bridge_read_tool_unavailable' });
      }
      return reply.code(201).send({
        version: 'kcc.agent-bridge-consumer-command.v1',
        consumerId: auth.binding.consumerId,
        command: projectAgentBridgeOperatorCommand(command),
      });
    } catch (error) {
      request.log.warn({ err: error }, 'Agent Bridge consumer command queue rejected input');
      return reply.code(400).send({ code: 'invalid_agent_bridge_consumer_command' });
    }
  });

  app.get('/v1/products/agent-bridge/consumer/commands/:commandId', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const auth = await consumerBinding(request, options.consumerAuthProvider);
    if (auth.unavailable) {
      return reply.code(503).send({ code: 'agent_bridge_consumer_auth_unavailable' });
    }
    if (!auth.binding) return reply.code(401).send({ code: 'unauthorized' });
    if (!permitted(auth.binding, 'commands.read')) {
      return reply.code(403).send({ code: 'agent_bridge_consumer_forbidden' });
    }
    if (!options.executionStore) {
      return reply.code(503).send({ code: 'agent_bridge_execution_unavailable' });
    }

    const params = object(request.params);
    const commandId = text(params?.commandId);
    if (!commandId) return reply.code(400).send({ code: 'invalid_agent_bridge_command_id' });

    const command = await options.executionStore.getCommand(auth.binding.tenantId, commandId);
    if (!command || command.installationId !== auth.binding.installationId) {
      return reply.code(404).send({ code: 'agent_bridge_command_not_found' });
    }
    return {
      version: 'kcc.agent-bridge-consumer-command.v1',
      consumerId: auth.binding.consumerId,
      command: projectAgentBridgeOperatorCommand(command),
    };
  });
}
