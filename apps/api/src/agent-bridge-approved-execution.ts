import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize, type AuthProvider, type SessionContext } from '@kcc/auth';
import type { AgentBridgeExecutionStore } from './agent-bridge-execution-store';

const MAX_ID = 512;

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

export function registerAgentBridgeApprovedExecutionRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    executionStore?: AgentBridgeExecutionStore;
  },
): void {
  app.post(
    '/v1/products/agent-bridge/installations/:installationId/approved-commands',
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const session = await operatorSession(request, options.authProvider);
      if (!session) return reply.code(401).send({ code: 'unauthorized' });
      if (!session.activeWorkspaceId) {
        return reply.code(400).send({ code: 'workspace_required' });
      }
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
      const ttlSeconds = body?.ttlSeconds === undefined ? undefined : Number(body.ttlSeconds);
      const allowedKeys = new Set(['toolId', 'input', 'correlationId', 'ttlSeconds']);
      if (
        !installationId ||
        !body ||
        !toolId ||
        !Object.prototype.hasOwnProperty.call(body, 'input') ||
        (body.correlationId !== undefined && !correlationId) ||
        (ttlSeconds !== undefined && (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 300)) ||
        Object.keys(body).some((key) => !allowedKeys.has(key))
      ) {
        return reply.code(400).send({ code: 'invalid_agent_bridge_approved_command' });
      }

      try {
        const command = await options.executionStore.queueApprovedCommand({
          tenantId: session.activeWorkspaceId,
          installationId,
          toolId,
          input: body.input,
          actor: `kairoseth-operator:${session.user.id}`,
          createdBy: session.user.id,
          ...(correlationId ? { correlationId } : {}),
          ...(ttlSeconds !== undefined ? { ttlSeconds } : {}),
        });
        if (!command) {
          return reply.code(409).send({ code: 'agent_bridge_mutation_tool_unavailable' });
        }
        return reply.code(201).send({
          version: 'kcc.agent-bridge-command.v1',
          approval: 'signed',
          command,
        });
      } catch (error) {
        request.log.warn({ err: error }, 'Agent Bridge approved command queue rejected input');
        if (error instanceof Error && error.message === 'agent_bridge_approval_unavailable') {
          return reply.code(503).send({ code: 'agent_bridge_approval_unavailable' });
        }
        return reply.code(400).send({ code: 'invalid_agent_bridge_approved_command' });
      }
    },
  );
}
