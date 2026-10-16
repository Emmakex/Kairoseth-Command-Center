import type { Alert, AlertSeverity, Milestone, Project, Task } from './index.js';

export type OperationalPriorityReasonCode =
  | 'task.manual_priority'
  | 'task.blocked'
  | 'task.dependency_impact'
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

export type PrioritizationWeights = {
  taskManualPriorityMax: number;
  taskBlocked: number;
  taskDependencyImpactPerDependent: number;
  taskOverdue: number;
  taskDueToday: number;
  alertInfo: number;
  alertWarning: number;
  alertUrgent: number;
  alertCritical: number;
  projectBlocked: number;
  projectOverdue: number;
  projectDueToday: number;
  projectRemainingProgressMax: number;
  milestoneOverdue: number;
  milestoneDueToday: number;
  milestoneWeightMax: number;
};

export const DEFAULT_PRIORITIZATION_WEIGHTS: Readonly<PrioritizationWeights> = Object.freeze({
  taskManualPriorityMax: 50,
  taskBlocked: 30,
  taskDependencyImpactPerDependent: 10,
  taskOverdue: 35,
  taskDueToday: 20,
  alertInfo: 30,
  alertWarning: 60,
  alertUrgent: 90,
  alertCritical: 100,
  projectBlocked: 45,
  projectOverdue: 35,
  projectDueToday: 20,
  projectRemainingProgressMax: 20,
  milestoneOverdue: 40,
  milestoneDueToday: 25,
  milestoneWeightMax: 20,
});

export function defaultPrioritizationWeights(): PrioritizationWeights {
  return { ...DEFAULT_PRIORITIZATION_WEIGHTS };
}

function effectiveWeights(overrides?: Partial<PrioritizationWeights>): PrioritizationWeights {
  return { ...DEFAULT_PRIORITIZATION_WEIGHTS, ...(overrides ?? {}) };
}

function alertSeverityScore(
  severity: AlertSeverity,
  weights: PrioritizationWeights,
): number {
  if (severity === 'critical') return weights.alertCritical;
  if (severity === 'urgent') return weights.alertUrgent;
  if (severity === 'warning') return weights.alertWarning;
  return weights.alertInfo;
}

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

function activeTask(task: Task): boolean {
  return task.status !== 'done' && task.status !== 'cancelled';
}

export function activeDependencyImpactCounts(tasks: Task[]): Map<string, number> {
  const knownIds = new Set(tasks.map((task) => task.id));
  const dependents = new Map<string, Set<string>>();

  for (const task of tasks) {
    if (!activeTask(task)) continue;
    for (const dependencyId of task.dependencyIds ?? []) {
      if (!knownIds.has(dependencyId) || dependencyId === task.id) continue;
      const current = dependents.get(dependencyId) ?? new Set<string>();
      current.add(task.id);
      dependents.set(dependencyId, current);
    }
  }

  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (!activeTask(task)) {
      counts.set(task.id, 0);
      continue;
    }

    const visited = new Set<string>([task.id]);
    const queue = [...(dependents.get(task.id) ?? [])];
    while (queue.length > 0) {
      const dependentId = queue.shift();
      if (!dependentId || visited.has(dependentId)) continue;
      visited.add(dependentId);
      for (const nestedId of dependents.get(dependentId) ?? []) {
        if (!visited.has(nestedId)) queue.push(nestedId);
      }
    }
    counts.set(task.id, visited.size - 1);
  }

  return counts;
}

