import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize, type AuthProvider, type SessionContext } from '@kcc/auth';
import type { AgentBridgeControlStore } from './agent-bridge-control-store';

async function resolveSession(
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

export function registerAgentBridgeRuntimeObservabilityRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    controlStore?: AgentBridgeControlStore;
  },
): void {
  app.get('/v1/products/agent-bridge/runtime-observability', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ code: 'unauthorized' });
    if (!session.activeWorkspaceId) {
      return reply.code(400).send({ code: 'workspace_required' });
    }
    if (!authorize(session, { product: 'agent-bridge' })) {
      return reply.code(403).send({ code: 'agent_bridge_forbidden' });
    }
    if (!options.controlStore) {
      return reply.code(503).send({ code: 'agent_bridge_runtime_observability_unavailable' });
    }

    try {
      return {
        version: 'kcc.agent-bridge-runtime-observability.v1',
        summary: await options.controlStore.summarizeTenant(session.activeWorkspaceId),
      };
    } catch {
      return reply.code(503).send({ code: 'agent_bridge_runtime_observability_unavailable' });
    }
  });
}
