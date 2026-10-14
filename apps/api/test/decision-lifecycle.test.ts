import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Decision, Project } from '@kcc/domain';
import { buildApp } from '../src/application';
import type {
  CreateDecisionLifecycleInput,
  DecisionLifecycleResult,
  DecisionLifecycleStore,
  ReverseDecisionLifecycleInput,
  WorkspaceScope,
} from '../src/decision-lifecycle-store';

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

const authHeaders = { authorization: 'Bearer valid-token' };
const workspaceScope: WorkspaceScope = { kind: 'workspace', workspaceId: 'workspace-a' };

type AuditRecord = {
  type: string;
  entityId: string;
  metadata: Record<string, unknown>;
};

class DecisionState implements DecisionLifecycleStore {
  projects: Project[] = [];
  decisions: Decision[] = [];
  audit: AuditRecord[] = [];

  async ensureIndexes(): Promise<void> {}

  async createWithAudit(input: CreateDecisionLifecycleInput): Promise<DecisionLifecycleResult> {
    if (
      input.projectId &&
      !this.projects.some(
        (project) =>
          project.id === input.projectId &&
          project.scope.kind === 'workspace' &&
          project.scope.workspaceId === input.scope.workspaceId,
      )
    ) {
      return { ok: false, error: 'project_not_found' };
    }

    let superseded: Decision | undefined;
    let effectiveProjectId = input.projectId;
    if (input.supersedesId) {
      superseded = this.decisions.find(
        (decision) =>
          decision.id === input.supersedesId &&
          decision.scope.workspaceId === input.scope.workspaceId,
      );
      if (!superseded) return { ok: false, error: 'decision_not_found' };
      if (superseded.status !== 'active') return { ok: false, error: 'decision_not_active' };
      if (input.projectId && superseded.projectId && input.projectId !== superseded.projectId) {
        return { ok: false, error: 'decision_project_mismatch' };
      }
      effectiveProjectId = input.projectId ?? superseded.projectId;
      superseded.status = 'superseded';
    }

    const now = '2026-10-14T10:00:00.000Z';
    const decision: Decision = {
      id: `decision-${this.decisions.length + 1}`,
      scope: input.scope,
      title: input.title,
      decision: input.decision,
      status: 'active',
      madeBy: input.madeBy,
      madeAt: input.madeAt ?? now,
      createdAt: now,
      updatedAt: now,
      ...(effectiveProjectId ? { projectId: effectiveProjectId } : {}),
      ...(input.context ? { context: input.context } : {}),
      ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
    };
    this.decisions.push(decision);
    if (superseded) {
      this.audit.push({
        type: 'decision.superseded',
        entityId: superseded.id,
        metadata: { replacementDecisionId: decision.id },
      });
    }
    this.audit.push({
      type: 'decision.created',
      entityId: decision.id,
      metadata: {
        ...(decision.projectId ? { projectId: decision.projectId } : {}),
        ...(decision.supersedesId ? { supersedesId: decision.supersedesId } : {}),
      },
    });
    return { ok: true, decision };
  }

  async reverseWithAudit(input: ReverseDecisionLifecycleInput): Promise<DecisionLifecycleResult> {
    const decision = this.decisions.find(
      (candidate) =>
        candidate.id === input.decisionId &&
        candidate.scope.workspaceId === input.scope.workspaceId,
    );
    if (!decision) return { ok: false, error: 'decision_not_found' };
    if (decision.status !== 'active') return { ok: false, error: 'decision_not_active' };
    decision.status = 'reversed';
    decision.updatedAt = '2026-10-14T11:00:00.000Z';
    this.audit.push({
      type: 'decision.reversed',
      entityId: decision.id,
      metadata: { reason: input.reason },
    });
    return { ok: true, decision };
  }
}

function project(id: string, workspaceId = 'workspace-a'): Project {
  return {
    id,
    scope: { kind: 'workspace', workspaceId },
    name: id,
    status: 'active',
    progress: 0,
    createdAt: '2026-10-14T09:00:00.000Z',
    updatedAt: '2026-10-14T09:00:00.000Z',
  };
}

