import { createHash, randomUUID } from 'node:crypto';
import type { Collection, Db, Filter } from 'mongodb';
import type { AgentBridgeApprovalService } from './agent-bridge-approval-store';
import type { AgentBridgeRuntimeSession } from './agent-bridge-control-store';

export type AgentBridgeCommandAckStatus =
  | 'executed'
  | 'approval_required'
  | 'denied'
  | 'failed'
  | 'rejected'
  | 'expired'
  | 'duplicate'
  | 'indeterminate';

export type AgentBridgeCommandOutcomeStatus = Exclude<
  AgentBridgeCommandAckStatus,
  'duplicate' | 'indeterminate'
>;

export type AgentBridgeCommandAcknowledgement = {
  version: 'kab.command-ack.v1';
  commandId: string;
  deliveryAttempt: number;
  sessionId: string;
  correlationId: string;
  status: AgentBridgeCommandAckStatus;
  completedAt: string;
  originalOutcome?: AgentBridgeCommandOutcomeStatus;
  reason?: string;
  output?: unknown;
};

export type AgentBridgeCommandEnvelope = {
  version: 'kab.command.v1';
  commandId: string;
  deliveryAttempt: number;
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  correlationId: string;
  actor: string;
  toolId: string;
  input: unknown;
  actionFingerprint: string;
  approvalToken?: string;
  issuedAt: string;
  expiresAt: string;
};

export type AgentBridgeQueuedCommand = {
  commandId: string;
  correlationId: string;
  installationId: string;
  toolId: string;
  state: 'queued' | 'delivered' | 'completed';
  issuedAt: string;
  expiresAt: string;
  deliveryAttempt: number;
  acknowledgement?: AgentBridgeCommandAcknowledgement;
};

export type AgentBridgeCommandHistoryCursor = {
  createdAt: string;
  commandId: string;
};

export type AgentBridgeCommandHistoryPage = {
  commands: AgentBridgeQueuedCommand[];
  nextCursor?: AgentBridgeCommandHistoryCursor;
};

export interface AgentBridgeExecutionStore {
  ensureIndexes(): Promise<void>;
  queueReadCommand(input: QueueCommandInput): Promise<AgentBridgeQueuedCommand | null>;
  queueApprovedCommand(input: QueueCommandInput): Promise<AgentBridgeQueuedCommand | null>;
  pullCommands(
    session: AgentBridgeRuntimeSession,
    limit: number,
  ): Promise<{ batchId: string; commands: AgentBridgeCommandEnvelope[] }>;
  acknowledgeCommand(
    session: AgentBridgeRuntimeSession,
    acknowledgement: AgentBridgeCommandAcknowledgement,
  ): Promise<boolean>;
  getCommand(tenantId: string, commandId: string): Promise<AgentBridgeQueuedCommand | null>;
  listCommands(input: {
    tenantId: string;
    installationId: string;
    limit: number;
    before?: AgentBridgeCommandHistoryCursor;
  }): Promise<AgentBridgeCommandHistoryPage>;
}

type QueueCommandInput = {
  tenantId: string;
  installationId: string;
  toolId: string;
  input: unknown;
  actor: string;
  createdBy: string;
  correlationId?: string;
  ttlSeconds?: number;
};

type InstallationDocument = {
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  status: 'active' | 'revoked';
};

type RuntimeSnapshotDocument = {
  tenantId: string;
  installationId: string;
  snapshot: {
    connectors: Array<{
      tools: Array<{
        runtimeToolId: string;
        risk: 'READ' | 'WRITE' | 'CRITICAL';
      }>;
    }>;
  };
};

type CommandDocument = {
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  commandId: string;
  correlationId: string;
  actor: string;
  toolId: string;
  input: unknown;
  actionFingerprint: string;
  approvalToken?: string;
  issuedAt: string;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
  state: 'queued' | 'delivered' | 'completed';
  deliveryAttempt: number;
  deliveredAt?: string;
  deliveryLeaseUntil?: string;
  deliveredToSessionId?: string;
  acknowledgement?: AgentBridgeCommandAcknowledgement;
};

const DEFAULT_COMMAND_TTL_SECONDS = 300;
const DEFAULT_APPROVED_COMMAND_TTL_SECONDS = 120;
const DELIVERY_LEASE_MS = 60_000;
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_HISTORY_LIMIT = 50;

export class MongoAgentBridgeExecutionStore implements AgentBridgeExecutionStore {
  private readonly installations: Collection<InstallationDocument>;
  private readonly snapshots: Collection<RuntimeSnapshotDocument>;
  private readonly commands: Collection<CommandDocument>;

