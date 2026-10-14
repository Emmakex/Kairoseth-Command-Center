export type Scope =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'private'; userId: string }
  | { kind: 'system'; workspaceId: string; source: string };

export type ProjectStatus = 'planned' | 'active' | 'blocked' | 'done' | 'archived';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
export type AlertSeverity = 'info' | 'warning' | 'urgent' | 'critical';

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
