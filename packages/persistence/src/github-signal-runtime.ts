import type { Collection, Db } from 'mongodb';
import type { ExternalResource, IntegrationConnection, Scope } from '@kcc/domain';
import type { IntegrationSecretStore } from './integration-secrets';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

export type GitHubSignalRuntime = {
  workspaceId: string;
  resourceId: string;
  projectId?: string;
  connectionId: string;
  owner: string;
  repository: string;
  token: string;
};

export type GitHubSignalRuntimeResolution =
  | { status: 'ready'; runtime: GitHubSignalRuntime }
  | {
      status:
        | 'repository_not_found'
        | 'connection_required'
        | 'connection_not_found'
        | 'connection_not_validated'
        | 'credential_unavailable'
        | 'repository_metadata_invalid';
    };

export type GitHubLinkedRepositoryRef = {
  workspaceId: string;
  resourceId: string;
};

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

export class MongoGitHubSignalRuntimeStore {
  private readonly resources: Collection<ExternalResource>;
  private readonly connections: Collection<IntegrationConnection>;

  constructor(
    db: Db,
    private readonly secretStore: IntegrationSecretStore,
  ) {
    this.resources = db.collection<ExternalResource>('external_resources');
    this.connections = db.collection<IntegrationConnection>('integration_connections');
  }

  async listLinkedRepositories(limit = 500): Promise<GitHubLinkedRepositoryRef[]> {
    const safeLimit = Math.min(2_000, Math.max(1, Math.floor(limit)));
    const resources = await this.resources
      .find({
        'scope.kind': 'workspace',
        provider: 'github',
        kind: 'repository',
        connectionId: { $exists: true },
      })
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .project<Pick<ExternalResource, 'id' | 'scope'>>({ id: 1, scope: 1 })
      .toArray();

    return resources.flatMap((resource) =>
      resource.scope.kind === 'workspace'
        ? [{ workspaceId: resource.scope.workspaceId, resourceId: resource.id }]
        : [],
    );
  }

  async resolve(workspaceId: string, resourceId: string): Promise<GitHubSignalRuntimeResolution> {
    const scope: WorkspaceScope = { kind: 'workspace', workspaceId };
    const resource = await this.resources.findOne({
      id: resourceId,
      scope,
      provider: 'github',
      kind: 'repository',
    });
    if (!resource) return { status: 'repository_not_found' };
    if (!resource.connectionId) return { status: 'connection_required' };

    const connection = await this.connections.findOne({
      id: resource.connectionId,
      scope,
      provider: 'github',
    });
    if (!connection) return { status: 'connection_not_found' };
    if (connection.status !== 'active' || !connection.lastValidatedAt) {
      return { status: 'connection_not_validated' };
    }

    const owner = text(resource.metadata.owner, 100);
    const repository = text(resource.metadata.repository, 100);
    if (!owner || !repository) return { status: 'repository_metadata_invalid' };

    const secretRef = connection.secretRef;
    if (!secretRef) return { status: 'credential_unavailable' };
    const token = await this.secretStore.revealSecret(scope, secretRef);
    if (!token) return { status: 'credential_unavailable' };

    return {
      status: 'ready',
      runtime: {
        workspaceId,
        resourceId: resource.id,
        ...(resource.projectId ? { projectId: resource.projectId } : {}),
        connectionId: connection.id,
        owner,
        repository,
        token,
      },
    };
  }

  async markConnectionInvalid(
    workspaceId: string,
    connectionId: string,
    errorCode: string,
  ): Promise<boolean> {
    const scope: WorkspaceScope = { kind: 'workspace', workspaceId };
    const result = await this.connections.updateOne(
      { id: connectionId, scope, provider: 'github' },
      {
        $set: {
          status: 'error',
          lastErrorCode: errorCode,
          updatedAt: new Date().toISOString(),
        },
        $unset: {
          lastValidatedAt: '',
          remoteAccountId: '',
          remoteAccountLabel: '',
        },
      },
    );
    return result.matchedCount === 1;
  }
}
