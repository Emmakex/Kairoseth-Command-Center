import type { Collection, Db } from 'mongodb';
import type { AgentBridgeRuntimeSession } from './agent-bridge-control-store';

export type AgentBridgeAuditEvent = {
  version: 'kab.audit-event.v1';
  eventId: string;
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  type:
    | 'INVOCATION_RECEIVED'
    | 'POLICY_EVALUATED'
    | 'EXECUTION_STARTED'
    | 'EXECUTION_SUCCEEDED'
    | 'EXECUTION_FAILED';
  correlationId: string;
  toolId: string;
  actor: string;
  risk: 'READ' | 'WRITE' | 'CRITICAL';
  occurredAt: string;
  outcome?: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  message?: string;
  provenance?: {
    version: 'kab.provenance.v1';
    protocol: 'kairoseth-native' | 'mcp' | 'a2a' | 'rest' | 'webhook' | 'internal';
    rootCorrelationId: string;
    parentCorrelationId?: string;
    principal?: {
      issuer: string;
      subject: string;
      authenticationMethod: string;
      clientId?: string;
    };
  };
};

export type AgentBridgeAuditBatch = {
  version: 'kab.audit-batch.v1';
  batchId: string;
  sessionId: string;
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  events: AgentBridgeAuditEvent[];
};

export interface AgentBridgeAuditStore {
  ensureIndexes(): Promise<void>;
  ingestBatch(
    session: AgentBridgeRuntimeSession,
    batch: AgentBridgeAuditBatch,
  ): Promise<string[]>;
}

type AuditDocument = AgentBridgeAuditEvent & {
  receivedAt: string;
};

export class MongoAgentBridgeAuditStore implements AgentBridgeAuditStore {
  private readonly events: Collection<AuditDocument>;

  constructor(db: Db) {
    this.events = db.collection<AuditDocument>('agent_bridge_audit_events');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.events.createIndex({ tenantId: 1, eventId: 1 }, { unique: true }),
      this.events.createIndex({ tenantId: 1, installationId: 1, occurredAt: -1 }),
      this.events.createIndex({ tenantId: 1, correlationId: 1, occurredAt: 1 }),
    ]);
  }

  async ingestBatch(
    session: AgentBridgeRuntimeSession,
    batch: AgentBridgeAuditBatch,
  ): Promise<string[]> {
    if (
      batch.sessionId !== session.sessionId ||
      batch.tenantId !== session.tenantId ||
      batch.installationId !== session.installationId ||
      batch.bridgeInstanceId !== session.bridgeInstanceId
    ) {
      throw new Error('agent_bridge_audit_scope_mismatch');
    }

    const accepted: string[] = [];
    const receivedAt = new Date().toISOString();
    for (const event of batch.events) {
      if (
        event.tenantId !== session.tenantId ||
        event.installationId !== session.installationId ||
        event.bridgeInstanceId !== session.bridgeInstanceId
      ) {
        throw new Error('agent_bridge_audit_event_scope_mismatch');
      }

      const existing = await this.events.findOne({
        tenantId: session.tenantId,
        eventId: event.eventId,
      });
      if (existing) {
        if (!sameEvent(existing, event)) {
          throw new Error('agent_bridge_audit_event_id_conflict');
        }
        accepted.push(event.eventId);
        continue;
      }

      try {
        await this.events.insertOne({ ...event, receivedAt });
        accepted.push(event.eventId);
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const winner = await this.events.findOne({
          tenantId: session.tenantId,
          eventId: event.eventId,
        });
        if (!winner || !sameEvent(winner, event)) {
          throw new Error('agent_bridge_audit_event_id_conflict');
        }
        accepted.push(event.eventId);
      }
    }
    return accepted;
  }
}

function sameEvent(left: AuditDocument, right: AgentBridgeAuditEvent): boolean {
  const { receivedAt: _receivedAt, ...stored } = left;
  return canonicalJson(stored) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Unsupported canonical JSON value');
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported canonical JSON value');
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000,
  );
}
