import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { PersistentLocalAuthProvider } from './persistent-local-auth';

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

function workspaceScope(session: SessionContext) {
  return session.activeWorkspaceId
    ? ({ kind: 'workspace', workspaceId: session.activeWorkspaceId } as const)
    : null;
}

function text(value: unknown, maxLength: number, required = false): string | undefined | null {
  if (value === undefined || value === null || value === '') return required ? null : undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return required ? null : undefined;
  return normalized.length <= maxLength ? normalized : null;
}

function password(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 12 && value.length <= 1024 ? value : null;
}

function duplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000,
  );
}

function memberView(member: Awaited<ReturnType<PersistentLocalAuthProvider['listMembers']>>[number]) {
  return {
    id: member.user.id,
    email: member.user.email,
    displayName: member.user.displayName,
    locale: member.user.locale,
    timezone: member.user.timezone,
    status: member.user.status,
    role: member.membership.role,
    createdAt: member.user.createdAt,
  };
}

export function registerLocalIdentityRoutes(
  app: FastifyInstance,
  options: { authProvider?: AuthProvider; identityProvider?: PersistentLocalAuthProvider },
): void {
  const identityProvider = options.identityProvider;
  if (!identityProvider) return;

  app.post('/v1/auth/local/change-password', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const currentPassword = text(body.currentPassword, 1024, true);
    const newPassword = password(body.newPassword);
    if (!currentPassword || !newPassword) {
      return reply.code(400).send({ error: 'invalid_password_payload' });
    }
    if (currentPassword === newPassword) {
      return reply.code(400).send({ error: 'password_must_change' });
    }
    const changed = await identityProvider.changePassword({
      actorUserId: session.user.id,
      workspaceId: scope.workspaceId,
      currentPassword,
      newPassword,
    });
    if (!changed) return reply.code(401).send({ error: 'invalid_current_password' });
    return reply.code(204).send();
  });

  app.get('/v1/auth/local/members', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!authorize(session, { scope, capability: 'members.manage', product: 'command-center' })) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const members = await identityProvider.listMembers(scope.workspaceId);
    return { members: members.map(memberView) };
  });

  app.post('/v1/auth/local/members', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!authorize(session, { scope, capability: 'members.manage', product: 'command-center' })) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const email = text(body.email, 320, true);
    const displayName = text(body.displayName, 160, true);
    const timezone = text(body.timezone, 120, true);
    const locale = body.locale === 'en' ? 'en' : body.locale === 'es' ? 'es' : null;
    const role = body.role === 'admin' ? 'admin' : body.role === 'member' ? 'member' : null;
    const initialPassword = password(body.password);
    if (!email || !email.includes('@')) return reply.code(400).send({ error: 'invalid_email' });
    if (!displayName) return reply.code(400).send({ error: 'invalid_display_name' });
    if (!timezone) return reply.code(400).send({ error: 'invalid_timezone' });
    if (!locale) return reply.code(400).send({ error: 'invalid_locale' });
    if (!role) return reply.code(400).send({ error: 'invalid_role' });
    if (!initialPassword) return reply.code(400).send({ error: 'invalid_password' });

    try {
      const member = await identityProvider.createMember({
        actorUserId: session.user.id,
        workspaceId: scope.workspaceId,
        email,
        displayName,
        locale,
        timezone,
        role,
        password: initialPassword,
      });
      if (!member) return reply.code(404).send({ error: 'workspace_not_found' });
      return reply.code(201).send({ member: memberView(member) });
    } catch (error) {
      if (duplicateKey(error)) return reply.code(409).send({ error: 'email_already_exists' });
      throw error;
    }
  });

  app.patch('/v1/auth/local/members/:userId', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!authorize(session, { scope, capability: 'members.manage', product: 'command-center' })) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const params = request.params as { userId?: string };
    const userId = text(params.userId, 160, true);
    if (!userId) return reply.code(400).send({ error: 'invalid_user_id' });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const role = body.role === undefined ? undefined : body.role === 'admin' ? 'admin' : body.role === 'member' ? 'member' : null;
    const status =
      body.status === undefined
        ? undefined
        : body.status === 'active' || body.status === 'suspended' || body.status === 'disabled'
          ? body.status
          : null;
    if (role === null) return reply.code(400).send({ error: 'invalid_role' });
    if (status === null) return reply.code(400).send({ error: 'invalid_status' });
    if (!role && !status) return reply.code(400).send({ error: 'no_changes' });

    const members = await identityProvider.listMembers(scope.workspaceId);
    const target = members.find((member) => member.user.id === userId);
    if (!target) return reply.code(404).send({ error: 'member_not_found' });
    if (target.membership.role === 'owner') return reply.code(409).send({ error: 'owner_protected' });

    const member = await identityProvider.updateMember({
      actorUserId: session.user.id,
      workspaceId: scope.workspaceId,
      userId,
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    });
    if (!member) return reply.code(404).send({ error: 'member_not_found' });
    return { member: memberView(member) };
  });

  app.post('/v1/auth/local/members/:userId/reset-password', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!authorize(session, { scope, capability: 'members.manage', product: 'command-center' })) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const params = request.params as { userId?: string };
    const userId = text(params.userId, 160, true);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const newPassword = password(body.newPassword);
    if (!userId) return reply.code(400).send({ error: 'invalid_user_id' });
    if (!newPassword) return reply.code(400).send({ error: 'invalid_password' });

    const members = await identityProvider.listMembers(scope.workspaceId);
    const target = members.find((member) => member.user.id === userId);
    if (!target) return reply.code(404).send({ error: 'member_not_found' });
    if (target.membership.role === 'owner') return reply.code(409).send({ error: 'owner_protected' });

    const changed = await identityProvider.resetPassword({
      actorUserId: session.user.id,
      workspaceId: scope.workspaceId,
      userId,
      newPassword,
    });
    if (!changed) return reply.code(404).send({ error: 'member_not_found' });
    return reply.code(204).send();
  });
}