  constructor(
    db: Db,
    private readonly approvalService?: AgentBridgeApprovalService,
  ) {
    this.installations = db.collection('agent_bridge_installations');
    this.snapshots = db.collection('agent_bridge_runtime_snapshots');
    this.commands = db.collection('agent_bridge_commands');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.commands.createIndex({ commandId: 1 }, { unique: true }),
      this.commands.createIndex({ tenantId: 1, correlationId: 1 }, { unique: true }),
      this.commands.createIndex({ tenantId: 1, installationId: 1, state: 1, createdAt: 1 }),
      this.commands.createIndex({ tenantId: 1, installationId: 1, createdAt: -1, commandId: -1 }),
      this.commands.createIndex({ expiresAt: 1 }),
    ]);
  }

  async queueReadCommand(input: QueueCommandInput): Promise<AgentBridgeQueuedCommand | null> {
    return this.queueCommand(input, 'read');
  }

  async queueApprovedCommand(input: QueueCommandInput): Promise<AgentBridgeQueuedCommand | null> {
    return this.queueCommand(input, 'approved-mutation');
  }

  private async queueCommand(
    input: QueueCommandInput,
    mode: 'read' | 'approved-mutation',
  ): Promise<AgentBridgeQueuedCommand | null> {
    const installation = await this.installations.findOne({
      tenantId: input.tenantId,
      installationId: input.installationId,
      status: 'active',
    });
    if (!installation) return null;

    const snapshot = await this.snapshots.findOne({
      tenantId: input.tenantId,
      installationId: input.installationId,
    });
    const tool = snapshot?.snapshot.connectors
      .flatMap((connector) => connector.tools)
      .find((candidate) => candidate.runtimeToolId === input.toolId);
    if (!tool) return null;
    if (mode === 'read' && tool.risk !== 'READ') return null;
    if (mode === 'approved-mutation' && !['WRITE', 'CRITICAL'].includes(tool.risk)) return null;

    const canonicalInput = canonicalJson(input.input);
    if (Buffer.byteLength(canonicalInput, 'utf8') > MAX_INPUT_BYTES) {
      throw new Error('Agent Bridge command input exceeds the safe size limit.');
    }

    const now = new Date();
    const ttlSeconds = input.ttlSeconds ?? (
      mode === 'approved-mutation'
        ? DEFAULT_APPROVED_COMMAND_TTL_SECONDS
        : DEFAULT_COMMAND_TTL_SECONDS
    );
    const maxTtl = mode === 'approved-mutation' ? 300 : 3600;
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > maxTtl) {
      throw new Error(`Agent Bridge command TTL must be between 30 and ${maxTtl} seconds.`);
    }

    const commandId = randomUUID();
    const correlationId = input.correlationId ?? randomUUID();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const actionFingerprint = createActionFingerprint({
      tenantId: input.tenantId,
      installationId: input.installationId,
      toolId: input.toolId,
      correlationId,
      input: input.input,
    });
    const approvalToken = mode === 'approved-mutation'
      ? await this.createApprovalToken({
          tenantId: input.tenantId,
          installationId: input.installationId,
          toolId: input.toolId,
          correlationId,
          actionFingerprint,
          expiresAt,
        })
      : undefined;

    const document: CommandDocument = {
      tenantId: input.tenantId,
      installationId: input.installationId,
      bridgeInstanceId: installation.bridgeInstanceId,
      commandId,
      correlationId,
      actor: input.actor,
      toolId: input.toolId,
      input: input.input,
      actionFingerprint,
      ...(approvalToken ? { approvalToken } : {}),
      issuedAt,
      expiresAt,
      createdAt: issuedAt,
      createdBy: input.createdBy,
      state: 'queued',
      deliveryAttempt: 0,
    };
    await this.commands.insertOne(document);
    return projectCommand(document);
  }

  private async createApprovalToken(input: {
    tenantId: string;
    installationId: string;
    toolId: string;
    correlationId: string;
    actionFingerprint: string;
    expiresAt: string;
  }): Promise<string> {
    if (!this.approvalService) throw new Error('agent_bridge_approval_unavailable');
    return this.approvalService.signApproval(input);
  }

  async pullCommands(
    session: AgentBridgeRuntimeSession,
    limit: number,
  ): Promise<{ batchId: string; commands: AgentBridgeCommandEnvelope[] }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Agent Bridge command pull limit must be between 1 and 100.');
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + DELIVERY_LEASE_MS).toISOString();
    const claimed: CommandDocument[] = [];

    for (let index = 0; index < limit; index += 1) {
      const command = await this.commands.findOneAndUpdate(
        {
          tenantId: session.tenantId,
          installationId: session.installationId,
          bridgeInstanceId: session.bridgeInstanceId,
          expiresAt: { $gt: nowIso },
          $or: [
            { state: 'queued' },
            { state: 'delivered', deliveryLeaseUntil: { $lte: nowIso } },
          ],
        },
        {
          $set: {
            state: 'delivered',
            deliveredAt: nowIso,
            deliveryLeaseUntil: leaseUntil,
            deliveredToSessionId: session.sessionId,
          },
          $inc: { deliveryAttempt: 1 },
        },
        {
          sort: { createdAt: 1 },
          returnDocument: 'after',
          includeResultMetadata: false,
        },
      );
      if (!command) break;
      claimed.push(command);
    }

    return {
      batchId: randomUUID(),
      commands: claimed.map((command) => ({
        version: 'kab.command.v1',
        commandId: command.commandId,
        deliveryAttempt: command.deliveryAttempt,
        tenantId: command.tenantId,
        installationId: command.installationId,
        bridgeInstanceId: command.bridgeInstanceId,
        correlationId: command.correlationId,
        actor: command.actor,
        toolId: command.toolId,
        input: command.input,
        actionFingerprint: command.actionFingerprint,
        ...(command.approvalToken ? { approvalToken: command.approvalToken } : {}),
        issuedAt: command.issuedAt,
        expiresAt: command.expiresAt,
      })),
    };
  }

  async acknowledgeCommand(
    session: AgentBridgeRuntimeSession,
    acknowledgement: AgentBridgeCommandAcknowledgement,
  ): Promise<boolean> {
    if (acknowledgement.sessionId !== session.sessionId) return false;

    const existing = await this.commands.findOne({
      tenantId: session.tenantId,
      installationId: session.installationId,
      bridgeInstanceId: session.bridgeInstanceId,
      commandId: acknowledgement.commandId,
    });
    if (!existing) return false;

    if (existing.state === 'completed') {
      return sameAcknowledgement(existing.acknowledgement, acknowledgement);
    }

    if (
      existing.state !== 'delivered' ||
      existing.deliveredToSessionId !== session.sessionId ||
      existing.deliveryAttempt !== acknowledgement.deliveryAttempt ||
      existing.correlationId !== acknowledgement.correlationId
    ) {
      return false;
    }

    const result = await this.commands.updateOne(
      {
        tenantId: session.tenantId,
        installationId: session.installationId,
        bridgeInstanceId: session.bridgeInstanceId,
        commandId: acknowledgement.commandId,
        state: 'delivered',
        deliveredToSessionId: session.sessionId,
        deliveryAttempt: acknowledgement.deliveryAttempt,
        correlationId: acknowledgement.correlationId,
      },
      {
        $set: {
          state: 'completed',
          acknowledgement,
        },
        $unset: {
          deliveryLeaseUntil: '',
        },
      },
    );
    return result.modifiedCount === 1;
  }

  async getCommand(
    tenantId: string,
    commandId: string,
  ): Promise<AgentBridgeQueuedCommand | null> {
    const document = await this.commands.findOne({ tenantId, commandId });
    return document ? projectCommand(document) : null;
  }

  async listCommands(input: {
    tenantId: string;
    installationId: string;
    limit: number;
    before?: AgentBridgeCommandHistoryCursor;
  }): Promise<AgentBridgeCommandHistoryPage> {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_HISTORY_LIMIT) {
      throw new Error(`Agent Bridge command history limit must be between 1 and ${MAX_HISTORY_LIMIT}.`);
    }
    if (
      input.before &&
      (!Number.isFinite(Date.parse(input.before.createdAt)) || !input.before.commandId)
    ) {
      throw new Error('Invalid Agent Bridge command history cursor.');
    }

    const filter: Filter<CommandDocument> = {
      tenantId: input.tenantId,
      installationId: input.installationId,
      ...(input.before
        ? {
            $or: [
              { createdAt: { $lt: input.before.createdAt } },
              {
                createdAt: input.before.createdAt,
                commandId: { $lt: input.before.commandId },
              },
            ],
          }
        : {}),
    };
    const documents = await this.commands
      .find(filter)
      .sort({ createdAt: -1, commandId: -1 })
      .limit(input.limit + 1)
      .toArray();
    const hasMore = documents.length > input.limit;
    const page = documents.slice(0, input.limit);
    const last = page.at(-1);

    return {
      commands: page.map(projectCommand),
      ...(hasMore && last
        ? {
            nextCursor: {
              createdAt: last.createdAt,
              commandId: last.commandId,
            },
          }
        : {}),
    };
  }
}

function projectCommand(document: CommandDocument): AgentBridgeQueuedCommand {
  return {
    commandId: document.commandId,
    correlationId: document.correlationId,
    installationId: document.installationId,
    toolId: document.toolId,
    state: document.state,
    issuedAt: document.issuedAt,
    expiresAt: document.expiresAt,
    deliveryAttempt: document.deliveryAttempt,
    ...(document.acknowledgement
      ? { acknowledgement: document.acknowledgement }
      : {}),
  };
}

function sameAcknowledgement(
  left: AgentBridgeCommandAcknowledgement | undefined,
  right: AgentBridgeCommandAcknowledgement,
): boolean {
  return Boolean(left) && canonicalJson(left) === canonicalJson(right);
}

function createActionFingerprint(input: {
  tenantId: string;
  installationId: string;
  toolId: string;
  correlationId: string;
  input: unknown;
}): string {
  const payload = canonicalJson({
    version: 'kab.action.v1',
    tenantId: input.tenantId,
    installationId: input.installationId,
    toolId: input.toolId,
    correlationId: input.correlationId,
    input: input.input,
  });
  return createHash('sha256').update(payload, 'utf8').digest('base64url');
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Unsupported canonical JSON value');
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported canonical JSON value');
}
