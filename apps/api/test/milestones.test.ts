import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Milestone, MilestoneStatus, Scope, TimelineEvent } from '@kcc/domain';
import type {
  AppendTimelineInput,
  CreateMilestoneInput,
  MilestoneMutationResult,
  MilestoneStore,
} from '@kcc/persistence';
import { buildApp } from '../src/application';

const session: SessionContext = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User One',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-1',
  role: 'admin',
  capabilities: ['milestones.read', 'milestones.write'],
  productEntitlements: ['command-center'],
};

const provider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? session : null;
  },
};

const sameScope = (left: Scope, right: Scope) => JSON.stringify(left) === JSON.stringify(right);
const key = (scope: Scope, projectId: string) => `${JSON.stringify(scope)}:${projectId}`;

class MemoryMilestoneStore implements MilestoneStore {
  milestones: Milestone[] = [];
  timeline: TimelineEvent[] = [];
  validProjects = new Set<string>([
    key({ kind: 'workspace', workspaceId: 'workspace-a' }, 'project-a'),
    key({ kind: 'private', userId: 'user-1' }, 'private-project'),
  ]);

  private projectProgress(scope: Scope, projectId: string): number {
    const milestones = this.milestones.filter(
      (milestone) => milestone.projectId === projectId && sameScope(milestone.scope, scope) && milestone.status !== 'cancelled',
    );
    const totalWeight = milestones.reduce((total, milestone) => total + milestone.weight, 0);
    const doneWeight = milestones
      .filter((milestone) => milestone.status === 'done')
      .reduce((total, milestone) => total + milestone.weight, 0);
    return totalWeight === 0 ? 0 : Math.round((doneWeight / totalWeight) * 100);
  }

  async createMilestone(input: CreateMilestoneInput): Promise<MilestoneMutationResult | null> {
    if (!this.validProjects.has(key(input.scope, input.projectId))) return null;
    const milestone: Milestone = {
      id: `milestone-${this.milestones.length + 1}`,
      scope: input.scope,
      projectId: input.projectId,
      title: input.title,
      status: 'planned',
      weight: Math.min(100, Math.max(1, Math.round(input.weight))),
      createdAt: '2026-10-14T00:00:00.000Z',
      updatedAt: '2026-10-14T00:00:00.000Z',
      ...(input.dueAt ? { dueAt: input.dueAt } : {}),
    };
    this.milestones.push(milestone);
    return { milestone, projectProgress: this.projectProgress(input.scope, input.projectId) };
  }

  async listMilestones(scope: Scope, projectId?: string): Promise<Milestone[]> {
    return this.milestones.filter(
      (milestone) => sameScope(milestone.scope, scope) && (!projectId || milestone.projectId === projectId),
    );
  }

  async updateMilestoneStatus(
    scope: Scope,
    milestoneId: string,
    status: MilestoneStatus,
  ): Promise<MilestoneMutationResult | null> {
    const milestone = this.milestones.find(
      (candidate) => candidate.id === milestoneId && sameScope(candidate.scope, scope),
    );
    if (!milestone) return null;
    milestone.status = status;
    milestone.updatedAt = '2026-10-14T01:00:00.000Z';
    return {
      milestone,
      projectProgress: this.projectProgress(scope, milestone.projectId),
    };
  }

  async appendTimeline(input: AppendTimelineInput): Promise<TimelineEvent> {
    const event: TimelineEvent = {
      id: `event-${this.timeline.length + 1}`,
      scope: input.scope,
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      source: input.source,
      occurredAt: input.occurredAt ?? '2026-10-14T00:00:00.000Z',
      metadata: input.metadata ?? {},
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    };
    this.timeline.push(event);
    return event;
  }
}

const authHeaders = { authorization: 'Bearer valid-token' };

