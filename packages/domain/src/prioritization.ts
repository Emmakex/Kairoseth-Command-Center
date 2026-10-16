import type { Alert, AlertSeverity, Milestone, Project, Task } from './index.js';

export type OperationalPriorityReasonCode =
  | 'task.manual_priority'
  | 'task.blocked'
  | 'task.overdue'
  | 'task.due_today'
  | 'alert.severity'
  | 'project.blocked'
  | 'project.overdue'
  | 'project.due_today'
  | 'project.remaining_progress'
  | 'milestone.overdue'
  | 'milestone.due_today'
  | 'milestone.weight';

export type OperationalPriorityReason = {
  code: OperationalPriorityReasonCode;
  contribution: number;
  value?: string | number;
};

export type OperationalPriority = {
  kind: 'task' | 'alert' | 'project' | 'milestone';
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

function deadlineState(
  dueAt: string | undefined,
  range: { start: string; end: string },
): 'overdue' | 'today' | 'future' | 'none' {
  if (!dueAt) return 'none';
  const due = Date.parse(dueAt);
  const start = Date.parse(range.start);
  const end = Date.parse(range.end);
  if (!Number.isFinite(due) || !Number.isFinite(start) || !Number.isFinite(end)) return 'none';
  if (due < start) return 'overdue';
  if (due < end) return 'today';
  return 'future';
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

  const deadline = deadlineState(task.dueAt, range);
  if (deadline === 'overdue') reasons.push({ code: 'task.overdue', contribution: 35 });
  if (deadline === 'today') reasons.push({ code: 'task.due_today', contribution: 20 });

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

function projectPriority(
  project: Project,
  range: { start: string; end: string },
): OperationalPriority | null {
  if (project.status === 'done' || project.status === 'archived') return null;

  const reasons: OperationalPriorityReason[] = [];
  if (project.status === 'blocked') reasons.push({ code: 'project.blocked', contribution: 45 });

  const deadline = deadlineState(project.dueAt, range);
  if (deadline === 'overdue') reasons.push({ code: 'project.overdue', contribution: 35 });
  if (deadline === 'today') reasons.push({ code: 'project.due_today', contribution: 20 });

  if ((deadline === 'overdue' || deadline === 'today') && project.progress < 100) {
    const contribution = Math.round((100 - Math.max(0, Math.min(100, project.progress))) * 0.2);
    if (contribution > 0) {
      reasons.push({
        code: 'project.remaining_progress',
        contribution,
        value: project.progress,
      });
    }
  }

  if (reasons.length === 0) return null;
  return {
    kind: 'project',
    id: project.id,
    title: project.name,
    score: clampScore(reasons.reduce((total, reason) => total + reason.contribution, 0)),
    status: project.status,
    reasons,
    projectId: project.id,
    ...(project.dueAt ? { dueAt: project.dueAt } : {}),
  };
}

function milestonePriority(
  milestone: Milestone,
  range: { start: string; end: string },
): OperationalPriority | null {
  if (milestone.status === 'done' || milestone.status === 'cancelled') return null;

  const deadline = deadlineState(milestone.dueAt, range);
  if (deadline !== 'overdue' && deadline !== 'today') return null;

  const reasons: OperationalPriorityReason[] = [];
  if (deadline === 'overdue') reasons.push({ code: 'milestone.overdue', contribution: 40 });
  if (deadline === 'today') reasons.push({ code: 'milestone.due_today', contribution: 25 });

  const normalizedWeight = Math.max(1, Math.min(100, Math.round(milestone.weight)));
  const weightContribution = Math.round(normalizedWeight * 0.2);
  if (weightContribution > 0) {
    reasons.push({
      code: 'milestone.weight',
      contribution: weightContribution,
      value: normalizedWeight,
    });
  }

  return {
    kind: 'milestone',
    id: milestone.id,
    title: milestone.title,
    score: clampScore(reasons.reduce((total, reason) => total + reason.contribution, 0)),
    status: milestone.status,
    reasons,
    projectId: milestone.projectId,
    ...(milestone.dueAt ? { dueAt: milestone.dueAt } : {}),
  };
}

function dueAtSortValue(item: OperationalPriority): number {
  if (!item.dueAt) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(item.dueAt);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

const kindOrder: Record<OperationalPriority['kind'], number> = {
  alert: 0,
  milestone: 1,
  task: 2,
  project: 3,
};

export function rankOperationalPriorities(input: {
  tasks: Task[];
  alerts: Alert[];
  projects?: Project[];
  milestones?: Milestone[];
  range: { start: string; end: string };
  limit?: number;
}): OperationalPriority[] {
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 8)));
  const candidates = [
    ...input.tasks.map((task) => taskPriority(task, input.range)),
    ...input.alerts.map(alertPriority),
    ...(input.projects ?? []).map((project) => projectPriority(project, input.range)),
    ...(input.milestones ?? []).map((milestone) => milestonePriority(milestone, input.range)),
  ].filter((item): item is OperationalPriority => item !== null);

  candidates.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    const dueDelta = dueAtSortValue(left) - dueAtSortValue(right);
    if (dueDelta !== 0) return dueDelta;
    if (left.kind !== right.kind) return kindOrder[left.kind] - kindOrder[right.kind];
    return left.id.localeCompare(right.id);
  });

  return candidates.slice(0, limit);
}
