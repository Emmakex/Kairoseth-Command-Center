import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/application';
import type {
  AgentBridgeA2ASaveResult,
  AgentBridgeA2AScope,
  AgentBridgeA2AStore,
  AgentBridgeA2AStoredTask,
  AgentBridgeA2ATaskState,
  AgentBridgeA2ATransitionClaim,
} from '../src/agent-bridge-a2a-store';

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
  capabilities: [],
  productEntitlements: ['agent-bridge'],
};

const provider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token' ? session : null;
  },
};

const forbiddenProvider: AuthProvider = {
  name: 'test-forbidden',
  async resolveSession(input) {
    return input.authorization === 'Bearer valid-token'
      ? { ...session, productEntitlements: ['command-center'] }
      : null;
  },
};

const headers = { authorization: 'Bearer valid-token' };
const fingerprint = 'a'.repeat(64);
const taskScope: AgentBridgeA2AScope = {
  actor: 'agent:ci',
  tenantId: 'workspace-a',
  installationId: 'installation-a',
};

function sameScope(left: AgentBridgeA2AScope, right: AgentBridgeA2AScope): boolean {
  return (
    left.actor === right.actor &&
    left.tenantId === right.tenantId &&
    left.installationId === right.installationId
  );
}

function record(
  state: AgentBridgeA2ATaskState = 'TASK_STATE_AUTH_REQUIRED',
): AgentBridgeA2AStoredTask {
  return {
    task: {
      id: 'task-a',
      contextId: 'context-a',
      status: { state, timestamp: '2026-10-16T12:00:00.000Z' },
    },
    scope: taskScope,
    invocation: {
      toolId: 'orders.write',
      input: { orderId: 'order-1' },
      correlationId: 'correlation-a',
      actionFingerprint: fingerprint,
      provenance: { source: 'a2a' },
    },
  };
}

type Entry = {
  record: AgentBridgeA2AStoredTask;
  claimId?: string;
};

class SharedState implements AgentBridgeA2AStore {
  private readonly records = new Map<string, Entry>();

  async ensureIndexes(): Promise<void> {}

  async save(value: AgentBridgeA2AStoredTask): Promise<AgentBridgeA2ASaveResult> {
    const current = this.records.get(value.task.id);
    if (current && !sameScope(current.record.scope, value.scope)) {
      return { ok: false, code: 'agent_bridge_a2a_task_scope_collision' };
    }
    if (current?.claimId) {
      return { ok: false, code: 'agent_bridge_a2a_task_claim_active' };
    }
    this.records.set(value.task.id, { record: structuredClone(value) });
    return { ok: true };
  }

  async get(
    taskId: string,
    requestedScope: AgentBridgeA2AScope,
  ): Promise<AgentBridgeA2AStoredTask | null> {
    const entry = this.records.get(taskId);
    return entry && sameScope(entry.record.scope, requestedScope)
      ? structuredClone(entry.record)
      : null;
  }

  async claim(input: {
    taskId: string;
    scope: AgentBridgeA2AScope;
    expectedState: AgentBridgeA2ATaskState;
    expectedActionFingerprint: string;
    claimId: string;
  }): Promise<AgentBridgeA2ATransitionClaim | null> {
    const entry = this.records.get(input.taskId);
    if (
      !entry ||
      entry.claimId ||
      !sameScope(entry.record.scope, input.scope) ||
      entry.record.task.status.state !== input.expectedState ||
      entry.record.invocation.actionFingerprint !== input.expectedActionFingerprint
    ) {
      return null;
    }
    const original = structuredClone(entry.record);
    entry.claimId = input.claimId;
    entry.record.task.status.state = 'TASK_STATE_WORKING';
    return { claimId: input.claimId, record: original };
  }

  async complete(
    claim: AgentBridgeA2ATransitionClaim,
    value: AgentBridgeA2AStoredTask,
  ): Promise<boolean> {
    const entry = this.records.get(value.task.id);
    if (
      !entry ||
      entry.claimId !== claim.claimId ||
      !sameScope(entry.record.scope, value.scope)
    ) {
      return false;
    }
    this.records.set(value.task.id, { record: structuredClone(value) });
    return true;
  }
}

function appFor(store: AgentBridgeA2AStore, authProvider: AuthProvider = provider) {
  return buildApp({ authProvider, agentBridgeA2AStore: store });
}