describe('milestone API', () => {
  it('derives workspace scope from the session and rejects unknown projects', async () => {
    const store = new MemoryMilestoneStore();
    const app = buildApp({ authProvider: provider, milestoneStore: store });

    const created = await app.inject({
      method: 'POST',
      url: '/v1/milestones',
      headers: authHeaders,
      payload: {
        scope: 'workspace',
        workspaceId: 'workspace-b',
        projectId: 'project-a',
        title: 'Backend ready',
        weight: 40,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().milestone.scope).toEqual({ kind: 'workspace', workspaceId: 'workspace-a' });

    const missingProject = await app.inject({
      method: 'POST',
      url: '/v1/milestones',
      headers: authHeaders,
      payload: { scope: 'workspace', projectId: 'project-b', title: 'Invalid', weight: 10 },
    });
    expect(missingProject.statusCode).toBe(404);
    await app.close();
  });

  it('recalculates project progress from non-cancelled milestone weights', async () => {
    const store = new MemoryMilestoneStore();
    const app = buildApp({ authProvider: provider, milestoneStore: store });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/milestones',
      headers: authHeaders,
      payload: { scope: 'workspace', projectId: 'project-a', title: 'Design', weight: 30 },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/v1/milestones',
      headers: authHeaders,
      payload: { scope: 'workspace', projectId: 'project-a', title: 'Delivery', weight: 70 },
    });

    const firstDone = await app.inject({
      method: 'PATCH',
      url: `/v1/milestones/${first.json().milestone.id}/status`,
      headers: authHeaders,
      payload: { scope: 'workspace', status: 'done' },
    });
    expect(firstDone.statusCode).toBe(200);
    expect(firstDone.json().projectProgress).toBe(30);

    const secondDone = await app.inject({
      method: 'PATCH',
      url: `/v1/milestones/${second.json().milestone.id}/status`,
      headers: authHeaders,
      payload: { scope: 'workspace', status: 'done' },
    });
    expect(secondDone.statusCode).toBe(200);
    expect(secondDone.json().projectProgress).toBe(100);
    expect(store.timeline.filter((event) => event.type === 'milestone.status_changed')).toHaveLength(2);
    await app.close();
  });

  it('keeps private milestones isolated from workspace mutations', async () => {
    const store = new MemoryMilestoneStore();
    const app = buildApp({ authProvider: provider, milestoneStore: store });

    const created = await app.inject({
      method: 'POST',
      url: '/v1/milestones',
      headers: authHeaders,
      payload: { scope: 'private', userId: 'another-user', projectId: 'private-project', title: 'Personal', weight: 100 },
    });
    expect(created.statusCode).toBe(201);
    const milestoneId = created.json().milestone.id as string;

    const wrongScope = await app.inject({
      method: 'PATCH',
      url: `/v1/milestones/${milestoneId}/status`,
      headers: authHeaders,
      payload: { scope: 'workspace', status: 'done' },
    });
    expect(wrongScope.statusCode).toBe(404);

    const privateDone = await app.inject({
      method: 'PATCH',
      url: `/v1/milestones/${milestoneId}/status`,
      headers: authHeaders,
      payload: { scope: 'private', userId: 'another-user', status: 'done' },
    });
    expect(privateDone.statusCode).toBe(200);
    expect(privateDone.json().projectProgress).toBe(100);
    await app.close();
  });

  it('allows read-only milestone access without write capability', async () => {
    const store = new MemoryMilestoneStore();
    await store.createMilestone({
      scope: { kind: 'workspace', workspaceId: 'workspace-a' },
      projectId: 'project-a',
      title: 'Existing',
      weight: 100,
    });

    const readOnlyProvider: AuthProvider = {
      name: 'read-only',
      async resolveSession() {
        return { ...session, role: 'member', capabilities: ['milestones.read'] };
      },
    };
    const app = buildApp({ authProvider: readOnlyProvider, milestoneStore: store });

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/milestones?scope=workspace&projectId=project-a',
      headers: authHeaders,
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().milestones).toHaveLength(1);

    const write = await app.inject({
      method: 'POST',
      url: '/v1/milestones',
      headers: authHeaders,
      payload: { scope: 'workspace', projectId: 'project-a', title: 'Blocked write', weight: 10 },
    });
    expect(write.statusCode).toBe(403);
    await app.close();
  });
});
