import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import type { ExternalResource, IntegrationConnection, Project, Scope } from '@kcc/domain';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

export type CreateGitHubRepositoryLinkInput = {
  scope: WorkspaceScope;
  actorUserId: string;
  projectId: string;
  owner: string;
  repository: string;
  externalId: string;
  url: string;
  defaultBranch?: string;
};

export type BindGitHubRepositoryConnectionResult =
  | { status: 'bound'; resource: ExternalResource }
  | { status: 'repository_not_found' }
  | { status: 'connection_not_found' }
  | { status: 'connection_not_validated' };

export type GitHubRepositorySyncInput = {
  scope: WorkspaceScope;
  actorUserId: string;
  resourceId: string;
  connectionId: string;
  githubRepositoryId: string;
  remoteFullName: string;
  defaultBranch: string;
  latestCommitSha: string;
  latestCommitUrl?: string;
  latestCommitAt?: string;
  remoteUpdatedAt?: string;
  private: boolean;
  archived: boolean;
  syncedAt: string;
};

export interface GitHubRepositoryStore {
  ensureIndexes(): Promise<void>;
  createRepositoryLink(input: CreateGitHubRepositoryLinkInput): Promise<ExternalResource | null>;
  listRepositoryLinks(scope: WorkspaceScope, projectId?: string): Promise<ExternalResource[]>;
  getRepositoryLink(scope: WorkspaceScope, resourceId: string): Promise<ExternalResource | null>;
  bindConnection(
    scope: WorkspaceScope,
    actorUserId: string,
    resourceId: string,
    connectionId: string,
  ): Promise<BindGitHubRepositoryConnectionResult>;
  applySyncResult(input: GitHubRepositorySyncInput): Promise<ExternalResource | null>;
  recordSyncFailure(
    scope: WorkspaceScope,
    actorUserId: string,
    resourceId: string,
    errorCode: string,
  ): Promise<void>;
  deleteRepositoryLink(
    scope: WorkspaceScope,
    actorUserId: string,
    resourceId: string,
  ): Promise<ExternalResource | null>;
}

export class MongoGitHubRepositoryStore implements GitHubRepositoryStore {
  private readonly resources: Collection<ExternalResource>;
  private readonly projects: Collection<Project>;
  private readonly connections: Collection<IntegrationConnection>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.resources = db.collection<ExternalResource>('external_resources');
    this.projects = db.collection<Project>('projects');
    this.connections = db.collection<IntegrationConnection>('integration_connections');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.resources.createIndex(
        {
          'scope.workspaceId': 1,
          provider: 1,
          kind: 1,
          externalId: 1,
        },
        { unique: true },
      ),
      this.resources.createIndex({
        'scope.workspaceId': 1,
        projectId: 1,
        provider: 1,
        kind: 1,
        updatedAt: -1,
      }),
      this.resources.createIndex({ 'scope.workspaceId': 1, connectionId: 1 }, { sparse: true }),
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

  async createRepositoryLink(
    input: CreateGitHubRepositoryLinkInput,
  ): Promise<ExternalResource | null> {
    return this.transaction(async (session) => {
      const project = await this.projects.findOne(
        { scope: input.scope, id: input.projectId },
        { session },
      );
      if (!project) return null;

      const now = new Date().toISOString();
      const resource: ExternalResource = {
        id: randomUUID(),
        scope: input.scope,
        provider: 'github',
        kind: 'repository',
        externalId: input.externalId,
        displayName: `${input.owner}/${input.repository}`,
        url: input.url,
        projectId: input.projectId,
        metadata: {
          owner: input.owner,
          repository: input.repository,
          ...(input.defaultBranch ? { defaultBranch: input.defaultBranch } : {}),
        },
        createdAt: now,
        updatedAt: now,
      };

      await this.resources.insertOne(resource, { session });
      await this.outbox.enqueue(
        {
          scope: input.scope,
          type: 'integration.github.repository_linked',
          actorUserId: input.actorUserId,
          entityType: 'external_resource',
          entityId: resource.id,
          summary: resource.displayName,
          source: 'manual-api',
          metadata: {
            provider: 'github',
            kind: 'repository',
            projectId: input.projectId,
            externalId: input.externalId,
          },
        },
        session,
      );
      return resource;
    });
  }

  async listRepositoryLinks(
    scope: WorkspaceScope,
    projectId?: string,
  ): Promise<ExternalResource[]> {
    return this.resources
      .find({
        scope,
        provider: 'github',
        kind: 'repository',
        ...(projectId ? { projectId } : {}),
      })
      .sort({ updatedAt: -1 })
      .toArray();
  }

  async getRepositoryLink(
    scope: WorkspaceScope,
    resourceId: string,
  ): Promise<ExternalResource | null> {
    return this.resources.findOne({ scope, id: resourceId, provider: 'github', kind: 'repository' });
  }

