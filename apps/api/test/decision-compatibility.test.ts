import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Decision, TimelineEvent } from '@kcc/domain';
import type { AppendTimelineInput, CreateDecisionInput, OperationalStore } from '@kcc/persistence';
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
  capabilities: ['decisions.read', 'decisions.write'],
  productEntitlements: ['command-center'],
};

const provider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? session : null;
  },
};

function operationalStore() {
  const decisions: Decision[] = [];
  const timeline: TimelineEvent[] = [];
  const store = {
    createDecision: async (input: CreateDecisionInput) => {
      const now = '2026-10-14T11:00:00.000Z';
      const decision: Decision = {
        id: `decision-${decisions.length + 1}`,
        scope: input.scope,
        title: input.title,
        decision: input.decision,
        status: 'active',
        madeBy: input.madeBy,
        madeAt: input.madeAt ?? now,
        createdAt: now,
        updatedAt: now,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.context ? { context: input.context } : {}),
        ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
      };
      decisions.push(decision);
      return decision;
    },
    appendTimeline: async (input: AppendTimelineInput) => {
      const event: TimelineEvent = {
        id: `event-${timeline.length + 1}`,
        scope: input.scope,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        source: input.source,
        occurredAt: input.occurredAt ?? '2026-10-14T11:00:00.000Z',
        metadata: input.metadata ?? {},
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      };
      timeline.push(event);
      return event;
    },
    listDecisions: async () => decisions,
  } as unknown as OperationalStore;
  return { store, decisions };
}

const headers = { authorization: 'Bearer valid-token' };

describe('legacy Decision compatibility route', () => {
  it('rejects project and supersede references so lifecycle validation cannot be bypassed', async () => {
    const state = operationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: state.store });

    const linked = await app.inject({
      method: 'POST',
      url: '/v1/decisions',
      headers,
      payload: {
        title: 'Legacy linked attempt',
        decision: 'Should use lifecycle',
        projectId: 'foreign-project',
      },
    });
    const replacement = await app.inject({
      method: 'POST',
      url: '/v1/decisions',
      headers,
      payload: {
        title: 'Legacy replacement attempt',
        decision: 'Should use lifecycle',
        supersedesId: 'decision-old',
      },
    });

    expect(linked.statusCode).toBe(409);
    expect(linked.json()).toEqual({ error: 'decision_lifecycle_required' });
    expect(replacement.statusCode).toBe(409);
    expect(replacement.json()).toEqual({ error: 'decision_lifecycle_required' });
    expect(state.decisions).toHaveLength(0);
    await app.close();
  });

  it('retains compatibility for simple unlinked Decision creation', async () => {
    const state = operationalStore();
    const app = buildApp({ authProvider: provider, operationalStore: state.store });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/decisions',
      headers,
      payload: { title: 'Simple decision', decision: 'Keep compatibility' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().decision).toMatchObject({ title: 'Simple decision', status: 'active' });
    expect(state.decisions).toHaveLength(1);
    await app.close();
  });
});
