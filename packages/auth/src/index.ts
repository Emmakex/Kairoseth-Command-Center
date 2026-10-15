import type { Membership, MembershipRole, Scope, User, Workspace } from '@kcc/domain';

export type Capability =
  | 'workspace.manage'
  | 'members.manage'
  | 'projects.read'
  | 'projects.write'
  | 'milestones.read'
  | 'milestones.write'
  | 'tasks.read'
  | 'tasks.write'
  | 'alerts.read'
  | 'alerts.manage'
  | 'decisions.read'
  | 'decisions.write'
  | 'timeline.read'
  | 'integrations.manage'
  | 'automation.manage'
  | 'billing.manage'
  | 'internal.development.read'
  | `products.access:${string}`;

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  locale: 'es' | 'en';
  timezone: string;
}

export interface SessionContext {
  user: AuthenticatedUser;
  activeWorkspaceId?: string;
  membershipId?: string;
  role?: MembershipRole;
  capabilities: string[];
  productEntitlements: string[];
}

export interface AuthProvider {
  name: string;
  resolveSession(input: { authorization?: string; cookie?: string }): Promise<SessionContext | null>;
}

export interface SessionCredentialResolver {
  resolve(credential: string): Promise<SessionContext | null>;
}

const ROLE_CAPABILITIES: Record<Exclude<MembershipRole, 'platform_admin'>, readonly Capability[]> = {
  owner: [
    'workspace.manage',
    'members.manage',
    'projects.read',
    'projects.write',
    'milestones.read',
    'milestones.write',
    'tasks.read',
    'tasks.write',
    'alerts.read',
    'alerts.manage',
    'decisions.read',
    'decisions.write',
    'timeline.read',
    'integrations.manage',
    'automation.manage',
    'billing.manage',
  ],
  admin: [
    'workspace.manage',
    'members.manage',
    'projects.read',
    'projects.write',
    'milestones.read',
    'milestones.write',
    'tasks.read',
    'tasks.write',
    'alerts.read',
    'alerts.manage',
    'decisions.read',
    'decisions.write',
    'timeline.read',
    'integrations.manage',
    'automation.manage',
  ],
  member: [
    'projects.read',
    'milestones.read',
    'tasks.read',
    'tasks.write',
    'alerts.read',
    'decisions.read',
    'timeline.read',
  ],
};

export function buildWorkspaceSession(input: {
  user: User;
  workspace: Workspace;
  membership: Membership;
  productEntitlements?: string[];
}): SessionContext | null {
  const { user, workspace, membership } = input;

  if (user.status !== 'active' || workspace.status !== 'active' || membership.status !== 'active') {
    return null;
  }

  if (membership.userId !== user.id || membership.workspaceId !== workspace.id) {
    return null;
  }

  if (membership.role === 'platform_admin' && workspace.type !== 'kairoseth') {
    return null;
  }

  const presetCapabilities =
    membership.role === 'platform_admin' ? [] : ROLE_CAPABILITIES[membership.role];
  const capabilities = [...new Set([...presetCapabilities, ...membership.capabilities])];

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      timezone: user.timezone,
    },
    activeWorkspaceId: workspace.id,
    membershipId: membership.id,
    role: membership.role,
    capabilities,
    productEntitlements: input.productEntitlements ?? [],
  };
}

export function hasCapability(session: SessionContext, capability: Capability): boolean {
  if (session.role === 'platform_admin') return true;
  return session.capabilities.includes(capability);
}

export function hasProductEntitlement(session: SessionContext, product: string): boolean {
  if (session.role === 'platform_admin') return true;
  return session.productEntitlements.includes(product);
}

export function canAccessScope(session: SessionContext, scope: Scope): boolean {
  if (scope.kind === 'private') {
    return scope.userId === session.user.id;
  }

  return Boolean(session.activeWorkspaceId) && scope.workspaceId === session.activeWorkspaceId;
}

export function authorize(
  session: SessionContext,
  requirement: { scope?: Scope; capability?: Capability; product?: string },
): boolean {
  if (requirement.scope && !canAccessScope(session, requirement.scope)) return false;
  if (requirement.capability && !hasCapability(session, requirement.capability)) return false;
  if (requirement.product && !hasProductEntitlement(session, requirement.product)) return false;
  return true;
}

function bearerCredential(authorization?: string): string | null {
  if (!authorization) return null;
  const [scheme, credential] = authorization.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !credential) return null;
  return credential;
}

export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local';

  constructor(private readonly resolver: SessionCredentialResolver) {}

  async resolveSession(input: { authorization?: string; cookie?: string }): Promise<SessionContext | null> {
    const credential = bearerCredential(input.authorization);
    return credential ? this.resolver.resolve(credential) : null;
  }
}

export class KairosethIdentityProvider implements AuthProvider {
  readonly name = 'kairoseth';

  constructor(private readonly resolver: SessionCredentialResolver) {}

  async resolveSession(input: { authorization?: string; cookie?: string }): Promise<SessionContext | null> {
    const credential = bearerCredential(input.authorization);
    return credential ? this.resolver.resolve(credential) : null;
  }
}
