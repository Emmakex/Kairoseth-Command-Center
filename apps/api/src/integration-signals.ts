import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope } from '@kcc/domain';
import type { IntegrationSignalType } from '@kcc/integrations';
import type { IntegrationSignalStore } from '@kcc/persistence/integration-signals';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

const signalTypes = new Set<IntegrationSignalType>([
  'repository.commit',
  'repository.pull_request',
  'repository.issue',
  'repository.ci',
  'repository.release',
  'calendar.event',
  'generic.webhook',
]);

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

function workspaceScope(session: SessionContext): WorkspaceScope | null {
  return session.activeWorkspaceId
    ? { kind: 'workspace', workspaceId: session.activeWorkspaceId }
    : null;
}

function canReadSignals(session: SessionContext, scope: WorkspaceScope): boolean {
  return authorize(session, {
    scope,
    capability: 'projects.read',
    product: 'command-center',
  });
}

function optionalText(value: unknown, maxLength = 200): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function historyLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 50;
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return null;
  return parsed;
}

function parseTypes(value: unknown): IntegrationSignalType[] | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const parsed = raw
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((item) => item.trim())
    .filter(Boolean);
  if (parsed.length === 0 || parsed.length > signalTypes.size) return null;
  const unique = [...new Set(parsed)];
  if (!unique.every((item) => signalTypes.has(item as IntegrationSignalType))) return null;
  return unique as IntegrationSignalType[];
}

export function registerIntegrationSignalRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    integrationSignalStore?: IntegrationSignalStore;
  },
): void {
  app.get('/v1/integrations/signals', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    if (!options.integrationSignalStore) {
      return reply.code(503).send({ error: 'integration_signal_store_unavailable' });
    }

    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canReadSignals(session, scope)) return reply.code(403).send({ error: 'forbidden' });

    const query = request.query as {
      resourceId?: unknown;
      projectId?: unknown;
      type?: unknown;
      limit?: unknown;
    };
    const resourceId = optionalText(query.resourceId);
    const projectId = optionalText(query.projectId);
    const types = parseTypes(query.type);
    const limit = historyLimit(query.limit);
    if (resourceId === null) return reply.code(400).send({ error: 'invalid_resource_id' });
    if (projectId === null) return reply.code(400).send({ error: 'invalid_project_id' });
    if (types === null) return reply.code(400).send({ error: 'invalid_signal_type' });
    if (!limit) return reply.code(400).send({ error: 'invalid_limit' });

    const signals = await options.integrationSignalStore.listSignals({
      workspaceId: scope.workspaceId,
      ...(resourceId ? { resourceId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(types ? { types } : {}),
      limit,
    });
    return { signals };
  });
}
