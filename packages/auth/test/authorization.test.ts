import { describe, expect, it } from 'vitest';
import type { Membership, User, Workspace } from '@kcc/domain';
import {
  authorize,
  buildWorkspaceSession,
  canAccessScope,
  hasCapability,
  hasProductEntitlement,
} from '../src/index';

const user: User = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User One',
  locale: 'es',
  timezone: 'Europe/Madrid',
  status: 'active',
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z',
};

const workspace: Workspace = {
  id: 'workspace-a',
  name: 'Workspace A',
  slug: 'workspace-a',
  type: 'organization',
  status: 'active',
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z',
};

const membership: Membership = {
  id: 'membership-1',
  userId: user.id,
  workspaceId: workspace.id,
  role: 'admin',
  capabilities: [],
  status: 'active',
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T00:00:00.000Z',
};

describe('authorization boundaries', () => {
  it('builds an active workspace session with role capabilities', () => {
    const session = buildWorkspaceSession({
      user,
      workspace,
      membership,
      productEntitlements: ['command-center'],
    });

    expect(session).not.toBeNull();
    expect(hasCapability(session!, 'tasks.write')).toBe(true);
    expect(hasCapability(session!, 'billing.manage')).toBe(false);
    expect(hasProductEntitlement(session!, 'command-center')).toBe(true);
  });

  it('denies cross-tenant workspace scope even to an admin', () => {
    const session = buildWorkspaceSession({ user, workspace, membership })!;

    expect(canAccessScope(session, { kind: 'workspace', workspaceId: 'workspace-b' })).toBe(false);
    expect(
      authorize(session, {
        scope: { kind: 'workspace', workspaceId: 'workspace-b' },
        capability: 'tasks.write',
      }),
    ).toBe(false);
  });

  it('keeps private content bound to the owning user', () => {
    const session = buildWorkspaceSession({ user, workspace, membership })!;

    expect(canAccessScope(session, { kind: 'private', userId: user.id })).toBe(true);
    expect(canAccessScope(session, { kind: 'private', userId: 'another-user' })).toBe(false);
  });

  it('rejects platform_admin outside a Kairoseth workspace', () => {
    expect(
      buildWorkspaceSession({
        user,
        workspace,
        membership: { ...membership, role: 'platform_admin' },
      }),
    ).toBeNull();
  });

  it('rejects suspended memberships', () => {
    expect(
      buildWorkspaceSession({
        user,
        workspace,
        membership: { ...membership, status: 'suspended' },
      }),
    ).toBeNull();
  });
});