describe('Agent Bridge shared A2A task storage API', () => {
  it('requires authentication, product entitlement, exact versions and workspace tenant binding', async () => {
    const store = new SharedState();
    const app = appFor(store);

    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/get',
      payload: { version: 'kab.a2a-task-get.v1', taskId: 'task-a', scope: taskScope },
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.headers['cache-control']).toBe('no-store');

    const wrongVersion = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/get',
      headers,
      payload: { version: 'kab.a2a-task-get.v0', taskId: 'task-a', scope: taskScope },
    });
    expect(wrongVersion.statusCode).toBe(400);

    const wrongTenant = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/get',
      headers,
      payload: {
        version: 'kab.a2a-task-get.v1',
        taskId: 'task-a',
        scope: { ...taskScope, tenantId: 'workspace-b' },
      },
    });
    expect(wrongTenant.statusCode).toBe(403);
    expect(wrongTenant.json()).toEqual({ code: 'tenant_scope_mismatch' });

    const forbidden = appFor(store, forbiddenProvider);
    const noEntitlement = await forbidden.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/get',
      headers,
      payload: { version: 'kab.a2a-task-get.v1', taskId: 'task-a', scope: taskScope },
    });
    expect(noEntitlement.statusCode).toBe(403);
    expect(noEntitlement.json()).toEqual({ code: 'agent_bridge_forbidden' });

    await app.close();
    await forbidden.close();
  });

  it('allows exactly one logical runtime to claim and complete a shared task', async () => {
    const store = new SharedState();
    const nodeA = appFor(store);
    const nodeB = appFor(store);

    const save = await nodeA.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/save',
      headers,
      payload: { version: 'kab.a2a-task-save.v1', record: record() },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json()).toEqual({ saved: true });

    const claimPayload = (claimId: string) => ({
      version: 'kab.a2a-task-claim.v1',
      taskId: 'task-a',
      scope: taskScope,
      expectedState: 'TASK_STATE_AUTH_REQUIRED',
      expectedActionFingerprint: fingerprint,
      claimId,
    });
    const [claimA, claimB] = await Promise.all([
      nodeA.inject({
        method: 'POST',
        url: '/api/products/agent-bridge/a2a/tasks/claim',
        headers,
        payload: claimPayload('claim-a'),
      }),
      nodeB.inject({
        method: 'POST',
        url: '/api/products/agent-bridge/a2a/tasks/claim',
        headers,
        payload: claimPayload('claim-b'),
      }),
    ]);

    const claims = [claimA.json(), claimB.json()] as Array<{
      claim: AgentBridgeA2ATransitionClaim | null;
    }>;
    expect(claims.filter((value) => value.claim !== null)).toHaveLength(1);
    const winner = claims.find((value) => value.claim !== null)?.claim;
    expect(winner?.record.task.status.state).toBe('TASK_STATE_AUTH_REQUIRED');

    const persistedWorking = await nodeB.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/get',
      headers,
      payload: { version: 'kab.a2a-task-get.v1', taskId: 'task-a', scope: taskScope },
    });
    expect(persistedWorking.json().record.task.status.state).toBe('TASK_STATE_WORKING');

    const completedRecord = record('TASK_STATE_COMPLETED');
    const complete = await nodeB.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/complete',
      headers,
      payload: {
        version: 'kab.a2a-task-complete.v1',
        claim: winner,
        record: completedRecord,
      },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toEqual({ completed: true });

    const replay = await nodeA.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/complete',
      headers,
      payload: {
        version: 'kab.a2a-task-complete.v1',
        claim: winner,
        record: completedRecord,
      },
    });
    expect(replay.json()).toEqual({ completed: false });

    const finalRead = await nodeA.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/get',
      headers,
      payload: { version: 'kab.a2a-task-get.v1', taskId: 'task-a', scope: taskScope },
    });
    expect(finalRead.json().record.task.status.state).toBe('TASK_STATE_COMPLETED');

    await nodeA.close();
    await nodeB.close();
  });

  it('rejects completion when invocation binding changes', async () => {
    const store = new SharedState();
    const app = appFor(store);
    await store.save(record());
    const claim = await store.claim({
      taskId: 'task-a',
      scope: taskScope,
      expectedState: 'TASK_STATE_AUTH_REQUIRED',
      expectedActionFingerprint: fingerprint,
      claimId: 'claim-a',
    });
    expect(claim).not.toBeNull();

    const changed = record('TASK_STATE_COMPLETED');
    changed.invocation.input = { orderId: 'different-order' };
    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/a2a/tasks/complete',
      headers,
      payload: {
        version: 'kab.a2a-task-complete.v1',
        claim,
        record: changed,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'a2a_transition_binding_mismatch' });
    await app.close();
  });
});
