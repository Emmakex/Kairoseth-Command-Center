import { randomBytes, randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import { MongoServerError } from 'mongodb';
import type { ExternalResource, IntegrationConnection, Scope } from '@kcc/domain';
import type { IntegrationSecretStore } from './integration-secrets.js';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

type GitHubWebhookEndpointDocument = {
  id: string;
  workspaceId: string;
  connectionId: string;
  secretRef: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type GitHubWebhookDeliveryDocument = {
  id: string;
  endpointId: string;
  workspaceId: string;
  deliveryId: string;
  event: string;
  receivedAt: string;
  expiresAt: Date;
};

export type GitHubWebhookEndpoint = Omit<GitHubWebhookEndpointDocument, 'secretRef'>;

export type ProvisionGitHubWebhookResult =
  | { status: 'created'; endpoint: GitHubWebhookEndpoint; secret: string }
  | { status: 'exists'; endpoint: GitHubWebhookEndpoint };

export type RotateGitHubWebhookSecretResult =
  | { status: 'rotated'; endpoint: GitHubWebhookEndpoint; secret: string }
  | { status: 'not_found' };

export type ResolvedGitHubWebhookEndpoint = GitHubWebhookEndpointDocument & { secret: string };

export interface GitHubWebhookStore {
  ensureIndexes(): Promise<void>;
  provision(scope: WorkspaceScope, connectionId: string): Promise<ProvisionGitHubWebhookResult>;
  get(scope: WorkspaceScope, connectionId: string): Promise<GitHubWebhookEndpoint | null>;
  rotateSecret(scope: WorkspaceScope, connectionId: string): Promise<RotateGitHubWebhookSecretResult>;
  delete(scope: WorkspaceScope, connectionId: string): Promise<boolean>;
  resolve(endpointId: string): Promise<ResolvedGitHubWebhookEndpoint | null>;
  resolveRepository(
    workspaceId: string,
    connectionId: string,
    externalId: string,
  ): Promise<ExternalResource | null>;
  claimDelivery(input: {
    endpointId: string;
    workspaceId: string;
    deliveryId: string;
    event: string;
    retentionDays?: number;
  }): Promise<boolean>;
  releaseDelivery(endpointId: string, workspaceId: string, deliveryId: string): Promise<boolean>;
}

function endpointView(document: GitHubWebhookEndpointDocument): GitHubWebhookEndpoint {
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    connectionId: document.connectionId,
    enabled: document.enabled,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function webhookSecret(): string {
  return randomBytes(32).toString('hex');
}

function validId(value: string, field: string, max = 200): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`github_webhook_${field}_invalid`);
  return normalized;
}

export class MongoGitHubWebhookStore implements GitHubWebhookStore {
  private readonly endpoints: Collection<GitHubWebhookEndpointDocument>;
  private readonly deliveries: Collection<GitHubWebhookDeliveryDocument>;
  private readonly resources: Collection<ExternalResource>;
  private readonly connections: Collection<IntegrationConnection>;

  constructor(
    private readonly client: MongoClient,
    db: Db,
    private readonly secrets: IntegrationSecretStore,
  ) {
    this.endpoints = db.collection<GitHubWebhookEndpointDocument>('github_webhook_endpoints');
    this.deliveries = db.collection<GitHubWebhookDeliveryDocument>('github_webhook_deliveries');
    this.resources = db.collection<ExternalResource>('external_resources');
    this.connections = db.collection<IntegrationConnection>('integration_connections');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.endpoints.createIndex({ id: 1 }, { unique: true }),
      this.endpoints.createIndex({ workspaceId: 1, connectionId: 1 }, { unique: true }),
      this.deliveries.createIndex({ endpointId: 1, deliveryId: 1 }, { unique: true }),
      this.deliveries.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.resources.createIndex({ 'scope.workspaceId': 1, connectionId: 1, provider: 1, kind: 1 }),
      this.connections.createIndex({ 'scope.workspaceId': 1, id: 1, provider: 1 }),
      this.secrets.ensureIndexes(),
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

  async provision(
    scope: WorkspaceScope,
    connectionId: string,
  ): Promise<ProvisionGitHubWebhookResult> {
    const normalizedConnectionId = validId(connectionId, 'connection_id');
    return this.transaction(async (session) => {
      const existing = await this.endpoints.findOne(
        { workspaceId: scope.workspaceId, connectionId: normalizedConnectionId },
        { session },
      );
      if (existing) return { status: 'exists', endpoint: endpointView(existing) };

      const secret = webhookSecret();
      const secretRef = await this.secrets.createSecret(scope, secret, session);
      const now = new Date().toISOString();
      const document: GitHubWebhookEndpointDocument = {
        id: `ghwh_${randomUUID()}`,
        workspaceId: scope.workspaceId,
        connectionId: normalizedConnectionId,
        secretRef,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      };
      await this.endpoints.insertOne(document, { session });
      return { status: 'created', endpoint: endpointView(document), secret };
    });
  }

  async get(scope: WorkspaceScope, connectionId: string): Promise<GitHubWebhookEndpoint | null> {
    const document = await this.endpoints.findOne({
      workspaceId: scope.workspaceId,
      connectionId: validId(connectionId, 'connection_id'),
    });
    return document ? endpointView(document) : null;
  }

  async rotateSecret(
    scope: WorkspaceScope,
    connectionId: string,
  ): Promise<RotateGitHubWebhookSecretResult> {
    const normalizedConnectionId = validId(connectionId, 'connection_id');
    return this.transaction(async (session) => {
      const document = await this.endpoints.findOne(
        { workspaceId: scope.workspaceId, connectionId: normalizedConnectionId },
        { session },
      );
      if (!document) return { status: 'not_found' };

      const secret = webhookSecret();
      const replaced = await this.secrets.replaceSecret(scope, document.secretRef, secret, session);
      if (!replaced) throw new Error('github_webhook_secret_missing');
      const updated = await this.endpoints.findOneAndUpdate(
        { id: document.id, workspaceId: scope.workspaceId },
        { $set: { enabled: true, updatedAt: new Date().toISOString() } },
        { session, returnDocument: 'after' },
      );
      if (!updated) throw new Error('github_webhook_endpoint_update_failed');
      return { status: 'rotated', endpoint: endpointView(updated), secret };
    });
  }

  async delete(scope: WorkspaceScope, connectionId: string): Promise<boolean> {
    const normalizedConnectionId = validId(connectionId, 'connection_id');
    return this.transaction(async (session) => {
      const document = await this.endpoints.findOne(
        { workspaceId: scope.workspaceId, connectionId: normalizedConnectionId },
        { session },
      );
      if (!document) return false;

      const deleted = await this.endpoints.deleteOne(
        { id: document.id, workspaceId: scope.workspaceId },
        { session },
      );
      if (deleted.deletedCount !== 1) return false;
      await this.deliveries.deleteMany({ endpointId: document.id, workspaceId: scope.workspaceId }, { session });
      await this.secrets.deleteSecret(scope, document.secretRef, session);
      return true;
    });
  }

  async resolve(endpointId: string): Promise<ResolvedGitHubWebhookEndpoint | null> {
    const document = await this.endpoints.findOne({
      id: validId(endpointId, 'endpoint_id'),
      enabled: true,
    });
    if (!document) return null;

    const scope: WorkspaceScope = { kind: 'workspace', workspaceId: document.workspaceId };
    const connection = await this.connections.findOne({
      scope,
      id: document.connectionId,
      provider: 'github',
      status: 'active',
      lastValidatedAt: { $exists: true },
    });
    if (!connection) return null;

    const secret = await this.secrets.revealSecret(scope, document.secretRef);
    return secret ? { ...document, secret } : null;
  }

  async resolveRepository(
    workspaceId: string,
    connectionId: string,
    externalId: string,
  ): Promise<ExternalResource | null> {
    return this.resources.findOne({
      scope: { kind: 'workspace', workspaceId: validId(workspaceId, 'workspace_id') },
      connectionId: validId(connectionId, 'connection_id'),
      provider: 'github',
      kind: 'repository',
      externalId: validId(externalId, 'repository_id', 300).toLowerCase(),
    });
  }

  async claimDelivery(input: {
    endpointId: string;
    workspaceId: string;
    deliveryId: string;
    event: string;
    retentionDays?: number;
  }): Promise<boolean> {
    const now = new Date();
    const retentionDays = Math.min(30, Math.max(1, Math.floor(input.retentionDays ?? 7)));
    const document: GitHubWebhookDeliveryDocument = {
      id: `ghwd_${randomUUID()}`,
      endpointId: validId(input.endpointId, 'endpoint_id'),
      workspaceId: validId(input.workspaceId, 'workspace_id'),
      deliveryId: validId(input.deliveryId, 'delivery_id'),
      event: validId(input.event, 'event', 100),
      receivedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000),
    };

    try {
      await this.deliveries.insertOne(document);
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return false;
      throw error;
    }
  }

  async releaseDelivery(endpointId: string, workspaceId: string, deliveryId: string): Promise<boolean> {
    const result = await this.deliveries.deleteOne({
      endpointId: validId(endpointId, 'endpoint_id'),
      workspaceId: validId(workspaceId, 'workspace_id'),
      deliveryId: validId(deliveryId, 'delivery_id'),
    });
    return result.deletedCount === 1;
  }
}
