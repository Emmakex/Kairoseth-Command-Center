import Fastify from 'fastify';
import type { AuthProvider } from '@kcc/auth';
import type { HealthResponse, ReadyResponse } from '@kcc/contracts';

export type ReadinessCheck = () => Promise<Record<string, 'ok' | 'error' | 'not_configured'>>;

export function buildApp(
  options: { readinessCheck?: ReadinessCheck; logger?: boolean; authProvider?: AuthProvider } = {},
) {
  const app = Fastify({ logger: options.logger ?? false });
  const readinessCheck = options.readinessCheck ?? (async () => ({ process: 'ok' as const }));

  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    service: 'kairoseth-command-center-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async (_request, reply): Promise<ReadyResponse> => {
    const checks = await readinessCheck();
    const ready = Object.values(checks).every((value) => value === 'ok' || value === 'not_configured');

    if (!ready) reply.code(503);

    return {
      status: ready ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/v1/session', async (request, reply) => {
    reply.header('cache-control', 'no-store');

    if (!options.authProvider) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    const session = await options.authProvider.resolveSession({
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
    });

    if (!session) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    return {
      user: session.user,
      activeWorkspaceId: session.activeWorkspaceId ?? null,
      membershipId: session.membershipId ?? null,
      role: session.role ?? null,
      capabilities: session.capabilities,
      productEntitlements: session.productEntitlements,
    };
  });

  return app;
}
