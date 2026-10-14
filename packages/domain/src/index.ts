export type Scope =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'private'; userId: string }
  | { kind: 'system'; workspaceId: string; source: string };

export type UserStatus = 'invited' | 'active' | 'suspended' | 'disabled';
export type WorkspaceType = 'organization' | 'personal' | 'kairoseth';
export type WorkspaceStatus = 'active' | 'suspended' | 'archived';
export type MembershipRole = 'platform_admin' | 'owner' | 'admin' | 'member';
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked';
export type ProjectStatus = 'planned' | 'active' | 'blocked' | 'done' | 'archived';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type AlertSeverity = 'info' | 'warning' | 'urgent' | 'critical';

export interface User {
  id: string;
  email: string;
  displayName: string;
  locale: 'es' | 'en';
  timezone: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: WorkspaceType;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  workspaceId: string;
  role: MembershipRole;
  capabilities: string[];
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  scope: Scope;
  name: string;
  status: ProjectStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  scope: Scope;
  projectId?: string;
  title: string;
  status: TaskStatus;
  priority: number;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  scope: Scope;
  title: string;
  severity: AlertSeverity;
  acknowledgedAt?: string;
  createdAt: string;
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
