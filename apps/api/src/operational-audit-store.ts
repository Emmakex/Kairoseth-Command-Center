import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
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
} from '@kcc/domain';
import { clampProgress, normalizePriority } from '@kcc/domain';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';

export type MilestoneAuditResult = {
  milestone: Milestone;
  projectProgress: number | null;
};

type AuditContext = {
  actorUserId: string;
  eventType: string;
};

export interface OperationalAuditStore {
  createProject(input: {
    scope: Scope;
    actorUserId: string;
    eventType: 'project.created' | 'project.quick_captured';
    name: string;
    description?: string;
    dueAt?: string;
  }): Promise<Project>;
  updateProjectStatus(input: {
    scope: Scope;
    actorUserId: string;
    projectId: string;
    status: ProjectStatus;
    progress?: number;
  }): Promise<Project | null>;
  createTask(input: {
    scope: Scope;
    actorUserId: string;
    eventType: 'task.created' | 'task.quick_captured';
    title: string;
    description?: string;
    projectId?: string;
    priority?: number;
    dueAt?: string;
  }): Promise<Task>;
  updateTaskStatus(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    status: TaskStatus;
  }): Promise<Task | null>;
  createAlert(input: {
    scope: Scope;
    actorUserId: string;
    title: string;
    severity: AlertSeverity;
    message?: string;
    projectId?: string;
    fingerprint?: string;
  }): Promise<Alert>;
  updateAlertStatus(input: {
    scope: Scope;
    actorUserId: string;
    alertId: string;
    status: AlertStatus;
  }): Promise<Alert | null>;
  createSimpleDecision(input: {
    scope: Extract<Scope, { kind: 'workspace' }>;
    actorUserId: string;
    title: string;
    decision: string;
    context?: string;
    madeAt?: string;
  }): Promise<Decision>;
  createMilestone(input: {
    scope: Scope;
    actorUserId: string;
    projectId: string;
    title: string;
    weight: number;
    dueAt?: string;
  }): Promise<MilestoneAuditResult | null>;
  updateMilestoneStatus(input: {
    scope: Scope;
    actorUserId: string;
    milestoneId: string;
    status: MilestoneStatus;
  }): Promise<MilestoneAuditResult | null>;
}

function normalizeWeight(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(100, Math.max(1, Math.round(value)));
}