function taskPriority(
  task: Task,
  range: { start: string; end: string },
  weights: PrioritizationWeights,
  activeDependentCount: number,
): OperationalPriority | null {
  if (!activeTask(task)) return null;

  const reasons: OperationalPriorityReason[] = [];
  const normalizedPriority = Math.max(0, Math.min(100, task.priority));
  const manualContribution = Math.round((normalizedPriority / 100) * weights.taskManualPriorityMax);
  if (manualContribution > 0) {
    reasons.push({
      code: 'task.manual_priority',
      contribution: manualContribution,
      value: task.priority,
    });
  }

  if (task.status === 'blocked' && weights.taskBlocked > 0) {
    reasons.push({ code: 'task.blocked', contribution: weights.taskBlocked });
  }

  if (activeDependentCount > 0 && weights.taskDependencyImpactPerDependent > 0) {
    reasons.push({
      code: 'task.dependency_impact',
      contribution: Math.min(100, activeDependentCount * weights.taskDependencyImpactPerDependent),
      value: activeDependentCount,
    });
  }

  const deadline = deadlineState(task.dueAt, range);
  if (deadline === 'overdue' && weights.taskOverdue > 0) {
    reasons.push({ code: 'task.overdue', contribution: weights.taskOverdue });
  }
  if (deadline === 'today' && weights.taskDueToday > 0) {
    reasons.push({ code: 'task.due_today', contribution: weights.taskDueToday });
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

function alertPriority(
  alert: Alert,
  weights: PrioritizationWeights,
): OperationalPriority | null {
  if (alert.status !== 'open' && alert.status !== 'acknowledged') return null;
  const contribution = alertSeverityScore(alert.severity, weights);
  return {
    kind: 'alert',
    id: alert.id,
    title: alert.title,
    score: clampScore(contribution),
    status: alert.status,
    severity: alert.severity,
    reasons: [{ code: 'alert.severity', contribution, value: alert.severity }],
    ...(alert.projectId ? { projectId: alert.projectId } : {}),
  };
}

function projectPriority(
  project: Project,
  range: { start: string; end: string },
  weights: PrioritizationWeights,
): OperationalPriority | null {
  if (project.status === 'done' || project.status === 'archived') return null;

  const reasons: OperationalPriorityReason[] = [];
  if (project.status === 'blocked' && weights.projectBlocked > 0) {
    reasons.push({ code: 'project.blocked', contribution: weights.projectBlocked });
  }

  const deadline = deadlineState(project.dueAt, range);
  if (deadline === 'overdue' && weights.projectOverdue > 0) {
    reasons.push({ code: 'project.overdue', contribution: weights.projectOverdue });
  }
  if (deadline === 'today' && weights.projectDueToday > 0) {
    reasons.push({ code: 'project.due_today', contribution: weights.projectDueToday });
  }

  if (
    (deadline === 'overdue' || deadline === 'today') &&
    project.progress < 100 &&
    weights.projectRemainingProgressMax > 0
  ) {
    const remaining = 100 - Math.max(0, Math.min(100, project.progress));
    const contribution = Math.round((remaining / 100) * weights.projectRemainingProgressMax);
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
  weights: PrioritizationWeights,
): OperationalPriority | null {
  if (milestone.status === 'done' || milestone.status === 'cancelled') return null;

  const deadline = deadlineState(milestone.dueAt, range);
  if (deadline !== 'overdue' && deadline !== 'today') return null;

  const reasons: OperationalPriorityReason[] = [];
  if (deadline === 'overdue' && weights.milestoneOverdue > 0) {
    reasons.push({ code: 'milestone.overdue', contribution: weights.milestoneOverdue });
  }
  if (deadline === 'today' && weights.milestoneDueToday > 0) {
    reasons.push({ code: 'milestone.due_today', contribution: weights.milestoneDueToday });
  }

  const normalizedWeight = Math.max(1, Math.min(100, Math.round(milestone.weight)));
  const weightContribution = Math.round((normalizedWeight / 100) * weights.milestoneWeightMax);
  if (weightContribution > 0) {
    reasons.push({
      code: 'milestone.weight',
      contribution: weightContribution,
      value: normalizedWeight,
    });
  }

  if (reasons.length === 0) return null;
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
  weights?: Partial<PrioritizationWeights>;
}): OperationalPriority[] {
  const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 8)));
  const weights = effectiveWeights(input.weights);
  const dependencyImpactCounts = activeDependencyImpactCounts(input.tasks);
  const candidates = [
    ...input.tasks.map((task) =>
      taskPriority(task, input.range, weights, dependencyImpactCounts.get(task.id) ?? 0),
    ),
    ...input.alerts.map((alert) => alertPriority(alert, weights)),
    ...(input.projects ?? []).map((project) => projectPriority(project, input.range, weights)),
    ...(input.milestones ?? []).map((milestone) => milestonePriority(milestone, input.range, weights)),
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