  async bindConnection(
    scope: WorkspaceScope,
    actorUserId: string,
    resourceId: string,
    connectionId: string,
  ): Promise<BindGitHubRepositoryConnectionResult> {
    return this.transaction(async (session) => {
      const resource = await this.resources.findOne(
        { scope, id: resourceId, provider: 'github', kind: 'repository' },
        { session },
      );
      if (!resource) return { status: 'repository_not_found' };
      const connection = await this.connections.findOne(
        { scope, id: connectionId, provider: 'github' },
        { session },
      );
      if (!connection) return { status: 'connection_not_found' };
      if (connection.status !== 'active' || !connection.lastValidatedAt) {
        return { status: 'connection_not_validated' };
      }

      const updatedAt = new Date().toISOString();
      const updated = await this.resources.findOneAndUpdate(
        { scope, id: resourceId, provider: 'github', kind: 'repository' },
        { $set: { connectionId, updatedAt } },
        { session, returnDocument: 'after' },
      );
      if (!updated) return { status: 'repository_not_found' };
      await this.outbox.enqueue(
        {
          scope,
          type: 'integration.github.repository_connection_bound',
          actorUserId,
          entityType: 'external_resource',
          entityId: resourceId,
          summary: updated.displayName,
          source: 'manual-api',
          metadata: { provider: 'github', connectionId },
        },
        session,
      );
      return { status: 'bound', resource: updated };
    });
  }

  async applySyncResult(input: GitHubRepositorySyncInput): Promise<ExternalResource | null> {
    return this.transaction(async (session) => {
      const query = {
        scope: input.scope,
        id: input.resourceId,
        provider: 'github' as const,
        kind: 'repository' as const,
        connectionId: input.connectionId,
      };
      const updated = await this.resources.findOneAndUpdate(
        query,
        {
          $set: {
            updatedAt: input.syncedAt,
            'metadata.githubRepositoryId': input.githubRepositoryId,
            'metadata.remoteFullName': input.remoteFullName,
            'metadata.defaultBranch': input.defaultBranch,
            'metadata.latestCommitSha': input.latestCommitSha,
            'metadata.private': input.private,
            'metadata.archived': input.archived,
            'metadata.lastSyncedAt': input.syncedAt,
            ...(input.latestCommitUrl
              ? { 'metadata.latestCommitUrl': input.latestCommitUrl }
              : {}),
            ...(input.latestCommitAt
              ? { 'metadata.latestCommitAt': input.latestCommitAt }
              : {}),
            ...(input.remoteUpdatedAt
              ? { 'metadata.remoteUpdatedAt': input.remoteUpdatedAt }
              : {}),
          },
        },
        { session, returnDocument: 'after' },
      );
      if (!updated) return null;
      await this.outbox.enqueue(
        {
          scope: input.scope,
          type: 'repository.sync.completed',
          actorUserId: input.actorUserId,
          entityType: 'external_resource',
          entityId: input.resourceId,
          summary: updated.displayName,
          source: 'github-api',
          metadata: {
            provider: 'github',
            connectionId: input.connectionId,
            githubRepositoryId: input.githubRepositoryId,
            defaultBranch: input.defaultBranch,
            latestCommitSha: input.latestCommitSha,
            syncedAt: input.syncedAt,
          },
        },
        session,
      );
      return updated;
    });
  }

  async recordSyncFailure(
    scope: WorkspaceScope,
    actorUserId: string,
    resourceId: string,
    errorCode: string,
  ): Promise<void> {
    const resource = await this.resources.findOne({
      scope,
      id: resourceId,
      provider: 'github',
      kind: 'repository',
    });
    if (!resource) return;
    await this.outbox.enqueue({
      scope,
      type: 'repository.sync.failed',
      actorUserId,
      entityType: 'external_resource',
      entityId: resourceId,
      summary: resource.displayName,
      source: 'github-api',
      metadata: { provider: 'github', errorCode },
    });
  }

  async deleteRepositoryLink(
    scope: WorkspaceScope,
    actorUserId: string,
    resourceId: string,
  ): Promise<ExternalResource | null> {
    return this.transaction(async (session) => {
      const resource = await this.resources.findOne(
        { scope, id: resourceId, provider: 'github', kind: 'repository' },
        { session },
      );
      if (!resource) return null;

      const deleted = await this.resources.deleteOne(
        { scope, id: resourceId, provider: 'github', kind: 'repository' },
        { session },
      );
      if (deleted.deletedCount === 0) return null;

      await this.outbox.enqueue(
        {
          scope,
          type: 'integration.github.repository_unlinked',
          actorUserId,
          entityType: 'external_resource',
          entityId: resource.id,
          summary: resource.displayName,
          source: 'manual-api',
          metadata: {
            provider: 'github',
            kind: 'repository',
            ...(resource.projectId ? { projectId: resource.projectId } : {}),
            externalId: resource.externalId,
          },
        },
        session,
      );
      return resource;
    });
  }
}