export class MongoOperationalAuditStore implements OperationalAuditStore {
  private readonly projects: Collection<Project>;
  private readonly milestones: Collection<Milestone>;
  private readonly tasks: Collection<Task>;
  private readonly alerts: Collection<Alert>;
  private readonly decisions: Collection<Decision>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.projects = db.collection<Project>('projects');
    this.milestones = db.collection<Milestone>('milestones');
    this.tasks = db.collection<Task>('tasks');
    this.alerts = db.collection<Alert>('alerts');
    this.decisions = db.collection<Decision>('decisions');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  private async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession();
    let result!: T;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  private async audit(
    session: ClientSession,
    input: AuditContext & {
      scope: Scope;
      entityType: string;
      entityId: string;
      summary: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.outbox.enqueue(
      {
        scope: input.scope,
        type: input.eventType,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        source: 'manual-api',
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
      session,
    );
  }

  async createProject(input: {
    scope: Scope;
    actorUserId: string;
    eventType: 'project.created' | 'project.quick_captured';
    name: string;
    description?: string;
    dueAt?: string;
  }): Promise<Project> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const project: Project = {
        id: randomUUID(),
        scope: input.scope,
        name: input.name.trim(),
        status: 'active',
        progress: 0,
        ownerUserId: input.actorUserId,
        createdAt: now,
        updatedAt: now,
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      };
      await this.projects.insertOne(project, { session });
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: input.eventType,
        entityType: 'project',
        entityId: project.id,
        summary: project.name,
      });
      return project;
    });
  }

  async updateProjectStatus(input: {
    scope: Scope;
    actorUserId: string;
    projectId: string;
    status: ProjectStatus;
    progress?: number;
  }): Promise<Project | null> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const progress =
        input.status === 'done'
          ? 100
          : input.progress === undefined
            ? undefined
            : clampProgress(input.progress);
      const query = { scope: input.scope, id: input.projectId };
      const update = await this.projects.updateOne(
        query,
        {
          $set: {
            status: input.status,
            updatedAt: now,
            ...(progress !== undefined ? { progress } : {}),
          },
        },
        { session },
      );
      if (update.matchedCount === 0) return null;
      const project = await this.projects.findOne(query, { session });
      if (!project) return null;
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: 'project.status_changed',
        entityType: 'project',
        entityId: project.id,
        summary: `${project.name}: ${project.status}`,
        metadata: { status: project.status, progress: project.progress },
      });
      return project;
    });
  }

  async createTask(input: {
    scope: Scope;
    actorUserId: string;
    eventType: 'task.created' | 'task.quick_captured';
    title: string;
    description?: string;
    projectId?: string;
    priority?: number;
    dueAt?: string;
  }): Promise<Task> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const task: Task = {
        id: randomUUID(),
        scope: input.scope,
        title: input.title.trim(),
        status: 'todo',
        priority: normalizePriority(input.priority ?? 50),
        assigneeIds: input.scope.kind === 'private' ? [input.actorUserId] : [],
        createdAt: now,
        updatedAt: now,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      };
      await this.tasks.insertOne(task, { session });
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: input.eventType,
        entityType: 'task',
        entityId: task.id,
        summary: task.title,
      });
      return task;
    });
  }

  async updateTaskStatus(input: {
    scope: Scope;
    actorUserId: string;
    taskId: string;
    status: TaskStatus;
  }): Promise<Task | null> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const query = { scope: input.scope, id: input.taskId };
      const update = await this.tasks.updateOne(
        query,
        input.status === 'done'
          ? { $set: { status: input.status, updatedAt: now, completedAt: now } }
          : { $set: { status: input.status, updatedAt: now }, $unset: { completedAt: '' } },
        { session },
      );
      if (update.matchedCount === 0) return null;
      const task = await this.tasks.findOne(query, { session });
      if (!task) return null;
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: 'task.status_changed',
        entityType: 'task',
        entityId: task.id,
        summary: `${task.title}: ${task.status}`,
        metadata: { status: task.status },
      });
      return task;
    });
  }

  async createAlert(input: {
    scope: Scope;
    actorUserId: string;
    title: string;
    severity: AlertSeverity;
    message?: string;
    projectId?: string;
    fingerprint?: string;
  }): Promise<Alert> {
    return this.transaction(async (session) => {
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
      await this.alerts.insertOne(alert, { session });
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: 'alert.created',
        entityType: 'alert',
        entityId: alert.id,
        summary: alert.title,
        metadata: { severity: alert.severity },
      });
      return alert;
    });
  }

  async updateAlertStatus(input: {
    scope: Scope;
    actorUserId: string;
    alertId: string;
    status: AlertStatus;
  }): Promise<Alert | null> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const query = { scope: input.scope, id: input.alertId };
      const update =
        input.status === 'acknowledged'
          ? await this.alerts.updateOne(
              query,
              {
                $set: { status: input.status, updatedAt: now, acknowledgedAt: now },
                $unset: { resolvedAt: '' },
              },
              { session },
            )
          : input.status === 'resolved'
            ? await this.alerts.updateOne(
                query,
                { $set: { status: input.status, updatedAt: now, resolvedAt: now } },
                { session },
              )
            : await this.alerts.updateOne(
                query,
                {
                  $set: { status: input.status, updatedAt: now },
                  $unset: { acknowledgedAt: '', resolvedAt: '' },
                },
                { session },
              );
      if (update.matchedCount === 0) return null;
      const alert = await this.alerts.findOne(query, { session });
      if (!alert) return null;
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: 'alert.status_changed',
        entityType: 'alert',
        entityId: alert.id,
        summary: `${alert.title}: ${alert.status}`,
        metadata: { status: alert.status, severity: alert.severity },
      });
      return alert;
    });
  }

  async createSimpleDecision(input: {
    scope: Extract<Scope, { kind: 'workspace' }>;
    actorUserId: string;
    title: string;
    decision: string;
    context?: string;
    madeAt?: string;
  }): Promise<Decision> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const decision: Decision = {
        id: randomUUID(),
        scope: input.scope,
        title: input.title.trim(),
        decision: input.decision.trim(),
        status: 'active',
        madeBy: input.actorUserId,
        madeAt: input.madeAt ?? now,
        createdAt: now,
        updatedAt: now,
        ...(input.context?.trim() ? { context: input.context.trim() } : {}),
      };
      await this.decisions.insertOne(decision, { session });
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: 'decision.created',
        entityType: 'decision',
        entityId: decision.id,
        summary: decision.title,
      });
      return decision;
    });
  }

  private async recalculateProjectProgress(
    session: ClientSession,
    scope: Scope,
    projectId: string,
  ): Promise<number | null> {
    const project = await this.projects.findOne({ scope, id: projectId }, { session });
    if (!project) return null;
    const milestones = await this.milestones.find({ scope, projectId }, { session }).toArray();
    const included = milestones.filter((milestone) => milestone.status !== 'cancelled');
    const totalWeight = included.reduce((sum, milestone) => sum + normalizeWeight(milestone.weight), 0);
    const completedWeight = included
      .filter((milestone) => milestone.status === 'done')
      .reduce((sum, milestone) => sum + normalizeWeight(milestone.weight), 0);
    const progress = totalWeight === 0 ? 0 : clampProgress((completedWeight / totalWeight) * 100);
    await this.projects.updateOne(
      { scope, id: projectId },
      { $set: { progress, updatedAt: new Date().toISOString() } },
      { session },
    );
    return progress;
  }

  async createMilestone(input: {
    scope: Scope;
    actorUserId: string;
    projectId: string;
    title: string;
    weight: number;
    dueAt?: string;
  }): Promise<MilestoneAuditResult | null> {
    return this.transaction(async (session) => {
      const project = await this.projects.findOne({ scope: input.scope, id: input.projectId }, { session });
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
      await this.milestones.insertOne(milestone, { session });
      const projectProgress = await this.recalculateProjectProgress(session, input.scope, input.projectId);
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: 'milestone.created',
        entityType: 'milestone',
        entityId: milestone.id,
        summary: milestone.title,
        metadata: { projectId: milestone.projectId, weight: milestone.weight, projectProgress },
      });
      return { milestone, projectProgress };
    });
  }

  async updateMilestoneStatus(input: {
    scope: Scope;
    actorUserId: string;
    milestoneId: string;
    status: MilestoneStatus;
  }): Promise<MilestoneAuditResult | null> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const query = { scope: input.scope, id: input.milestoneId };
      const update = await this.milestones.updateOne(
        query,
        { $set: { status: input.status, updatedAt: now } },
        { session },
      );
      if (update.matchedCount === 0) return null;
      const milestone = await this.milestones.findOne(query, { session });
      if (!milestone) return null;
      const projectProgress = await this.recalculateProjectProgress(
        session,
        input.scope,
        milestone.projectId,
      );
      await this.audit(session, {
        scope: input.scope,
        actorUserId: input.actorUserId,
        eventType: 'milestone.status_changed',
        entityType: 'milestone',
        entityId: milestone.id,
        summary: `${milestone.title}: ${milestone.status}`,
        metadata: { projectId: milestone.projectId, status: milestone.status, projectProgress },
      });
      return { milestone, projectProgress };
    });
  }
}
