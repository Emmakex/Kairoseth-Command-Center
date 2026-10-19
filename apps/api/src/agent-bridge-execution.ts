import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize, type AuthProvider, type SessionContext } from '@kcc/auth';
import type { AgentBridgeControlStore, AgentBridgeRuntimeSession } from './agent-bridge-control-store';
import {
  AgentBridgeApprovalSigningUnavailableError,
  type AgentBridgeCommandAcknowledgement,
  type AgentBridgeCommandAckStatus,
  type AgentBridgeCommandOutcomeStatus,
  type AgentBridgeExecutionStore,
} from './agent-bridge-execution-store';

const MAX_ID = 512;
const MAX_REASON = 4096;
const MAX_LIMIT = 100;
const ACK_STATUSES = new Set<AgentBridgeCommandAckStatus>([
  'executed',
  'approval_required',
  'denied',
  'failed',
  'rejected',
  'expired',
  'duplicate',
  'indeterminate',
]);
const OUTCOMES = new Set<AgentBridgeCommandOutcomeStatus>([
  'executed',
  'approval_required',
  'denied',
  'failed',
  'rejected',
  'expired',
]);

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

function timestamp(value: unknown): string | null {
  const parsed = text(value, 64);
  return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
}

function bearer(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization) return null;
  const [scheme, credential] = authorization.trim().split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && credential ? credential : null;
}

async function operatorSession(
  request: FastifyRequest,
  authProvider?: AuthProvider,
): Promise<SessionContext | null> {
  if (!authProvider) return null;
  const authorization = request.headers.authorization;
  const cookie = request.headers.cookie;
  return authProvider.resolveSession({
    ...(authorization ? { authorization } : {}),
    ...(cookie ? { cookie } : {}),
  });
}

async function runtimeSession(
  request: FastifyRequest,
  controlStore?: AgentBridgeControlStore,
): Promise<AgentBridgeRuntimeSession | null> {
  const token = bearer(request);
  return token && controlStore ? controlStore.resolveRuntimeSession(token) : null;
}

function commandAcknowledgement(value: unknown): AgentBridgeCommandAcknowledgement | null {
  const ack = object(value);
  if (!ack) return null;
  const commandId = text(ack.commandId);
  const sessionId = text(ack.sessionId);
  const correlationId = text(ack.correlationId);
  const completedAt = timestamp(ack.completedAt);
  const status = ack.status;
  const deliveryAttempt = ack.deliveryAttempt;
  const reason = ack.reason === undefined ? undefined : text(ack.reason, MAX_REASON);
  const originalOutcome = ack.originalOutcome;

  if (
    ack.version !== 'kab.command-ack.v1' ||
    !commandId ||
    !sessionId ||
    !correlationId ||
    !completedAt ||
    !Number.isInteger(deliveryAttempt) ||
    Number(deliveryAttempt) < 1 ||
    !ACK_STATUSES.has(status as AgentBridgeCommandAckStatus) ||
    (ack.reason !== undefined && !reason) ||
    (originalOutcome !== undefined &&
      !OUTCOMES.has(originalOutcome as AgentBridgeCommandOutcomeStatus))
  ) {
    return null;
  }

  if (status === 'duplicate' && originalOutcome === undefined) return null;
  if (status !== 'duplicate' && originalOutcome !== undefined) return null;

  return {
    version: 'kab.command-ack.v1',
    commandId,
    deliveryAttempt: Number(deliveryAttempt),
    sessionId,
    correlationId,
    status: status as AgentBridgeCommandAckStatus,
    completedAt,
    ...(originalOutcome !== undefined
      ? { originalOutcome: originalOutcome as AgentBridgeCommandOutcomeStatus }
      : {}),
    ...(reason ? { reason } : {}),
    ...(Object.prototype.hasOwnProperty.call(ack, 'output') ? { output: ack.output } : {}),
  };
}

export function registerAgentBridgeExecutionRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    controlStore?: AgentBridgeControlStore;
    executionStore?: AgentBridgeExecutionStore;
  },
): void {
  app.post('/v1/products/agent-bridge/installations/:installationId/commands', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await operatorSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ code: 'unauthorized' });
    if (!session.activeWorkspaceId) return reply.code(400).send({ code: 'workspace_required' });
    if (!authorize(session, { product: 'agent-bridge', capability: 'workspace.manage' })) {
      return reply.code(403).send({ code: 'agent_bridge_forbidden' });
    }
    if (!options.executionStore) {
      return reply.code(503).send({ code: 'agent_bridge_execution_unavailable' });
    }

    const params = object(request.params);
    const body = object(request.body);
    const installationId = text(params?.installationId);
    const toolId = text(body?.toolId);
    const correlationId = body?.correlationId === undefined
      ? undefined
      : text(body.correlationId);
    const allowedKeys = new Set(['toolId', 'input', 'correlationId']);
    if (
      !installationId ||
      !body ||
      !toolId ||
      (body.correlationId !== undefined && !correlationId) ||
      !Object.prototype.hasOwnProperty.call(body, 'input') ||
      Object.keys(body).some((key) => !allowedKeys.has(key))
    ) {
      return reply.code(400).send({ code: 'invalid_agent_bridge_command' });
    }

    try {
      const command = await options.executionStore.queueCommand({
        tenantId: session.activeWorkspaceId,
        installationId,
        toolId,
        input: body.input,
        actor: `kairoseth-operator:${session.user.id}`,
        createdBy: session.user.id,
        ...(correlationId ? { correlationId } : {}),
      });
      if (!command) {
        return reply.code(409).send({ code: 'agent_bridge_tool_unavailable' });
      }
      return reply.code(201).send({
        version: 'kcc.agent-bridge-command.v1',
        command,
      });
    } catch (error) {
      if (error instanceof AgentBridgeApprovalSigningUnavailableError) {
        return reply.code(409).send({ code: 'agent_bridge_read_tool_unavailable' });
      }
      request.log.warn({ err: error }, 'Agent Bridge command queue rejected input');
      return reply.code(400).send({ code: 'invalid_agent_bridge_command' });
    }
  });

  app.get('/v1/products/agent-bridge/commands/:commandId', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await operatorSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ code: 'unauthorized' });
    if (!session.activeWorkspaceId) return reply.code(400).send({ code: 'workspace_required' });
    if (!authorize(session, { product: 'agent-bridge', capability: 'workspace.manage' })) {
      return reply.code(403).send({ code: 'agent_bridge_forbidden' });
    }
    if (!options.executionStore) {
      return reply.code(503).send({ code: 'agent_bridge_execution_unavailable' });
    }
    const params = object(request.params);
    const commandId = text(params?.commandId);
    if (!commandId) return reply.code(400).send({ code: 'invalid_agent_bridge_command_id' });

    const command = await options.executionStore.getCommand(session.activeWorkspaceId, commandId);
    if (!command) return reply.code(404).send({ code: 'agent_bridge_command_not_found' });
    return {
      version: 'kcc.agent-bridge-command.v1',
      command,
    };
  });

  app.post('/api/products/agent-bridge/commands/pull', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await runtimeSession(request, options.controlStore);
    if (!session) return reply.code(401).send({ code: 'invalid_runtime_session' });
    if (!options.executionStore) {
      return reply.code(503).send({ code: 'agent_bridge_execution_unavailable' });
    }
    const body = object(request.body);
    const sessionId = text(body?.sessionId);
    const limit = body?.limit;
    if (
      !sessionId ||
      sessionId !== session.sessionId ||
      !Number.isInteger(limit) ||
      Number(limit) < 1 ||
      Number(limit) > MAX_LIMIT
    ) {
      return reply.code(400).send({ code: 'invalid_command_pull_request' });
    }

    const result = await options.executionStore.pullCommands(session, Number(limit));
    return {
      batch: {
        version: 'kab.command-batch.v1',
        batchId: result.batchId,
        sessionId: session.sessionId,
        commands: result.commands,
      },
    };
  });

  app.post('/api/products/agent-bridge/commands/ack', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await runtimeSession(request, options.controlStore);
    if (!session) return reply.code(401).send({ code: 'invalid_runtime_session' });
    if (!options.executionStore) {
      return reply.code(503).send({ code: 'agent_bridge_execution_unavailable' });
    }
    const body = object(request.body);
    const acknowledgement = commandAcknowledgement(body?.acknowledgement);
    if (!acknowledgement || acknowledgement.sessionId !== session.sessionId) {
      return reply.code(400).send({ code: 'invalid_command_acknowledgement' });
    }

    const accepted = await options.executionStore.acknowledgeCommand(session, acknowledgement);
    if (!accepted) return reply.code(409).send({ code: 'command_acknowledgement_rejected' });
    return reply.code(204).send();
  });
}
