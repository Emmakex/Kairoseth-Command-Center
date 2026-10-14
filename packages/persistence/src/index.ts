import { randomUUID } from 'node:crypto';
import type { Collection, Db, Filter } from 'mongodb';
import type {
  Alert,
  Project,
  Scope,
  Task,
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

export interface OperationalStore {
  createProject(input: CreateProjectInput): Promise<Project>;
  listProjects(scope: Scope): Promise<Project[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  listTasks(scope: Scope): Promise<Task[]>;
  listAlerts(scope: Scope): Promise<Alert[]>;
  getTodaySummary(scope: Scope, day: { start: string; end: string }): Promise<TodaySummary>;
}

function scopeFilter<T>(scope: Scope): Filter<T> {
  if (scope.kind === 'private') {
    return { 'scope.kind': 'private', 'scope.userId': scope.userId } as Filter<T>;
  }

  if (scope.kind === 'system') {
    return {
      'scope.kind': 'system',
      'scope.workspaceId': scope.workspaceId,
      'scope.source': scope.source,
    } as Filter<T>;
  }

  return { 'scope.kind': 'workspace', 'scope.workspaceId': scope.workspaceId } as Filter<T>;
}

export class MongoOperationalStore implements OperationalStore {
  private readonly projects: Collection<Project>;
  private readonly tasks: Collection<Task>;
  private readonly alerts: Collection<Alert>;

  constructor(db: Db) {
    this.projects = db.collection<Project>('projects');
    this.tasks = db.collection<Task>('tasks');
    this.alerts = db.collection<Alert>('alerts');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.projects.createIndex({ 'scope.kind': 1, 'scope.workspaceId': 1, 'scope.userId': 1, updatedAt: -1 }),
      this.tasks.createIndex({ 'scope.kind': 1, 'scope.workspaceId': 1, 'scope.userId': 1, status: 1, dueAt: 1 }),
      this.alerts.createIndex({ 'scope.kind': 1, 'scope.workspaceId': 1, 'scope.userId': 1, status: 1, severity: 1 }),
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
    return this.projects.find(scopeFilter<Project>(scope)).sort({ updatedAt: -1 }).toArray();
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
    return this.tasks.find(scopeFilter<Task>(scope)).sort({ priority: -1, dueAt: 1, createdAt: -1 }).toArray();
  }

  async listAlerts(scope: Scope): Promise<Alert[]> {
    return this.alerts.find(scopeFilter<Alert>(scope)).sort({ createdAt: -1 }).toArray();
  }

  async getTodaySummary(scope: Scope, day: { start: string; end: string }): Promise<TodaySummary> {
    const taskScope = scopeFilter<Task>(scope);
    const alertScope = scopeFilter<Alert>(scope);
    const projectScope = scopeFilter<Project>(scope);

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
