import { randomUUID } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import type {
  Alert,
  AlertSeverity,
  AlertStatus,
  Decision,
  Milestone,
  MilestoneStatus,
  Project,
  ProjectStatus,
  Scope,
  Task,
  TaskStatus,
  TimelineEvent,
  TodaySummary,
} from '@kcc/domain';
import { clampProgress, normalizePriority } from '@kcc/domain';

export interface CreateProjectInput {
  scope: Scope;
  name: string;
  description?: string;
  ownerUserId?: string;
  dueAt?: string;
}

export interface CreateTaskInput {
  scope: Scope;
  projectId?: string;
  title: string;
  description?: string;
  priority?: number;
  assigneeIds?: string[];
  dueAt?: string;
}

export interface CreateAlertInput {
  scope: Scope;
  projectId?: string;
  title: string;
  message?: string;
  severity: AlertSeverity;
  fingerprint?: string;
}

export interface CreateDecisionInput {
  scope: Extract<Scope, { kind: 'workspace' }>;
  projectId?: string;
  title: string;
  context?: string;
  decision: string;
  madeBy: string;
  madeAt?: string;
  supersedesId?: string;
}

export interface AppendTimelineInput {
  scope: Scope;
  type: string;
  actorUserId?: string;
  entityType: string;
  entityId: string;
  summary: string;
  source: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateMilestoneInput {
  scope: Scope;
  projectId: string;
  title: string;
  weight: number;
  dueAt?: string;
}

export interface MilestoneMutationResult {
  milestone: Milestone;
  projectProgress: number | null;
}

export interface OperationalStore {
  createProject(input: CreateProjectInput): Promise<Project>;
  listProjects(scope: Scope): Promise<Project[]>;
  updateProjectStatus(
    scope: Scope,
    projectId: string,
    status: ProjectStatus,
    progress?: number,
  ): Promise<Project | null>;
  createTask(input: CreateTaskInput): Promise<Task>;
  listTasks(scope: Scope): Promise<Task[]>;
  updateTaskStatus(scope: Scope, taskId: string, status: TaskStatus): Promise<Task | null>;
  createAlert(input: CreateAlertInput): Promise<Alert>;
  listAlerts(scope: Scope): Promise<Alert[]>;
  updateAlertStatus(scope: Scope, alertId: string, status: AlertStatus): Promise<Alert | null>;
  createDecision(input: CreateDecisionInput): Promise<Decision>;
  listDecisions(scope: Extract<Scope, { kind: 'workspace' }>): Promise<Decision[]>;
  appendTimeline(input: AppendTimelineInput): Promise<TimelineEvent>;
  listTimeline(scope: Scope): Promise<TimelineEvent[]>;
  getTodaySummary(scope: Scope, day: { start: string; end: string }): Promise<TodaySummary>;
}

export interface MilestoneStore {
  createMilestone(input: CreateMilestoneInput): Promise<MilestoneMutationResult | null>;
  listMilestones(scope: Scope, projectId?: string): Promise<Milestone[]>;
  updateMilestoneStatus(
    scope: Scope,
    milestoneId: string,
    status: MilestoneStatus,
  ): Promise<MilestoneMutationResult | null>;
  appendTimeline(input: AppendTimelineInput): Promise<TimelineEvent>;
}

function scopeFilter(scope: Scope): { scope: Scope } {
  return { scope };
}

function normalizeWeight(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(100, Math.max(1, Math.round(value)));
}

export class MongoOperationalStore implements OperationalStore, MilestoneStore {
  private readonly projects: Collection<Project>;
  private readonly milestones: Collection<Milestone>;
  private readonly tasks: Collection<Task>;
  private readonly alerts: Collection<Alert>;
  private readonly decisions: Collection<Decision>;
  private readonly timeline: Collection<TimelineEvent>;

