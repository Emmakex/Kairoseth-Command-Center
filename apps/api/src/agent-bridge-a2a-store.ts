import type { Collection, Db } from 'mongodb';

export const AGENT_BRIDGE_A2A_TASK_STATES = [
  'TASK_STATE_UNSPECIFIED',
  'TASK_STATE_SUBMITTED',
  'TASK_STATE_WORKING',
  'TASK_STATE_COMPLETED',
  'TASK_STATE_FAILED',
  'TASK_STATE_CANCELED',
  'TASK_STATE_INPUT_REQUIRED',
  'TASK_STATE_REJECTED',
  'TASK_STATE_AUTH_REQUIRED',
] as const;

export type AgentBridgeA2ATaskState = (typeof AGENT_BRIDGE_A2A_TASK_STATES)[number];

export type AgentBridgeA2AScope = {
  actor: string;
  tenantId: string;
  installationId: string;
};

export type AgentBridgeA2AStoredTask = {
  task: {
    id: string;
    status: {
      state: AgentBridgeA2ATaskState;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  scope: AgentBridgeA2AScope;
  invocation: {
    toolId: string;
    input: unknown;
    correlationId: string;
    actionFingerprint: string;
    provenance?: unknown;
    [key: string]: unknown;
  };
};

export type AgentBridgeA2ATransitionClaim = {
  claimId: string;
  record: AgentBridgeA2AStoredTask;
};

export type AgentBridgeA2ASaveResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'agent_bridge_a2a_task_scope_collision'
        | 'agent_bridge_a2a_task_claim_active'
        | 'agent_bridge_a2a_task_save_conflict';
    };

export interface AgentBridgeA2AStore {
  ensureIndexes(): Promise<void>;
  save(record: AgentBridgeA2AStoredTask): Promise<AgentBridgeA2ASaveResult>;
  get(
    taskId: string,
    scope: AgentBridgeA2AScope,
  ): Promise<AgentBridgeA2AStoredTask | null>;
  claim(input: {
    taskId: string;
    scope: AgentBridgeA2AScope;
    expectedState: AgentBridgeA2ATaskState;
    expectedActionFingerprint: string;
    claimId: string;
  }): Promise<AgentBridgeA2ATransitionClaim | null>;
  complete(
    claim: AgentBridgeA2ATransitionClaim,
    record: AgentBridgeA2AStoredTask,
  ): Promise<boolean>;
}

type AgentBridgeA2ADocument = {
  taskId: string;
  scope: AgentBridgeA2AScope;
  record: AgentBridgeA2AStoredTask;
  claimId?: string;
  createdAt: string;
  updatedAt: string;
};

function sameScope(left: AgentBridgeA2AScope, right: AgentBridgeA2AScope): boolean {
  return (
    left.actor === right.actor &&
    left.tenantId === right.tenantId &&
    left.installationId === right.installationId
  );
}

function scopeFilter(scope: AgentBridgeA2AScope) {
  return {
    'scope.actor': scope.actor,
    'scope.tenantId': scope.tenantId,
    'scope.installationId': scope.installationId,
  } as const;
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MongoAgentBridgeA2AStore implements AgentBridgeA2AStore {
  private readonly tasks: Collection<AgentBridgeA2ADocument>;

  constructor(db: Db) {
    this.tasks = db.collection<AgentBridgeA2ADocument>('agent_bridge_a2a_tasks');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.tasks.createIndex({ taskId: 1 }, { unique: true }),
      this.tasks.createIndex({
        'scope.tenantId': 1,
        'scope.actor': 1,
        'scope.installationId': 1,
        taskId: 1,
      }),
    ]);
  }

  async save(record: AgentBridgeA2AStoredTask): Promise<AgentBridgeA2ASaveResult> {
    const now = new Date().toISOString();
    try {
      await this.tasks.updateOne(
        {
          taskId: record.task.id,
          ...scopeFilter(record.scope),
          claimId: { $exists: false },
        },
        {
          $set: {
            scope: clone(record.scope),
            record: clone(record),
            updatedAt: now,
          },
          $setOnInsert: {
            taskId: record.task.id,
            createdAt: now,
          },
        },
        { upsert: true },
      );
      return { ok: true };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;

      const existing = await this.tasks.findOne({ taskId: record.task.id });
      if (!existing) return { ok: false, code: 'agent_bridge_a2a_task_save_conflict' };
      if (!sameScope(existing.scope, record.scope)) {
        return { ok: false, code: 'agent_bridge_a2a_task_scope_collision' };
      }
      if (existing.claimId) {
        return { ok: false, code: 'agent_bridge_a2a_task_claim_active' };
      }
      return { ok: false, code: 'agent_bridge_a2a_task_save_conflict' };
    }
  }

  async get(
    taskId: string,
    scope: AgentBridgeA2AScope,
  ): Promise<AgentBridgeA2AStoredTask | null> {
    const document = await this.tasks.findOne({ taskId, ...scopeFilter(scope) });
    return document ? clone(document.record) : null;
  }

  async claim(input: {
    taskId: string;
    scope: AgentBridgeA2AScope;
    expectedState: AgentBridgeA2ATaskState;
    expectedActionFingerprint: string;
    claimId: string;
  }): Promise<AgentBridgeA2ATransitionClaim | null> {
    const document = await this.tasks.findOneAndUpdate(
      {
        taskId: input.taskId,
        ...scopeFilter(input.scope),
        claimId: { $exists: false },
        'record.task.status.state': input.expectedState,
        'record.invocation.actionFingerprint': input.expectedActionFingerprint,
      },
      {
        $set: {
          claimId: input.claimId,
          'record.task.status.state': 'TASK_STATE_WORKING',
          updatedAt: new Date().toISOString(),
        },
      },
      { returnDocument: 'before', includeResultMetadata: false },
    );

    if (!document) return null;
    return {
      claimId: input.claimId,
      record: clone(document.record),
    };
  }

  async complete(
    claim: AgentBridgeA2ATransitionClaim,
    record: AgentBridgeA2AStoredTask,
  ): Promise<boolean> {
    const result = await this.tasks.updateOne(
      {
        taskId: record.task.id,
        ...scopeFilter(record.scope),
        claimId: claim.claimId,
        'record.task.status.state': 'TASK_STATE_WORKING',
        'record.invocation.actionFingerprint': claim.record.invocation.actionFingerprint,
      },
      {
        $set: {
          scope: clone(record.scope),
          record: clone(record),
          updatedAt: new Date().toISOString(),
        },
        $unset: { claimId: '' },
      },
    );

    return result.matchedCount === 1;
  }
}
