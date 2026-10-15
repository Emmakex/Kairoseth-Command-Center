import type { Collection, Db } from 'mongodb';
import type { ExternalResource, IntegrationConnection } from '@kcc/domain';

export type GitHubSchedulableResource = {
  workspaceId: string;
  resourceId: string;
};

export class MongoGitHubScheduleDiscoveryStore {
  private readonly resources: Collection<ExternalResource>;
  private readonly connections: Collection<IntegrationConnection>;

  constructor(db: Db) {
    this.resources = db.collection<ExternalResource>('external_resources');
    this.connections = db.collection<IntegrationConnection>('integration_connections');
  }

  async listSchedulable(limit = 500): Promise<GitHubSchedulableResource[]> {
    const boundedLimit = Math.min(2_000, Math.max(1, Math.floor(limit)));
    const resources = await this.resources
      .find({
        provider: 'github',
        kind: 'repository',
        connectionId: { $exists: true },
      })
      .sort({ updatedAt: -1 })
      .limit(boundedLimit)
      .toArray();

    const connectionIds = [...new Set(resources.flatMap((resource) =>
      resource.connectionId ? [resource.connectionId] : [],
    ))];
    if (connectionIds.length === 0) return [];

    const connections = await this.connections
      .find({
        id: { $in: connectionIds },
        provider: 'github',
        status: 'active',
        lastValidatedAt: { $exists: true },
      })
      .toArray();
    const activeConnections = new Set(
      connections.map((connection) => `${connection.scope.workspaceId}:${connection.id}`),
    );

    return resources.flatMap((resource) => {
      const connectionId = resource.connectionId;
      if (!connectionId) return [];
      const workspaceId = resource.scope.workspaceId;
      if (!activeConnections.has(`${workspaceId}:${connectionId}`)) return [];
      return [{ workspaceId, resourceId: resource.id }];
    });
  }
}
