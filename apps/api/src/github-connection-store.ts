import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import type { ExternalResource, IntegrationConnection, Scope } from '@kcc/domain';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';
import type { IntegrationSecretStore } from './integration-secret-store';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

export type CreateGitHubConnectionInput = {
  scope: WorkspaceScope;
  actorUserId: string;
  displayName: string;
  token: string;
};

export type DeleteGitHubConnectionResult =
  | { status: 'deleted'; connection: IntegrationConnection }
  | { status: 'in_use' }
  | { status: 'not_found' };

export interface GitHubConnectionStore {
  ensureIndexes(): Promise<void>;
  createConnection(input: CreateGitHubConnectionInput): Promise<IntegrationConnection>;
  listConnections(scope: WorkspaceScope): Promise<IntegrationConnection[]>;
  getConnection(scope: WorkspaceScope, connectionId: string): Promise<IntegrationConnection | null>;
  rotateCredential(
    scope: WorkspaceScope,
    actorUserId: string,
    connectionId: string,
    token: string,
  ): Promise<IntegrationConnection | null>;
  markValidationSuccess(
    scope: WorkspaceScope,
    actorUserId: string,
    connectionId: string,
    remoteAccount: { id: string; label: string },
  ): Promise<IntegrationConnection | null>;
  markValidationFailure(
    scope: WorkspaceScope,
    actorUserId: string,
    connectionId: string,
    errorCode: string,
  ): Promise<IntegrationConnection | null>;
  deleteConnection(
    scope: WorkspaceScope,
    actorUserId: string,
    connectionId: string,
  ): Promise<DeleteGitHubConnectionResult>;
  resolveCredential(
    scope: WorkspaceScope,
    connectionId: string,
    options?: { requireActive?: boolean },
  ): Promise<string | null>;
}

