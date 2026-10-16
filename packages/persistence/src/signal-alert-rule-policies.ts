import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import type { Scope } from '@kcc/domain';
import {
  defaultSignalAlertRulePolicies,
  isBuiltInSignalAlertRuleId,
  type BuiltInSignalAlertRuleId,
  type DerivedAlertSeverity,
  type SignalAlertRulePolicy,
  type SignalAlertRulePolicyMap,
} from '@kcc/integrations/signal-alert-rules';
import { MongoAuditOutboxStore } from './audit-outbox.js';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

export type StoredSignalAlertRulePolicy = SignalAlertRulePolicy & {
  id: string;
  workspaceId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type EffectiveSignalAlertRulePolicy = SignalAlertRulePolicy & {
  overridden: boolean;
  updatedAt?: string;
};

export interface SignalAlertRulePolicyStore {
  ensureIndexes(): Promise<void>;
  listEffective(workspaceId: string): Promise<EffectiveSignalAlertRulePolicy[]>;
  getPolicyMap(workspaceId: string): Promise<SignalAlertRulePolicyMap>;
  upsert(input: {
    workspaceId: string;
    actorUserId: string;
    ruleId: BuiltInSignalAlertRuleId;
    enabled: boolean;
    severity: DerivedAlertSeverity;
  }): Promise<StoredSignalAlertRulePolicy>;
}

const severities = new Set<DerivedAlertSeverity>(['info', 'warning', 'urgent', 'critical']);

function validText(value: string, field: string, maxLength = 200): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`signal_alert_rule_policy_${field}_invalid`);
  }
  return normalized;
}

function validSeverity(value: DerivedAlertSeverity): DerivedAlertSeverity {
  if (!severities.has(value)) throw new Error('signal_alert_rule_policy_severity_invalid');
  return value;
}

export class MongoSignalAlertRulePolicyStore implements SignalAlertRulePolicyStore {
  private readonly policies: Collection<StoredSignalAlertRulePolicy>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.policies = db.collection<StoredSignalAlertRulePolicy>('signal_alert_rule_policies');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.policies.createIndex({ id: 1 }, { unique: true }),
      this.policies.createIndex({ workspaceId: 1, ruleId: 1 }, { unique: true }),
      this.outbox.ensureIndexes(),
    ]);
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

  async listEffective(workspaceId: string): Promise<EffectiveSignalAlertRulePolicy[]> {
    const normalizedWorkspaceId = validText(workspaceId, 'workspace_id');
    const overrides = await this.policies.find({ workspaceId: normalizedWorkspaceId }).toArray();
    const byRule = new Map(overrides.map((policy) => [policy.ruleId, policy]));

    return defaultSignalAlertRulePolicies().map((defaults) => {
      const override = byRule.get(defaults.ruleId);
      return override
        ? {
            ruleId: override.ruleId,
            enabled: override.enabled,
            severity: override.severity,
            overridden: true,
            updatedAt: override.updatedAt,
          }
        : { ...defaults, overridden: false };
    });
  }

  async getPolicyMap(workspaceId: string): Promise<SignalAlertRulePolicyMap> {
    const effective = await this.listEffective(workspaceId);
    return Object.fromEntries(
      effective.map((policy) => [
        policy.ruleId,
        { enabled: policy.enabled, severity: policy.severity },
      ]),
    ) as SignalAlertRulePolicyMap;
  }

  async upsert(input: {
    workspaceId: string;
    actorUserId: string;
    ruleId: BuiltInSignalAlertRuleId;
    enabled: boolean;
    severity: DerivedAlertSeverity;
  }): Promise<StoredSignalAlertRulePolicy> {
    const workspaceId = validText(input.workspaceId, 'workspace_id');
    const actorUserId = validText(input.actorUserId, 'actor_user_id');
    if (!isBuiltInSignalAlertRuleId(input.ruleId)) {
      throw new Error('signal_alert_rule_policy_rule_id_invalid');
    }
    if (typeof input.enabled !== 'boolean') {
      throw new Error('signal_alert_rule_policy_enabled_invalid');
    }
    const severity = validSeverity(input.severity);
    const scope: WorkspaceScope = { kind: 'workspace', workspaceId };

    return this.transaction(async (session) => {
      const existing = await this.policies.findOne(
        { workspaceId, ruleId: input.ruleId },
        { session },
      );
      const now = new Date().toISOString();

      if (!existing) {
        const policy: StoredSignalAlertRulePolicy = {
          id: randomUUID(),
          workspaceId,
          ruleId: input.ruleId,
          enabled: input.enabled,
          severity,
          updatedByUserId: actorUserId,
          createdAt: now,
          updatedAt: now,
        };
        await this.policies.insertOne(policy, { session });
        await this.outbox.enqueue(
          {
            scope,
            type: 'automation.rule_policy_changed',
            entityType: 'automation_rule_policy',
            entityId: policy.id,
            summary: `Automation rule policy changed: ${policy.ruleId}`,
            source: 'automation-rules',
            metadata: {
              ruleId: policy.ruleId,
              enabled: policy.enabled,
              severity: policy.severity,
              previous: null,
            },
          },
          session,
        );
        return policy;
      }

      const updated = await this.policies.findOneAndUpdate(
        { id: existing.id, workspaceId, ruleId: input.ruleId, updatedAt: existing.updatedAt },
        {
          $set: {
            enabled: input.enabled,
            severity,
            updatedByUserId: actorUserId,
            updatedAt: now,
          },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw new Error('signal_alert_rule_policy_update_conflict');

      await this.outbox.enqueue(
        {
          scope,
          type: 'automation.rule_policy_changed',
          entityType: 'automation_rule_policy',
          entityId: updated.id,
          summary: `Automation rule policy changed: ${updated.ruleId}`,
          source: 'automation-rules',
          metadata: {
            ruleId: updated.ruleId,
            enabled: updated.enabled,
            severity: updated.severity,
            previous: {
              enabled: existing.enabled,
              severity: existing.severity,
            },
          },
        },
        session,
      );
      return updated;
    });
  }
}