  constructor(db: Db) {
    this.projects = db.collection<Project>('projects');
    this.milestones = db.collection<Milestone>('milestones');
    this.tasks = db.collection<Task>('tasks');
    this.alerts = db.collection<Alert>('alerts');
    this.decisions = db.collection<Decision>('decisions');
    this.timeline = db.collection<TimelineEvent>('timeline_events');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.projects.createIndex({ 'scope.kind': 1, 'scope.workspaceId': 1, 'scope.userId': 1, updatedAt: -1 }),
      this.milestones.createIndex({
        'scope.kind': 1,
        'scope.workspaceId': 1,
        'scope.userId': 1,
        projectId: 1,
        status: 1,
        dueAt: 1,
      }),
      this.tasks.createIndex({ 'scope.kind': 1, 'scope.workspaceId': 1, 'scope.userId': 1, status: 1, dueAt: 1 }),
      this.alerts.createIndex({ 'scope.kind': 1, 'scope.workspaceId': 1, 'scope.userId': 1, status: 1, severity: 1 }),
      this.decisions.createIndex({ 'scope.workspaceId': 1, madeAt: -1 }),
      this.timeline.createIndex({ 'scope.kind': 1, 'scope.workspaceId': 1, 'scope.userId': 1, occurredAt: -1 }),
    ]);
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      scope: input.scope,
      name: input.name.trim(),
      status: 'active',
      progress: clampProgress(0),
      createdAt: now,
      updatedAt: now,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    };

    await this.projects.insertOne(project);
    return project;
  }

  async listProjects(scope: Scope): Promise<Project[]> {
    return this.projects.find(scopeFilter(scope)).sort({ updatedAt: -1 }).toArray();
  }

  async updateProjectStatus(
    scope: Scope,
    projectId: string,
    status: ProjectStatus,
    progress?: number,
  ): Promise<Project | null> {
    const now = new Date().toISOString();
    const normalizedProgress = status === 'done' ? 100 : progress === undefined ? undefined : clampProgress(progress);
    const result = await this.projects.updateOne(
      { ...scopeFilter(scope), id: projectId },
      {
        $set: {
          status,
          updatedAt: now,
          ...(normalizedProgress !== undefined ? { progress: normalizedProgress } : {}),
        },
      },
    );

    if (result.matchedCount === 0) return null;
    return this.projects.findOne({ ...scopeFilter(scope), id: projectId });
  }

  private async recalculateProjectProgress(scope: Scope, projectId: string): Promise<number | null> {
    const project = await this.projects.findOne({ ...scopeFilter(scope), id: projectId });
    if (!project) return null;

    const milestones = await this.milestones.find({ ...scopeFilter(scope), projectId }).toArray();
    const included = milestones.filter((milestone) => milestone.status !== 'cancelled');
    const totalWeight = included.reduce((total, milestone) => total + normalizeWeight(milestone.weight), 0);
    const completedWeight = included
      .filter((milestone) => milestone.status === 'done')
      .reduce((total, milestone) => total + normalizeWeight(milestone.weight), 0);
    const progress = totalWeight === 0 ? 0 : clampProgress((completedWeight / totalWeight) * 100);

    await this.projects.updateOne(
      { ...scopeFilter(scope), id: projectId },
      { $set: { progress, updatedAt: new Date().toISOString() } },
    );
    return progress;
  }

  async createMilestone(input: CreateMilestoneInput): Promise<MilestoneMutationResult | null> {
    const project = await this.projects.findOne({ ...scopeFilter(input.scope), id: input.projectId });
    if (!project) return null;

    const now = new Date().toISOString();
    const milestone: Milestone = {
      id: randomUUID(),
      scope: input.scope,
      projectId: input.projectId,
      title: input.title.trim(),
      status: 'planned',
      weight: normalizeWeight(input.weight),
      createdAt: now,
      updatedAt: now,
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    };

    await this.milestones.insertOne(milestone);
    const projectProgress = await this.recalculateProjectProgress(input.scope, input.projectId);
    return { milestone, projectProgress };
  }

  async listMilestones(scope: Scope, projectId?: string): Promise<Milestone[]> {
    return this.milestones
      .find({ ...scopeFilter(scope), ...(projectId ? { projectId } : {}) })
      .sort({ dueAt: 1, createdAt: 1 })
      .toArray();
  }

  async updateMilestoneStatus(
    scope: Scope,
    milestoneId: string,
    status: MilestoneStatus,
  ): Promise<MilestoneMutationResult | null> {
    const now = new Date().toISOString();
    const query = { ...scopeFilter(scope), id: milestoneId };
    const result = await this.milestones.updateOne(query, { $set: { status, updatedAt: now } });
    if (result.matchedCount === 0) return null;

    const milestone = await this.milestones.findOne(query);
    if (!milestone) return null;
    const projectProgress = await this.recalculateProjectProgress(scope, milestone.projectId);
    return { milestone, projectProgress };
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: randomUUID(),
      scope: input.scope,
      title: input.title.trim(),
      status: 'todo',
      priority: normalizePriority(input.priority ?? 50),
      assigneeIds: input.assigneeIds ?? [],
      createdAt: now,
      updatedAt: now,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    };

    await this.tasks.insertOne(task);
    return task;
  }

  async listTasks(scope: Scope): Promise<Task[]> {
    return this.tasks.find(scopeFilter(scope)).sort({ priority: -1, dueAt: 1, createdAt: -1 }).toArray();
  }

  async updateTaskStatus(scope: Scope, taskId: string, status: TaskStatus): Promise<Task | null> {
    const now = new Date().toISOString();
    const result = await this.tasks.updateOne(
      { ...scopeFilter(scope), id: taskId },
      status === 'done'
        ? { $set: { status, updatedAt: now, completedAt: now } }
        : { $set: { status, updatedAt: now }, $unset: { completedAt: '' } },
    );

    if (result.matchedCount === 0) return null;
    return this.tasks.findOne({ ...scopeFilter(scope), id: taskId });
  }

  async createAlert(input: CreateAlertInput): Promise<Alert> {
    const now = new Date().toISOString();
    const alert: Alert = {
      id: randomUUID(),
      scope: input.scope,
      title: input.title.trim(),
      severity: input.severity,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.message?.trim() ? { message: input.message.trim() } : {}),
      ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
    };

    await this.alerts.insertOne(alert);
    return alert;
  }

  async listAlerts(scope: Scope): Promise<Alert[]> {
    return this.alerts.find(scopeFilter(scope)).sort({ createdAt: -1 }).toArray();
  }

  async updateAlertStatus(scope: Scope, alertId: string, status: AlertStatus): Promise<Alert | null> {
    const now = new Date().toISOString();
    const query = { ...scopeFilter(scope), id: alertId };
    const result =
      status === 'acknowledged'
        ? await this.alerts.updateOne(query, {
            $set: { status, updatedAt: now, acknowledgedAt: now },
            $unset: { resolvedAt: '' },
          })
        : status === 'resolved'
          ? await this.alerts.updateOne(query, {
              $set: { status, updatedAt: now, resolvedAt: now },
            })
          : await this.alerts.updateOne(query, {
              $set: { status, updatedAt: now },
              $unset: { acknowledgedAt: '', resolvedAt: '' },
            });

    if (result.matchedCount === 0) return null;
    return this.alerts.findOne(query);
  }

  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    const now = new Date().toISOString();
    const decision: Decision = {
      id: randomUUID(),
      scope: input.scope,
      title: input.title.trim(),
      decision: input.decision.trim(),
      status: 'active',
      madeBy: input.madeBy,
      madeAt: input.madeAt ?? now,
      createdAt: now,
      updatedAt: now,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.context?.trim() ? { context: input.context.trim() } : {}),
      ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
    };

    await this.decisions.insertOne(decision);
    return decision;
  }

  async listDecisions(scope: Extract<Scope, { kind: 'workspace' }>): Promise<Decision[]> {
    return this.decisions.find({ scope }).sort({ madeAt: -1 }).toArray();
  }

  async appendTimeline(input: AppendTimelineInput): Promise<TimelineEvent> {
    const event: TimelineEvent = {
      id: randomUUID(),
      scope: input.scope,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      source: input.source,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    };

    await this.timeline.insertOne(event);
    return event;
  }

  async listTimeline(scope: Scope): Promise<TimelineEvent[]> {
    return this.timeline.find(scopeFilter(scope)).sort({ occurredAt: -1 }).limit(100).toArray();
  }

  async getTodaySummary(scope: Scope, day: { start: string; end: string }): Promise<TodaySummary> {
    const taskScope = scopeFilter(scope);
    const alertScope = scopeFilter(scope);
    const projectScope = scopeFilter(scope);

    const [openTasks, dueToday, blockedTasks, openAlerts, urgentAlerts, activeProjects] = await Promise.all([
      this.tasks.countDocuments({ ...taskScope, status: { $nin: ['done', 'cancelled'] } }),
      this.tasks.countDocuments({
        ...taskScope,
        status: { $nin: ['done', 'cancelled'] },
        dueAt: { $gte: day.start, $lt: day.end },
      }),
      this.tasks.countDocuments({ ...taskScope, status: 'blocked' }),
      this.alerts.countDocuments({ ...alertScope, status: { $in: ['open', 'acknowledged'] } }),
      this.alerts.countDocuments({
        ...alertScope,
        status: { $in: ['open', 'acknowledged'] },
        severity: { $in: ['urgent', 'critical'] },
      }),
      this.projects.countDocuments({ ...projectScope, status: { $in: ['active', 'blocked'] } }),
    ]);

    return { openTasks, dueToday, blockedTasks, openAlerts, urgentAlerts, activeProjects };
  }
}
