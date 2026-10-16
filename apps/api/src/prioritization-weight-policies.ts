import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { defaultPrioritizationWeights, type PrioritizationWeights, type Scope } from '@kcc/domain';
import type { PrioritizationWeightPolicyStore } from '@kcc/persistence/prioritization-weight-policies';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

const WEIGHT_KEYS = Object.keys(defaultPrioritizationWeights()) as (keyof PrioritizationWeights)[];
const WEIGHT_KEY_SET = new Set<string>(WEIGHT_KEYS);

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

function canManageAutomation(session: SessionContext, scope: WorkspaceScope): boolean {
  return authorize(session, {
    scope,
    capability: 'automation.manage',
    product: 'command-center',
  });
}

function parseWeightPatch(value: unknown): Partial<PrioritizationWeights> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some((key) => !WEIGHT_KEY_SET.has(key))) return null;

  const patch: Partial<PrioritizationWeights> = {};
  for (const key of keys as (keyof PrioritizationWeights)[]) {
    const weight = record[key];
    if (!Number.isInteger(weight) || (weight as number) < 0 || (weight as number) > 100) return null;
    patch[key] = weight as number;
  }
  return patch;
}

export function registerPrioritizationWeightPolicyRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    prioritizationWeightPolicyStore?: PrioritizationWeightPolicyStore;
  },
): void {
  app.get('/v1/prioritization/weights', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageAutomation(session, scope)) return reply.code(403).send({ error: 'forbidden' });
    if (!options.prioritizationWeightPolicyStore) {
      return reply.code(503).send({ error: 'prioritization_weight_policy_store_unavailable' });
    }

    const policy = await options.prioritizationWeightPolicyStore.getEffective(scope.workspaceId);
    return { policy };
  });

  app.patch('/v1/prioritization/weights', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageAutomation(session, scope)) return reply.code(403).send({ error: 'forbidden' });
    if (!options.prioritizationWeightPolicyStore) {
      return reply.code(503).send({ error: 'prioritization_weight_policy_store_unavailable' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== 'weights')) {
      return reply.code(400).send({ error: 'invalid_prioritization_weight_policy' });
    }
    const patch = parseWeightPatch(body.weights);
    if (!patch) return reply.code(400).send({ error: 'invalid_prioritization_weight_policy' });

    const current = await options.prioritizationWeightPolicyStore.getEffective(scope.workspaceId);
    const weights: PrioritizationWeights = { ...current.weights, ...patch };
    const stored = await options.prioritizationWeightPolicyStore.upsert({
      workspaceId: scope.workspaceId,
      actorUserId: session.user.id,
      weights,
    });

    return {
      policy: {
        weights: stored.weights,
        overridden: true,
        updatedAt: stored.updatedAt,
      },
    };
  });
}
