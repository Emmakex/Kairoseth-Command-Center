import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { ExternalResource, IntegrationConnection, Scope } from '@kcc/domain';
import type {
  GitHubWebhookEndpoint,
  GitHubWebhookStore,
  ResolvedGitHubWebhookEndpoint,
} from '@kcc/persistence/github-webhooks';
import type {
  EnqueueIntegrationSyncJobInput,
  IntegrationSyncJob,
  IntegrationSyncJobStore,
} from '@kcc/persistence/integration-sync-jobs';
import { buildApp } from '../src/application';
import type { GitHubConnectionStore } from '../src/github-connection-store';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

const scope: WorkspaceScope = { kind: 'workspace', workspaceId: 'workspace-a' };
const headers = { authorization: 'Bearer valid-token' };
const webhookSecret = 'webhook-secret-0123456789abcdef';

const adminSession: SessionContext = {
  user: {
    id: 'user-admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: scope.workspaceId,
  membershipId: 'membership-admin',
  role: 'admin',
  capabilities: ['integrations.manage'],
  productEntitlements: ['command-center'],
};

const activeConnection: IntegrationConnection = {
  id: 'connection-1',
  scope,
  provider: 'github',
  displayName: 'Primary GitHub',
  status: 'active',
  secretRef: 'provider-secret-1',
  lastValidatedAt: '2026-10-15T08:00:00.000Z',
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
};

const endpoint: GitHubWebhookEndpoint = {
  id: 'ghwh-endpoint-1',
  workspaceId: scope.workspaceId,
  connectionId: activeConnection.id,
  enabled: true,
  createdAt: '2026-10-15T09:00:00.000Z',
  updatedAt: '2026-10-15T09:00:00.000Z',
};

const resource: ExternalResource = {
  id: 'resource-1',
  scope,
  provider: 'github',
  kind: 'repository',
  externalId: 'emmakex/kairoseth-command-center',
  displayName: 'Emmakex/Kairoseth-Command-Center',
  url: 'https://github.com/Emmakex/Kairoseth-Command-Center',
  projectId: 'project-a',
  connectionId: activeConnection.id,
  metadata: { owner: 'Emmakex', repository: 'Kairoseth-Command-Center' },
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
};

function authProvider(session: SessionContext = adminSession): AuthProvider {
  return {
    name: 'test',
    async resolveSession(input) {
      return input.authorization === 'Bearer valid-token' ? session : null;
    },
  };
}

function connectionStore(connection: IntegrationConnection = activeConnection): GitHubConnectionStore {
  return {
    async getConnection(requestScope: WorkspaceScope, connectionId: string) {
      return requestScope.workspaceId === connection.scope.workspaceId && connectionId === connection.id
        ? connection
        : null;
    },
  } as unknown as GitHubConnectionStore;
}

class MemoryWebhookStore implements GitHubWebhookStore {
  readonly deliveries = new Set<string>();
  releaseCount = 0;
  repository: ExternalResource | null = resource;
  configured = true;

  async ensureIndexes(): Promise<void> {}

  async provision(requestScope: WorkspaceScope, connectionId: string) {
    if (this.configured) return { status: 'exists' as const, endpoint };
    this.configured = true;
    return {
      status: 'created' as const,
      endpoint: { ...endpoint, workspaceId: requestScope.workspaceId, connectionId },
      secret: webhookSecret,
    };
  }

  async get(requestScope: WorkspaceScope, connectionId: string) {
    if (!this.configured || requestScope.workspaceId !== endpoint.workspaceId || connectionId !== endpoint.connectionId) {
      return null;
    }
    return endpoint;
  }

  async rotateSecret(requestScope: WorkspaceScope, connectionId: string) {
    const current = await this.get(requestScope, connectionId);
    return current
      ? { status: 'rotated' as const, endpoint: current, secret: `${webhookSecret}-rotated` }
      : { status: 'not_found' as const };
  }

  async delete(requestScope: WorkspaceScope, connectionId: string) {
    const current = await this.get(requestScope, connectionId);
    if (!current) return false;
    this.configured = false;
    return true;
  }

  async resolve(endpointId: string): Promise<ResolvedGitHubWebhookEndpoint | null> {
    if (!this.configured || endpointId !== endpoint.id) return null;
    return { ...endpoint, secretRef: 'webhook-secret-ref', secret: webhookSecret };
  }

  async resolveRepository(workspaceId: string, connectionId: string, externalId: string) {
    if (!this.repository) return null;
    return workspaceId === this.repository.scope.workspaceId
      && connectionId === this.repository.connectionId
      && externalId === this.repository.externalId
      ? this.repository
      : null;
  }

  async claimDelivery(input: { endpointId: string; workspaceId: string; deliveryId: string; event: string }) {
    const key = `${input.endpointId}:${input.workspaceId}:${input.deliveryId}`;
    if (this.deliveries.has(key)) return false;
    this.deliveries.add(key);
    return true;
  }

  async releaseDelivery(endpointId: string, workspaceId: string, deliveryId: string) {
    this.releaseCount += 1;
    return this.deliveries.delete(`${endpointId}:${workspaceId}:${deliveryId}`);
  }
}

class MemorySyncJobStore implements IntegrationSyncJobStore {
  inputs: EnqueueIntegrationSyncJobInput[] = [];
  shouldFail = false;

  async ensureIndexes(): Promise<void> {}

  async enqueue(input: EnqueueIntegrationSyncJobInput): Promise<IntegrationSyncJob> {
    if (this.shouldFail) throw new Error('queue_unavailable');
    this.inputs.push(input);
    return {
      id: `job-${this.inputs.length}`,
      workspaceId: input.workspaceId,
      provider: input.provider,
      kind: input.kind,
      resourceId: input.resourceId,
      dedupeKey: input.dedupeKey,
      activeDedupeKey: input.dedupeKey,
      status: 'pending',
      attempt: 0,
      maxAttempts: input.maxAttempts ?? 8,
      availableAt: '2026-10-15T09:10:00.000Z',
      createdAt: '2026-10-15T09:10:00.000Z',
      updatedAt: '2026-10-15T09:10:00.000Z',
    };
  }

  async claimDue() { return null; }
  async complete() { return false; }
  async fail() { return false; }
  async retry() { return null; }
  async requeueExpired() { return 0; }
}

function signedHeaders(rawBody: string, deliveryId = 'delivery-1', event = 'pull_request') {
  const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return {
    'content-type': 'application/json',
    'x-hub-signature-256': `sha256=${signature}`,
    'x-github-delivery': deliveryId,
    'x-github-event': event,
  };
}

function webhookApp(webhooks = new MemoryWebhookStore(), jobs = new MemorySyncJobStore()) {
  const app = buildApp({
    authProvider: authProvider(),
    githubConnectionStore: connectionStore(),
    githubWebhookStore: webhooks,
    integrationSyncJobStore: jobs,
  });
  return { app, webhooks, jobs };
}

describe('verified GitHub webhook ingestion', () => {
  it('returns a webhook secret only when provisioning a new endpoint', async () => {
    const webhooks = new MemoryWebhookStore();
    webhooks.configured = false;
    const { app } = webhookApp(webhooks);

    const created = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/connections/${activeConnection.id}/webhook`,
      headers,
    });
    const existing = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/connections/${activeConnection.id}/webhook`,
      headers,
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().secret).toBe(webhookSecret);
    expect(created.json().secretVisibleOnce).toBe(true);
    expect(created.body).not.toContain('secretRef');
    expect(existing.statusCode).toBe(409);
    expect(existing.body).not.toContain(webhookSecret);
    await app.close();
  });

  it('verifies the exact body and enqueues only the bound workspace repository', async () => {
    const { app, jobs } = webhookApp();
    const rawBody = JSON.stringify({ repository: { full_name: 'Emmakex/Kairoseth-Command-Center' } });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/webhooks/${endpoint.id}`,
      headers: signedHeaders(rawBody),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().action).toBe('refresh_enqueued');
    expect(jobs.inputs).toEqual([
      {
        workspaceId: scope.workspaceId,
        provider: 'github',
        kind: 'repository_signals',
        resourceId: resource.id,
        dedupeKey: `webhook:${endpoint.id}:delivery-1`,
      },
    ]);
    expect(response.body).not.toContain(webhookSecret);
    await app.close();
  });

  it('rejects an invalid signature before replay state or queue work is touched', async () => {
    const { app, webhooks, jobs } = webhookApp();
    const rawBody = JSON.stringify({ repository: { full_name: resource.externalId } });
    const invalid = signedHeaders(rawBody);
    invalid['x-hub-signature-256'] = `sha256=${'0'.repeat(64)}`;

    const response = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/webhooks/${endpoint.id}`,
      headers: invalid,
      payload: rawBody,
    });

    expect(response.statusCode).toBe(401);
    expect(webhooks.deliveries.size).toBe(0);
    expect(jobs.inputs).toHaveLength(0);
    await app.close();
  });

  it('treats a repeated delivery id as replay and never enqueues it twice', async () => {
    const { app, jobs } = webhookApp();
    const rawBody = JSON.stringify({ repository: { full_name: resource.externalId } });
    const request = {
      method: 'POST' as const,
      url: `/v1/integrations/github/webhooks/${endpoint.id}`,
      headers: signedHeaders(rawBody, 'delivery-replay'),
      payload: rawBody,
    };

    const first = await app.inject(request);
    const second = await app.inject(request);

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual({ accepted: true, replay: true });
    expect(jobs.inputs).toHaveLength(1);
    await app.close();
  });

  it('acknowledges irrelevant events without scheduling a provider refresh', async () => {
    const { app, jobs } = webhookApp();
    const rawBody = JSON.stringify({ repository: { full_name: resource.externalId } });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/webhooks/${endpoint.id}`,
      headers: signedHeaders(rawBody, 'delivery-ping', 'ping'),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().action).toBe('ignored');
    expect(jobs.inputs).toHaveLength(0);
    await app.close();
  });

  it('does not enqueue a repository that is not bound to the endpoint workspace and connection', async () => {
    const webhooks = new MemoryWebhookStore();
    webhooks.repository = null;
    const { app, jobs } = webhookApp(webhooks);
    const rawBody = JSON.stringify({ repository: { full_name: 'other-org/private-repository' } });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/webhooks/${endpoint.id}`,
      headers: signedHeaders(rawBody, 'delivery-other'),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().action).toBe('ignored');
    expect(jobs.inputs).toHaveLength(0);
    await app.close();
  });

  it('releases the replay claim when durable enqueue fails so GitHub can retry', async () => {
    const webhooks = new MemoryWebhookStore();
    const jobs = new MemorySyncJobStore();
    jobs.shouldFail = true;
    const { app } = webhookApp(webhooks, jobs);
    const rawBody = JSON.stringify({ repository: { full_name: resource.externalId } });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/integrations/github/webhooks/${endpoint.id}`,
      headers: signedHeaders(rawBody, 'delivery-retry'),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(503);
    expect(webhooks.releaseCount).toBe(1);
    expect(webhooks.deliveries.size).toBe(0);
    await app.close();
  });
});
