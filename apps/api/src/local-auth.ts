import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthProvider } from '@kcc/auth';
import { LocalAuthError } from '@kcc/local-auth';
import type { LocalAuthService } from '@kcc/local-auth';

function nonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function bearerCredential(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization) return null;
  const [scheme, credential] = authorization.trim().split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && credential ? credential : null;
}

export function registerLocalAuthRoutes(
  app: FastifyInstance,
  options: { authProvider?: AuthProvider; localAuthService?: LocalAuthService },
): void {
  app.get('/v1/local-auth/bootstrap/status', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.localAuthService) {
      return reply.code(503).send({ error: 'local_auth_unavailable' });
    }
    return options.localAuthService.getBootstrapStatus();
  });

  app.post('/v1/local-auth/bootstrap', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.localAuthService) {
      return reply.code(503).send({ error: 'local_auth_unavailable' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const bootstrapSecret = nonEmptyString(body.bootstrapSecret, 512);
    const email = nonEmptyString(body.email, 254);
    const displayName = nonEmptyString(body.displayName, 160);
    const workspaceName = nonEmptyString(body.workspaceName, 160);
    if (!bootstrapSecret) return reply.code(400).send({ error: 'invalid_bootstrap_secret' });
    if (!email) return reply.code(400).send({ error: 'invalid_email' });
    if (!displayName) return reply.code(400).send({ error: 'invalid_display_name' });
    if (!workspaceName) return reply.code(400).send({ error: 'invalid_workspace_name' });

    const workspaceSlug = optionalString(body.workspaceSlug, 80);
    const timezone = optionalString(body.timezone, 100);
    const locale = body.locale === 'en' ? 'en' : body.locale === 'es' || body.locale === undefined ? 'es' : null;
    if (!locale) return reply.code(400).send({ error: 'invalid_locale' });

    try {
      const result = await options.localAuthService.bootstrap({
        bootstrapSecret,
        email,
        displayName,
        workspaceName,
        locale,
        ...(workspaceSlug ? { workspaceSlug } : {}),
        ...(timezone ? { timezone } : {}),
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (!(error instanceof LocalAuthError)) throw error;
      if (error.code === 'invalid_bootstrap_secret') {
        return reply.code(403).send({ error: error.code });
      }
      if (error.code === 'already_initialized') {
        return reply.code(409).send({ error: error.code });
      }
      if (error.code === 'bootstrap_not_configured') {
        return reply.code(503).send({ error: error.code });
      }
      return reply.code(400).send({ error: error.code });
    }
  });

  app.post('/v1/local-auth/logout', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.localAuthService || !options.authProvider) {
      return reply.code(503).send({ error: 'local_auth_unavailable' });
    }

    const credential = bearerCredential(request);
    if (!credential) return reply.code(401).send({ error: 'unauthorized' });
    const session = await options.authProvider.resolveSession({ authorization: `Bearer ${credential}` });
    if (!session) return reply.code(401).send({ error: 'unauthorized' });

    await options.localAuthService.revokeCredential(credential);
    return reply.code(204).send();
  });
}
