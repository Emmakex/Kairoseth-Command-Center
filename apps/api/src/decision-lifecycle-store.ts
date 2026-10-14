import { randomUUID } from 'node:crypto';
import type { Collection, Db, MongoClient } from 'mongodb';
import type { Decision, Project, Scope } from '@kcc/domain';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';

export type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

export type DecisionLifecycleError =
  | 'project_not_found'
  | 'decision_not_found'
  | 'decision_not_active'
  | 'decision_project_mismatch'
  | 'decision_transition_conflict';

export type DecisionLifecycleResult =
  | { ok: true; decision: Decision }
  | { ok: false; error: DecisionLifecycleError };

export type CreateDecisionLifecycleInput = {
  scope: WorkspaceScope;
  title: string;
  decision: string;
  madeBy: string;
  context?: string;
  projectId?: string;
  supersedesId?: string;
  madeAt?: string;
};

export type ReverseDecisionLifecycleInput = {
  scope: WorkspaceScope;
  decisionId: string;
  actorUserId: string;
  reason: string;
};

export interface DecisionLifecycleStore {
  ensureIndexes(): Promise<void>;
  createWithAudit(input: CreateDecisionLifecycleInput): Promise<DecisionLifecycleResult>;
  reverseWithAudit(input: ReverseDecisionLifecycleInput): Promise<DecisionLifecycleResult>;
}

export class MongoDecisionLifecycleStore implements DecisionLifecycleStore {
  private readonly projects: Collection<Project>;
  private readonly decisions: Collection<Decision>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.projects = db.collection<Project>('projects');
    this.decisions = db.collection<Decision>('decisions');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await this.outbox.ensureIndexes();
  }

  async createWithAudit(input: CreateDecisionLifecycleInput): Promise<DecisionLifecycleResult> {
    const session = this.client.startSession();
    let outcome: DecisionLifecycleResult = { ok: false, error: 'decision_transition_conflict' };

    try {
      await session.withTransaction(async () => {
        if (input.projectId) {
          const project = await this.projects.findOne(
            { scope: input.scope, id: input.projectId },
            { projection: { _id: 1 }, session },
          );
          if (!project) {
            outcome = { ok: false, error: 'project_not_found' };
            return;
          }
        }

        let superseded: Decision | null = null;
        let effectiveProjectId = input.projectId;
        if (input.supersedesId) {
          superseded = await this.decisions.findOne(
            { scope: input.scope, id: input.supersedesId },
            { session },
          );
          if (!superseded) {
            outcome = { ok: false, error: 'decision_not_found' };
            return;
          }
          if (superseded.status !== 'active') {
            outcome = { ok: false, error: 'decision_not_active' };
            return;
          }
          if (input.projectId && superseded.projectId && input.projectId !== superseded.projectId) {
            outcome = { ok: false, error: 'decision_project_mismatch' };
            return;
          }
          effectiveProjectId = input.projectId ?? superseded.projectId;

          const transition = await this.decisions.updateOne(
            { scope: input.scope, id: superseded.id, status: 'active' },
            { $set: { status: 'superseded', updatedAt: new Date().toISOString() } },
            { session },
          );
          if (transition.matchedCount === 0) {
            outcome = { ok: false, error: 'decision_transition_conflict' };
            return;
          }
        }

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
          ...(effectiveProjectId ? { projectId: effectiveProjectId } : {}),
          ...(input.context?.trim() ? { context: input.context.trim() } : {}),
          ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
        };
        await this.decisions.insertOne(decision, { session });

        const auditEvents = [];
        if (superseded) {
          auditEvents.push({
            scope: input.scope,
            type: 'decision.superseded',
            actorUserId: input.madeBy,
            entityType: 'decision',
            entityId: superseded.id,
            summary: superseded.title,
            source: 'manual-api',
            metadata: { replacementDecisionId: decision.id },
          });
        }
        auditEvents.push({
          scope: input.scope,
          type: 'decision.created',
          actorUserId: input.madeBy,
          entityType: 'decision',
          entityId: decision.id,
          summary: decision.title,
          source: 'manual-api',
          metadata: {
            ...(decision.projectId ? { projectId: decision.projectId } : {}),
            ...(decision.supersedesId ? { supersedesId: decision.supersedesId } : {}),
          },
        });
        await this.outbox.enqueueMany(auditEvents, session);
        outcome = { ok: true, decision };
      });
      return outcome;
    } finally {
      await session.endSession();
    }
  }

  async reverseWithAudit(input: ReverseDecisionLifecycleInput): Promise<DecisionLifecycleResult> {
    const session = this.client.startSession();
    let outcome: DecisionLifecycleResult = { ok: false, error: 'decision_transition_conflict' };

    try {
      await session.withTransaction(async () => {
        const existing = await this.decisions.findOne(
          { scope: input.scope, id: input.decisionId },
          { session },
        );
        if (!existing) {
          outcome = { ok: false, error: 'decision_not_found' };
          return;
        }
        if (existing.status !== 'active') {
          outcome = { ok: false, error: 'decision_not_active' };
          return;
        }

        const now = new Date().toISOString();
        const transition = await this.decisions.updateOne(
          { scope: input.scope, id: input.decisionId, status: 'active' },
          { $set: { status: 'reversed', updatedAt: now } },
          { session },
        );
        if (transition.matchedCount === 0) {
          outcome = { ok: false, error: 'decision_transition_conflict' };
          return;
        }

        const decision: Decision = { ...existing, status: 'reversed', updatedAt: now };
        await this.outbox.enqueue(
          {
            scope: input.scope,
            type: 'decision.reversed',
            actorUserId: input.actorUserId,
            entityType: 'decision',
            entityId: decision.id,
            summary: decision.title,
            source: 'manual-api',
            metadata: { reason: input.reason },
          },
          session,
        );
        outcome = { ok: true, decision };
      });
      return outcome;
    } finally {
      await session.endSession();
    }
  }
}
