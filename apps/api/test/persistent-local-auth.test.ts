import { describe, expect, it } from 'vitest';
import type { Membership, User, Workspace } from '@kcc/domain';
import { buildApp } from '../src/application';
import type {
  LocalCredential,
  LocalIdentityRecord,
  LocalIdentityStore,
  LocalMemberSummary,
  PasswordMaterial,
} from '../src/local-identity-store';
import { PersistentLocalAuthProvider } from '../src/persistent-local-auth';

class MemoryIdentityStore implements LocalIdentityStore {
  users = new Map<string, User>();
  workspaces = new Map<string, Workspace>();
  memberships = new Map<string, Membership>();
  credentials = new Map<string, LocalCredential>();

  async ensureIndexes() {}
  async countCredentials() {
    return this.credentials.size;
  }

  async bootstrapOwner(input: {
    user: User;
    workspace: Workspace;
    membership: Membership;
    emailNormalized: string;
    password: PasswordMaterial;
  }) {
    if (this.credentials.size > 0) return false;
    this.users.set(input.user.id, input.user);
    this.workspaces.set(input.workspace.id, input.workspace);
    this.memberships.set(input.membership.id, input.membership);
    const now = new Date().toISOString();
    this.credentials.set(input.user.id, {
      id: `credential:${input.user.id}`,
      userId: input.user.id,
      emailNormalized: input.emailNormalized,
      passwordScheme: input.password.passwordScheme,
      passwordSalt: input.password.passwordSalt,
      passwordHash: input.password.passwordHash,
      passwordVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  }

  private record(userId: string, workspaceId?: string): LocalIdentityRecord | null {
    const user = this.users.get(userId);
    const credential = this.credentials.get(userId);
    const membership = [...this.memberships.values()].find(
      (item) => item.userId === userId && (!workspaceId || item.workspaceId === workspaceId),
    );
    const workspace = membership ? this.workspaces.get(membership.workspaceId) : undefined;
    return user && credential && membership && workspace
      ? { user, credential, membership, workspace }
      : null;
  }

  async findByEmail(emailNormalized: string) {
    const credential = [...this.credentials.values()].find(
      (item) => item.emailNormalized === emailNormalized,
    );
    return credential ? this.record(credential.userId) : null;
  }

  async findBySession(userId: string, workspaceId: string) {
    return this.record(userId, workspaceId);
  }

  async listMembers(workspaceId: string): Promise<LocalMemberSummary[]> {
    return [...this.memberships.values()]
      .filter((membership) => membership.workspaceId === workspaceId)
      .flatMap((membership) => {
        const user = this.users.get(membership.userId);
        return user ? [{ user, membership }] : [];
      });
  }

  async createMember(input: {
    actorUserId: string;
    workspaceId: string;
    emailNormalized: string;
    displayName: string;
    locale: 'es' | 'en';
    timezone: string;
    role: 'admin' | 'member';
    password: PasswordMaterial;
  }): Promise<LocalMemberSummary | null> {
    if (!this.workspaces.has(input.workspaceId)) return null;
    if ([...this.credentials.values()].some((item) => item.emailNormalized === input.emailNormalized)) {
      const error = new Error('duplicate') as Error & { code: number };
      error.code = 11000;
      throw error;
    }
    const now = new Date().toISOString();
    const id = `user-${this.users.size + 1}`;
    const user: User = {
      id,
      email: input.emailNormalized,
      displayName: input.displayName,
      locale: input.locale,
      timezone: input.timezone,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const membership: Membership = {
      id: `membership:${id}:${input.workspaceId}`,
      userId: id,
      workspaceId: input.workspaceId,
      role: input.role,
      capabilities: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    this.memberships.set(membership.id, membership);
    this.credentials.set(id, {
      id: `credential:${id}`,
      userId: id,
      emailNormalized: input.emailNormalized,
      passwordScheme: input.password.passwordScheme,
      passwordSalt: input.password.passwordSalt,
      passwordHash: input.password.passwordHash,
      passwordVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    return { user, membership };
  }

  async updateMember(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    role?: 'admin' | 'member';
    status?: 'active' | 'suspended' | 'disabled';
  }): Promise<LocalMemberSummary | null> {
    const record = this.record(input.userId, input.workspaceId);
    if (!record || record.membership.role === 'owner') return null;
    const now = new Date().toISOString();
    const membership: Membership = {
      ...record.membership,
      ...(input.role ? { role: input.role } : {}),
      updatedAt: now,
    };
    const user: User = {
      ...record.user,
      ...(input.status ? { status: input.status } : {}),
      updatedAt: now,
    };
    this.memberships.set(membership.id, membership);
    this.users.set(user.id, user);
    return { user, membership };
  }

  async updatePassword(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    expectedVersion?: number;
    password: PasswordMaterial;
    eventType: 'local.password_changed' | 'local.password_reset';
  }): Promise<number | null> {
    const record = this.record(input.userId, input.workspaceId);
    if (!record) return null;
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== record.credential.passwordVersion
    ) {
      return null;
    }
    const credential: LocalCredential = {
      ...record.credential,
      passwordScheme: input.password.passwordScheme,
      passwordSalt: input.password.passwordSalt,
      passwordHash: input.password.passwordHash,
      passwordVersion: record.credential.passwordVersion + 1,
      updatedAt: new Date().toISOString(),
    };
    this.credentials.set(input.userId, credential);
    return credential.passwordVersion;
  }
}

const secret = 'persistent-local-auth-test-secret-value-123456789';
const bootstrap = {
  email: 'owner@example.com',
  password: 'correct-horse-battery-staple',
  displayName: 'Local Owner',
  locale: 'es' as const,
  timezone: 'Europe/Madrid',
  userId: 'local-owner',
  workspaceId: 'local-workspace',
  workspaceName: 'Local Workspace',
};

function provider(store: MemoryIdentityStore) {
  return new PersistentLocalAuthProvider(store, { secret, sessionTtlSeconds: 3600 });
}

describe('persistent local authentication', () => {
  it('bootstraps once and survives provider restart without the bootstrap password', async () => {
    const store = new MemoryIdentityStore();
    const first = provider(store);
    expect(await first.initialize(bootstrap)).toEqual({ bootstrapped: true });
    const firstLogin = await first.authenticate(bootstrap.email, bootstrap.password);
    expect(firstLogin?.session.role).toBe('owner');

    const restarted = provider(store);
    expect(await restarted.initialize()).toEqual({ bootstrapped: false });
    const secondLogin = await restarted.authenticate(bootstrap.email, bootstrap.password);
    expect(secondLogin?.session.user.id).toBe('local-owner');
  });

  it('creates a second user and resolves role capabilities from persisted membership', async () => {
    const store = new MemoryIdentityStore();
    const auth = provider(store);
    await auth.initialize(bootstrap);
    const member = await auth.createMember({
      actorUserId: bootstrap.userId,
      workspaceId: bootstrap.workspaceId,
      email: 'member@example.com',
      displayName: 'Member One',
      locale: 'en',
      timezone: 'Europe/Madrid',
      role: 'member',
      password: 'member-password-1234',
    });
    expect(member?.membership.role).toBe('member');
    const login = await auth.authenticate('MEMBER@example.com', 'member-password-1234');
    expect(login?.session.role).toBe('member');
    expect(login?.session.capabilities).toContain('tasks.write');
    expect(login?.session.capabilities).not.toContain('members.manage');
  });

  it('invalidates old tokens immediately after changing the password', async () => {
    const store = new MemoryIdentityStore();
    const auth = provider(store);
    await auth.initialize(bootstrap);
    const login = await auth.authenticate(bootstrap.email, bootstrap.password);
    expect(login).not.toBeNull();

    expect(
      await auth.changePassword({
        actorUserId: bootstrap.userId,
        workspaceId: bootstrap.workspaceId,
        currentPassword: bootstrap.password,
        newPassword: 'new-owner-password-5678',
      }),
    ).toBe(true);

    expect(
      await auth.resolveSession({ authorization: `Bearer ${login?.accessToken ?? ''}` }),
    ).toBeNull();
    expect(await auth.authenticate(bootstrap.email, bootstrap.password)).toBeNull();
    expect(await auth.authenticate(bootstrap.email, 'new-owner-password-5678')).not.toBeNull();
  });

  it('invalidates a target session after admin reset and rejects suspended users', async () => {
    const store = new MemoryIdentityStore();
    const auth = provider(store);
    await auth.initialize(bootstrap);
    const member = await auth.createMember({
      actorUserId: bootstrap.userId,
      workspaceId: bootstrap.workspaceId,
      email: 'member@example.com',
      displayName: 'Member One',
      locale: 'es',
      timezone: 'Europe/Madrid',
      role: 'member',
      password: 'member-password-1234',
    });
    const userId = member?.user.id ?? '';
    const login = await auth.authenticate('member@example.com', 'member-password-1234');
    expect(login).not.toBeNull();

    expect(
      await auth.resetPassword({
        actorUserId: bootstrap.userId,
        workspaceId: bootstrap.workspaceId,
        userId,
        newPassword: 'reset-member-password-5678',
      }),
    ).toBe(true);
    expect(
      await auth.resolveSession({ authorization: `Bearer ${login?.accessToken ?? ''}` }),
    ).toBeNull();

    const newLogin = await auth.authenticate('member@example.com', 'reset-member-password-5678');
    expect(newLogin).not.toBeNull();
    await auth.updateMember({
      actorUserId: bootstrap.userId,
      workspaceId: bootstrap.workspaceId,
      userId,
      status: 'suspended',
    });
    expect(
      await auth.resolveSession({ authorization: `Bearer ${newLogin?.accessToken ?? ''}` }),
    ).toBeNull();
  });

  it('enforces member-management capability and protects the owner at the HTTP boundary', async () => {
    const store = new MemoryIdentityStore();
    const auth = provider(store);
    await auth.initialize(bootstrap);
    const member = await auth.createMember({
      actorUserId: bootstrap.userId,
      workspaceId: bootstrap.workspaceId,
      email: 'member@example.com',
      displayName: 'Member One',
      locale: 'en',
      timezone: 'Europe/Madrid',
      role: 'member',
      password: 'member-password-1234',
    });
    expect(member).not.toBeNull();

    const ownerLogin = await auth.authenticate(bootstrap.email, bootstrap.password);
    const memberLogin = await auth.authenticate('member@example.com', 'member-password-1234');
    expect(ownerLogin).not.toBeNull();
    expect(memberLogin).not.toBeNull();

    const app = buildApp({
      authProvider: auth,
      standaloneAuthProvider: auth,
      localIdentityProvider: auth,
    });

    const denied = await app.inject({
      method: 'GET',
      url: '/v1/auth/local/members',
      headers: { authorization: `Bearer ${memberLogin?.accessToken ?? ''}` },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: 'forbidden' });

    const allowed = await app.inject({
      method: 'GET',
      url: '/v1/auth/local/members',
      headers: { authorization: `Bearer ${ownerLogin?.accessToken ?? ''}` },
    });
    expect(allowed.statusCode).toBe(200);
    expect((allowed.json() as { members: unknown[] }).members).toHaveLength(2);

    const demoteOwner = await app.inject({
      method: 'PATCH',
      url: `/v1/auth/local/members/${bootstrap.userId}`,
      headers: { authorization: `Bearer ${ownerLogin?.accessToken ?? ''}` },
      payload: { role: 'member' },
    });
    expect(demoteOwner.statusCode).toBe(409);
    expect(demoteOwner.json()).toEqual({ error: 'owner_protected' });

    const resetOwner = await app.inject({
      method: 'POST',
      url: `/v1/auth/local/members/${bootstrap.userId}/reset-password`,
      headers: { authorization: `Bearer ${ownerLogin?.accessToken ?? ''}` },
      payload: { newPassword: 'owner-reset-not-allowed-1234' },
    });
    expect(resetOwner.statusCode).toBe(409);
    expect(resetOwner.json()).toEqual({ error: 'owner_protected' });

    const promoteMember = await app.inject({
      method: 'PATCH',
      url: `/v1/auth/local/members/${member?.user.id ?? ''}`,
      headers: { authorization: `Bearer ${ownerLogin?.accessToken ?? ''}` },
      payload: { role: 'admin' },
    });
    expect(promoteMember.statusCode).toBe(200);
    expect(promoteMember.json()).toMatchObject({ member: { role: 'admin' } });

    await app.close();
  });

  it('changes a member password through the API and invalidates the previous session', async () => {
    const store = new MemoryIdentityStore();
    const auth = provider(store);
    await auth.initialize(bootstrap);
    await auth.createMember({
      actorUserId: bootstrap.userId,
      workspaceId: bootstrap.workspaceId,
      email: 'member@example.com',
      displayName: 'Member One',
      locale: 'es',
      timezone: 'Europe/Madrid',
      role: 'member',
      password: 'member-password-1234',
    });
    const memberLogin = await auth.authenticate('member@example.com', 'member-password-1234');
    expect(memberLogin).not.toBeNull();

    const app = buildApp({
      authProvider: auth,
      standaloneAuthProvider: auth,
      localIdentityProvider: auth,
    });

    const changed = await app.inject({
      method: 'POST',
      url: '/v1/auth/local/change-password',
      headers: { authorization: `Bearer ${memberLogin?.accessToken ?? ''}` },
      payload: {
        currentPassword: 'member-password-1234',
        newPassword: 'member-password-5678',
      },
    });
    expect(changed.statusCode).toBe(204);

    const staleSession = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { authorization: `Bearer ${memberLogin?.accessToken ?? ''}` },
    });
    expect(staleSession.statusCode).toBe(401);

    const oldPassword = await app.inject({
      method: 'POST',
      url: '/v1/auth/local/login',
      payload: { email: 'member@example.com', password: 'member-password-1234' },
    });
    expect(oldPassword.statusCode).toBe(401);

    const newPassword = await app.inject({
      method: 'POST',
      url: '/v1/auth/local/login',
      payload: { email: 'member@example.com', password: 'member-password-5678' },
    });
    expect(newPassword.statusCode).toBe(200);
    expect(newPassword.json()).toMatchObject({ role: 'member' });

    await app.close();
  });
});