export class MongoGitHubConnectionStore implements GitHubConnectionStore {
  private readonly connections: Collection<IntegrationConnection>;
  private readonly resources: Collection<ExternalResource>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
    private readonly secrets: IntegrationSecretStore,
  ) {
    this.connections = db.collection<IntegrationConnection>('integration_connections');
    this.resources = db.collection<ExternalResource>('external_resources');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.connections.createIndex({ id: 1 }, { unique: true }),
      this.connections.createIndex({ 'scope.workspaceId': 1, provider: 1, updatedAt: -1 }),
      this.resources.createIndex({ 'scope.workspaceId': 1, connectionId: 1 }, { sparse: true }),
      this.secrets.ensureIndexes(),
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

  async createConnection(input: CreateGitHubConnectionInput): Promise<IntegrationConnection> {
    return this.transaction(async (session) => {
      const secretRef = await this.secrets.createSecret(input.scope, input.token, session);
      const now = new Date().toISOString();
      const connection: IntegrationConnection = {
        id: randomUUID(),
        scope: input.scope,
        provider: 'github',
        displayName: input.displayName.trim(),
        status: 'unverified',
        secretRef,
        createdAt: now,
        updatedAt: now,
      };

      await this.connections.insertOne(connection, { session });
      await this.outbox.enqueue(
        {
          scope: input.scope,
          type: 'integration.github.connected',
          actorUserId: input.actorUserId,
          entityType: 'integration_connection',
          entityId: connection.id,
          summary: connection.displayName,
          source: 'manual-api',
          metadata: { provider: 'github', credentialConfigured: true, status: 'unverified' },
        },
        session,
      );
      return connection;
    });
  }

  async listConnections(scope: WorkspaceScope): Promise<IntegrationConnection[]> {
    return this.connections
      .find({ scope, provider: 'github' })
      .sort({ updatedAt: -1 })
      .toArray();
  }

  async getConnection(
    scope: WorkspaceScope,
    connectionId: string,
  ): Promise<IntegrationConnection | null> {
    return this.connections.findOne({ scope, id: connectionId, provider: 'github' });
  }

  async rotateCredential(
    scope: WorkspaceScope,
    actorUserId: string,
    connectionId: string,
    token: string,
  ): Promise<IntegrationConnection | null> {
    return this.transaction(async (session) => {
      const connection = await this.connections.findOne(
        { scope, id: connectionId, provider: 'github' },
        { session },
      );
      if (!connection?.secretRef) return null;

      const replaced = await this.secrets.replaceSecret(scope, connection.secretRef, token, session);
      if (!replaced) return null;

      const updatedAt = new Date().toISOString();
      const updated = await this.connections.findOneAndUpdate(
        { scope, id: connectionId, provider: 'github' },
        {
          $set: { status: 'unverified', updatedAt },
          $unset: {
            lastValidatedAt: '',
            remoteAccountId: '',
            remoteAccountLabel: '',
            lastErrorCode: '',
          },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) return null;

      await this.outbox.enqueue(
        {
          scope,
          type: 'integration.github.credential_rotated',
          actorUserId,
          entityType: 'integration_connection',
          entityId: connectionId,
          summary: updated.displayName,
          source: 'manual-api',
          metadata: { provider: 'github', credentialConfigured: true, status: 'unverified' },
        },
        session,
      );
      return updated;
    });
  }

  async markValidationSuccess(
    scope: WorkspaceScope,
    actorUserId: string,
    connectionId: string,
    remoteAccount: { id: string; label: string },
  ): Promise<IntegrationConnection | null> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const updated = await this.connections.findOneAndUpdate(
        { scope, id: connectionId, provider: 'github' },
        {
          $set: {
            status: 'active',
            lastValidatedAt: now,
            remoteAccountId: remoteAccount.id,
            remoteAccountLabel: remoteAccount.label,
            updatedAt: now,
          },
          $unset: { lastErrorCode: '' },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) return null;
      await this.outbox.enqueue(
        {
          scope,
          type: 'integration.github.validation_succeeded',
          actorUserId,
          entityType: 'integration_connection',
          entityId: connectionId,
          summary: updated.displayName,
          source: 'github-api',
          metadata: {
            provider: 'github',
            remoteAccountId: remoteAccount.id,
            remoteAccountLabel: remoteAccount.label,
          },
        },
        session,
      );
      return updated;
    });
  }

  async markValidationFailure(
    scope: WorkspaceScope,
    actorUserId: string,
    connectionId: string,
    errorCode: string,
  ): Promise<IntegrationConnection | null> {
    return this.transaction(async (session) => {
      const now = new Date().toISOString();
      const updated = await this.connections.findOneAndUpdate(
        { scope, id: connectionId, provider: 'github' },
        {
          $set: { status: 'error', lastErrorCode: errorCode, updatedAt: now },
          $unset: { lastValidatedAt: '', remoteAccountId: '', remoteAccountLabel: '' },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) return null;
      await this.outbox.enqueue(
        {
          scope,
          type: 'integration.github.validation_failed',
          actorUserId,
          entityType: 'integration_connection',
          entityId: connectionId,
          summary: updated.displayName,
          source: 'github-api',
          metadata: { provider: 'github', errorCode },
        },
        session,
      );
      return updated;
    });
  }

  async deleteConnection(
    scope: WorkspaceScope,
    actorUserId: string,
    connectionId: string,
  ): Promise<DeleteGitHubConnectionResult> {
    return this.transaction(async (session) => {
      const connection = await this.connections.findOne(
        { scope, id: connectionId, provider: 'github' },
        { session },
      );
      if (!connection) return { status: 'not_found' };

      const inUse = await this.resources.findOne({ scope, connectionId }, { session, projection: { id: 1 } });
      if (inUse) return { status: 'in_use' };

      const deleted = await this.connections.deleteOne(
        { scope, id: connectionId, provider: 'github' },
        { session },
      );
      if (deleted.deletedCount !== 1) return { status: 'not_found' };

      if (connection.secretRef) {
        await this.secrets.deleteSecret(scope, connection.secretRef, session);
      }

      await this.outbox.enqueue(
        {
          scope,
          type: 'integration.github.disconnected',
          actorUserId,
          entityType: 'integration_connection',
          entityId: connection.id,
          summary: connection.displayName,
          source: 'manual-api',
          metadata: { provider: 'github' },
        },
        session,
      );
      return { status: 'deleted', connection };
    });
  }

  async resolveCredential(
    scope: WorkspaceScope,
    connectionId: string,
    options: { requireActive?: boolean } = {},
  ): Promise<string | null> {
    const connection = await this.connections.findOne({ scope, id: connectionId, provider: 'github' });
    if (!connection?.secretRef || connection.status === 'disabled') return null;
    if (options.requireActive && connection.status !== 'active') return null;
    return this.secrets.revealSecret(scope, connection.secretRef);
  }
}
