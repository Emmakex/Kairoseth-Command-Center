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
export type MilestoneStatus = 'planned' | 'active' | 'done' | 'cancelled';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type AlertSeverity = 'info' | 'warning' | 'urgent' | 'critical';
export type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';
export type DecisionStatus = 'active' | 'superseded' | 'reversed';
export type IntegrationProvider = 'github';
export type IntegrationConnectionStatus = 'unverified' | 'active' | 'disabled' | 'error';
export type ExternalResourceKind =
  | 'repository'
  | 'pull_request'
  | 'issue'
  | 'workflow'
  | 'release';

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
  description?: string;
  status: ProjectStatus;
  progress: number;
  ownerUserId?: string;
  startAt?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  scope: Scope;
  projectId: string;
  title: string;
  status: MilestoneStatus;
  weight: number;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskReminderRule = {
  kind: 'at';
  remindAt: string;
};

export interface Task {
  id: string;
  scope: Scope;
  projectId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: number;
  assigneeIds: string[];
  /**
   * IDs of tasks that must be completed before this task can proceed.
   * Optional for backward compatibility with documents created before dependency support.
   */
  dependencyIds?: string[];
  /**
   * Explicit in-app reminder rules. The first supported rule is a one-time ISO instant.
   * Optional for backward compatibility with documents created before reminder support.
   */
  reminderRules?: TaskReminderRule[];
  dueAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  scope: Scope;
  projectId?: string;
  title: string;
  message?: string;
  severity: AlertSeverity;
  status: AlertStatus;
  fingerprint?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  scope: Extract<Scope, { kind: 'workspace' }>;
  projectId?: string;
  title: string;
  context?: string;
  decision: string;
  status: DecisionStatus;
  madeBy: string;
  madeAt: string;
  supersedesId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  scope: Scope;
  type: string;
  actorUserId?: string;
  entityType: string;
  entityId: string;
  summary: string;
  source: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface IntegrationConnection {
  id: string;
  scope: Extract<Scope, { kind: 'workspace' }>;
  provider: IntegrationProvider;
  displayName: string;
  status: IntegrationConnectionStatus;
  secretRef?: string;
  lastValidatedAt?: string;
  remoteAccountId?: string;
  remoteAccountLabel?: string;
  lastErrorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalResource {
  id: string;
  scope: Extract<Scope, { kind: 'workspace' }>;
  provider: IntegrationProvider;
  kind: ExternalResourceKind;
  externalId: string;
  displayName: string;
  url: string;
  projectId?: string;
  connectionId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TodaySummary {
  openTasks: number;
  dueToday: number;
  blockedTasks: number;
  openAlerts: number;
  urgentAlerts: number;
  activeProjects: number;
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function normalizePriority(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export * from './prioritization.js';
