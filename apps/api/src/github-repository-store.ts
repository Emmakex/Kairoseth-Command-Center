import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import type { ExternalResource, Project, Scope } from '@kcc/domain';
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

export interface GitHubRepositoryStore {
  ensureIndexes(): Promise<void>;
  createRepositoryLink(input: CreateGitHubRepositoryLinkInput): Promise<ExternalResource | null>;
  listRepositoryLinks(scope: WorkspaceScope, projectId?: string): Promise<ExternalResource[]>;
  deleteRepositoryLink(
    scope: WorkspaceScope,
    actorUserId: string,
    resourceId: string,
  ): Promise<ExternalResource | null>;
}

export class MongoGitHubRepositoryStore implements GitHubRepositoryStore {
  private readonly resources: Collection<ExternalResource>;
  private readonly projects: Collection<Project>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.resources = db.collection<ExternalResource>('external_resources');
    this.projects = db.collection<Project>('projects');
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
