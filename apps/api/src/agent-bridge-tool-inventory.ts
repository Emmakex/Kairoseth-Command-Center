import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize, type AuthProvider, type SessionContext } from '@kcc/auth';
import type { AgentBridgeToolInventoryStore } from './agent-bridge-tool-inventory-store';

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

export function registerAgentBridgeToolInventoryRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    toolInventoryStore?: AgentBridgeToolInventoryStore;
  },
): void {
  app.get(
    '/v1/products/agent-bridge/installations/:installationId/tools',
    async (request, reply) => {
      reply.header('cache-control', 'no-store');
      const session = await resolveSession(request, options.authProvider);
      if (!session) return reply.code(401).send({ code: 'unauthorized' });
      if (!session.activeWorkspaceId) {
        return reply.code(400).send({ code: 'workspace_required' });
      }
      if (!authorize(session, { product: 'agent-bridge', capability: 'workspace.manage' })) {
        return reply.code(403).send({ code: 'agent_bridge_forbidden' });
      }
      if (!options.toolInventoryStore) {
        return reply.code(503).send({ code: 'agent_bridge_tool_inventory_unavailable' });
      }

      const params = object(request.params);
      const installationId = text(params?.installationId);
      if (!installationId) {
        return reply.code(400).send({ code: 'invalid_agent_bridge_installation_id' });
      }

      try {
        const inventory = await options.toolInventoryStore.getInstallationTools(
          session.activeWorkspaceId,
          installationId,
        );
        if (!inventory) {
          return reply.code(404).send({ code: 'agent_bridge_tool_inventory_not_found' });
        }
        return {
          version: 'kcc.agent-bridge-tool-inventory.v1',
          inventory,
        };
      } catch {
        return reply.code(503).send({ code: 'agent_bridge_tool_inventory_unavailable' });
      }
    },
  );
}