function decision(id: string, status: Decision['status'] = 'active', projectId?: string): Decision {
  return {
    id,
    scope: workspaceScope,
    title: `Decision ${id}`,
    decision: 'Keep the validated path',
    status,
    madeBy: 'user-1',
    madeAt: '2026-10-14T09:00:00.000Z',
    createdAt: '2026-10-14T09:00:00.000Z',
    updatedAt: '2026-10-14T09:00:00.000Z',
    ...(projectId ? { projectId } : {}),
  };
}

function appFor(state: DecisionState) {
  return buildApp({ authProvider: provider, decisionLifecycleStore: state });
}

describe('Decision lifecycle API', () => {
  it('accepts only project references from the authenticated workspace', async () => {
    const state = new DecisionState();
    state.projects.push(project('project-a'), project('project-foreign', 'workspace-b'));
    const app = appFor(state);

    const valid = await app.inject({
      method: 'POST',
      url: '/v1/decision-lifecycle',
      headers: authHeaders,
      payload: {
        scope: 'workspace',
        title: 'Validated project decision',
        decision: 'Ship only after green CI',
        projectId: 'project-a',
      },
    });
    expect(valid.statusCode).toBe(201);
    expect(valid.json().decision).toMatchObject({ projectId: 'project-a', status: 'active' });

    const foreign = await app.inject({
      method: 'POST',
      url: '/v1/decision-lifecycle',
      headers: authHeaders,
      payload: {
        scope: 'workspace',
        title: 'Foreign project attempt',
        decision: 'Should not persist',
        projectId: 'project-foreign',
      },
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: 'project_not_found' });
    expect(state.decisions).toHaveLength(1);
    await app.close();
  });

  it('supersedes an active same-workspace decision and inherits its project', async () => {
    const state = new DecisionState();
    state.projects.push(project('project-a'));
    state.decisions.push(decision('decision-old', 'active', 'project-a'));
    const app = appFor(state);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/decision-lifecycle',
      headers: authHeaders,
      payload: {
        scope: 'workspace',
        title: 'Replacement decision',
        decision: 'Use the new validated flow',
        supersedesId: 'decision-old',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().decision).toMatchObject({
      projectId: 'project-a',
      supersedesId: 'decision-old',
      status: 'active',
    });
    expect(state.decisions.find((item) => item.id === 'decision-old')?.status).toBe('superseded');
    expect(state.audit.map((event) => event.type)).toEqual([
      'decision.superseded',
      'decision.created',
    ]);
    await app.close();
  });

  it('rejects superseding a decision that is no longer active', async () => {
    const state = new DecisionState();
    state.decisions.push(decision('decision-old', 'reversed'));
    const app = appFor(state);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/decision-lifecycle',
      headers: authHeaders,
      payload: {
        scope: 'workspace',
        title: 'Invalid replacement',
        decision: 'Should not persist',
        supersedesId: 'decision-old',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'decision_not_active' });
    expect(state.decisions).toHaveLength(1);
    await app.close();
  });

  it('reverses an active decision once and records the audit reason', async () => {
    const state = new DecisionState();
    state.decisions.push(decision('decision-a'));
    const app = appFor(state);

    const first = await app.inject({
      method: 'PATCH',
      url: '/v1/decision-lifecycle/decision-a/reverse',
      headers: authHeaders,
      payload: { scope: 'workspace', reason: 'The assumption changed' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().decision.status).toBe('reversed');
    expect(state.audit[0]).toMatchObject({
      type: 'decision.reversed',
      metadata: { reason: 'The assumption changed' },
    });

    const second = await app.inject({
      method: 'PATCH',
      url: '/v1/decision-lifecycle/decision-a/reverse',
      headers: authHeaders,
      payload: { scope: 'workspace', reason: 'Again' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'decision_not_active' });
    await app.close();
  });

  it('keeps creation and reversal workspace-only', async () => {
    const state = new DecisionState();
    state.decisions.push(decision('decision-a'));
    const app = appFor(state);

    const create = await app.inject({
      method: 'POST',
      url: '/v1/decision-lifecycle',
      headers: authHeaders,
      payload: { scope: 'private', title: 'Private', decision: 'No' },
    });
    const reverse = await app.inject({
      method: 'PATCH',
      url: '/v1/decision-lifecycle/decision-a/reverse',
      headers: authHeaders,
      payload: { scope: 'private', reason: 'No' },
    });

    expect(create.statusCode).toBe(400);
    expect(reverse.statusCode).toBe(400);
    expect(state.decisions[0]?.status).toBe('active');
    await app.close();
  });
});
