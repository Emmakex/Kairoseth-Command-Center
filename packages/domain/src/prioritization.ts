import type { Alert, AlertSeverity, Task } from './index.js';

export type OperationalPriorityReasonCode =
  | 'task.manual_priority'
  | 'task.blocked'
  | 'task.overdue'
  | 'task.due_today'
  | 'alert.severity';

export type OperationalPriorityReason = {
  code: OperationalPriorityReasonCode;
  contribution: number;
  value?: string | number;
};

export type OperationalPriority = {
  kind: 'task' | 'alert';
  id: string;
  title: string;
  score: number;
  status: string;
  reasons: OperationalPriorityReason[];
  projectId?: string;
  dueAt?: string;
  severity?: AlertSeverity;
};

const alertSeverityScore: Record<AlertSeverity, number> = {
  info: 30,
  warning: 60,
  urgent: 90,
  critical: 100,
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function taskPriority(task: Task, range: { start: string; end: string }): OperationalPriority | null {
  if (task.status === 'done' || task.status === 'cancelled') return null;

  const reasons: OperationalPriorityReason[] = [];
  const manualContribution = Math.round(Math.max(0, Math.min(100, task.priority)) * 0.5);
  if (manualContribution > 0) {
    reasons.push({
      code: 'task.manual_priority',
      contribution: manualContribution,
      value: task.priority,
    });
  }

  if (task.status === 'blocked') {
    reasons.push({ code: 'task.blocked', contribution: 30 });
  }

  if (task.dueAt) {
    const dueAt = Date.parse(task.dueAt);
    const start = Date.parse(range.start);
    const end = Date.parse(range.end);
    if (Number.isFinite(dueAt) && Number.isFinite(start) && Number.isFinite(end)) {
      if (dueAt < start) reasons.push({ code: 'task.overdue', contribution: 35 });
      else if (dueAt < end) reasons.push({ code: 'task.due_today', contribution: 20 });
    }
  }

  const score = clampScore(reasons.reduce((total, reason) => total + reason.contribution, 0));
  return {
    kind: 'task',
    id: task.id,
    title: task.title,
    score,
    status: task.status,
    reasons,
    ...(task.projectId ? { projectId: task.projectId } : {}),
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
  };
}

function alertPriority(alert: Alert): OperationalPriority | null {
  if (alert.status !== 'open' && alert.status !== 'acknowledged') return null;
  const contribution = alertSeverityScore[alert.severity];
  return {
    kind: 'alert',
    id: alert.id,
    title: alert.title,
    score: contribution,
    status: alert.status,
    severity: alert.severity,
    reasons: [{ code: 'alert.severity', contribution, value: alert.severity }],
    ...(alert.projectId ? { projectId: alert.projectId } : {}),
  };
}

function dueAtSortValue(item: OperationalPriority): number {
  if (!item.dueAt) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(item.dueAt);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function rankOperationalPriorities(input: {
  tasks: Task[];
  alerts: Alert[];
  range: { start: string; end: string };
  limit?: number;
}): OperationalPriority[] {
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 8)));
  const candidates = [
    ...input.tasks.map((task) => taskPriority(task, input.range)),
    ...input.alerts.map(alertPriority),
  ].filter((item): item is OperationalPriority => item !== null);

  candidates.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    const dueDelta = dueAtSortValue(left) - dueAtSortValue(right);
    if (dueDelta !== 0) return dueDelta;
    if (left.kind !== right.kind) return left.kind === 'alert' ? -1 : 1;
    return left.id.localeCompare(right.id);
  });

  return candidates.slice(0, limit);
}
