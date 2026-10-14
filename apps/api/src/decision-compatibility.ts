import type { FastifyInstance } from 'fastify';

export function registerDecisionCompatibilityGuard(app: FastifyInstance): void {
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST' || request.routeOptions.url !== '/v1/decisions') return;

    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.projectId !== undefined || body.supersedesId !== undefined) {
      return reply.code(409).send({ error: 'decision_lifecycle_required' });
    }
  });
}
