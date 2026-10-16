import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/application';
import type { AgentBridgeRuntimeIdentityProvider } from '../src/agent-bridge-runtime-observability';
import type {
  AgentBridgeRuntimeIdentity,
  AgentBridgeRuntimeObservabilityStore,
  AgentBridgeRuntimeRecord,
  AgentBridgeRuntimeSnapshot,
  SaveRuntimeSnapshotResult,
} from '../src/agent-bridge-runtime-observability-store';

const runtimeIdentity: AgentBridgeRuntimeIdentity = {
  tenantId: 'workspace-a',
  installationId: 'installation-a',
  bridgeInstanceId: 'bridge-a',
  sessionId: 'session-a',
};

const runtimeIdentityProvider: AgentBridgeRuntimeIdentityProvider = {
  async resolveRuntimeIdentity(input) {
    return input.authorization === 'Bearer runtime-token' ? runtimeIdentity : null;
  },
};

const operatorSession: SessionContext = {
  user: {
    id: 'operator-a',
    email: 'operator@example.com',
    displayName: 'Operator',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-a',
  role: 'admin',
  capabilities: ['integrations.manage'],
  productEntitlements: ['agent-bridge'],
};

const operatorProvider: AuthProvider = {
  name: 'operator-test',
  async resolveSession(input) {
    return input.authorization === 'Bearer operator-token' ? operatorSession : null;
  },
};

class MemoryRuntimeStore implements AgentBridgeRuntimeObservabilityStore {
  readonly records = new Map<string, AgentBridgeRuntimeRecord>();

  async ensureIndexes(): Promise<void> {}

  async saveLatest(
    identity: AgentBridgeRuntimeIdentity,
    snapshot: AgentBridgeRuntimeSnapshot,
  ): Promise<SaveRuntimeSnapshotResult> {
    const key = `${identity.tenantId}:${identity.installationId}`;
    const current = this.records.get(key);
    if (current?.snapshot.snapshotId === snapshot.snapshotId) {
      return { ok: true, receivedAt: current.receivedAt, idempotent: true };
    }
    if (
      current &&
      Date.parse(current.snapshot.generatedAt) >= Date.parse(snapshot.generatedAt)
    ) {
      return { ok: false, code: 'runtime_snapshot_stale' };
    }
    const receivedAt = new Date().toISOString();
    this.records.set(key, {
      ...identity,
      snapshot: structuredClone(snapshot),
      receivedAt,
    });
    return { ok: true, receivedAt, idempotent: false };
  }

  async listLatest(tenantId: string): Promise<AgentBridgeRuntimeRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .map((record) => structuredClone(record));
  }
}

function snapshot(
  id = 'snapshot-a',
  generatedAt = new Date(Date.now() - 10_000).toISOString(),
): AgentBridgeRuntimeSnapshot {
  return {
    version: 'kab.runtime-snapshot.v1',
    snapshotId: id,
    generatedAt,
    connectors: [
      {
        connectorId: 'woocommerce',
        connectorInstanceId: 'shop-a',
        name: 'WooCommerce',
        version: '1.0.0',
        description: 'Commerce connector',
        localizations: {
          es: { name: 'WooCommerce', description: 'Conector de comercio' },
          en: { name: 'WooCommerce', description: 'Commerce connector' },
        },
        capabilities: ['orders.read', 'orders.write'],
        tools: [
          {
            toolId: 'orders.list',
            runtimeToolId: 'woocommerce.shop-a.orders.list',
            name: 'List orders',
            description: 'Lists orders',
            risk: 'READ',
          },
          {
            toolId: 'orders.update-status',
            runtimeToolId: 'woocommerce.shop-a.orders.update-status',
            name: 'Update order status',
            description: 'Updates an order status',
            risk: 'WRITE',
          },
        ],
      },
    ],
    health: [
      {
        connectorId: 'woocommerce',
        connectorInstanceId: 'shop-a',
        status: 'degraded',
        checkedAt: generatedAt,
        tools: [
          {
            toolId: 'orders.list',
            runtimeToolId: 'woocommerce.shop-a.orders.list',
            availability: 'available',
          },
          {
            toolId: 'orders.update-status',
            runtimeToolId: 'woocommerce.shop-a.orders.update-status',
            availability: 'blocked',
            blockedReason: 'circuit_open',
          },
        ],
      },
    ],
  };
}

function appFor(store = new MemoryRuntimeStore()) {
  return {
    store,
    app: buildApp({
      authProvider: operatorProvider,
      agentBridgeRuntimeIdentityProvider: runtimeIdentityProvider,
      agentBridgeRuntimeObservabilityStore: store,
    }),
  };
}

describe('Agent Bridge runtime observability', () => {
  it('accepts a runtime-bound snapshot and returns the exact versioned acknowledgement', async () => {
    const { app } = appFor();
    const report = snapshot();
    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { snapshot: report },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      ack: {
        version: 'kab.runtime-snapshot-ack.v1',
        snapshotId: report.snapshotId,
      },
    });
    expect(Date.parse(response.json().ack.receivedAt)).not.toBeNaN();
    await app.close();
  });

  it('fails closed without an authenticated runtime identity', async () => {
    const { app } = appFor();
    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      payload: { snapshot: snapshot() },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: 'runtime_session_required' });
    await app.close();
  });

  it('reports a missing runtime identity resolver as an unavailable Platform dependency', async () => {
    const store = new MemoryRuntimeStore();
    const app = buildApp({
      authProvider: operatorProvider,
      agentBridgeRuntimeObservabilityStore: store,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { snapshot: snapshot() },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: 'runtime_identity_provider_unavailable' });
    await app.close();
  });

  it('rejects inventory-health mismatches instead of persisting ambiguous state', async () => {
    const { app, store } = appFor();
    const invalid = snapshot();
    const firstHealth = invalid.health[0];
    const firstTool = firstHealth?.tools[0];
    expect(firstTool).toBeDefined();
    if (!firstTool) throw new Error('test fixture missing health tool');
    firstTool.runtimeToolId = 'other.runtime.tool';

    const response = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { snapshot: invalid },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ code: 'invalid_runtime_snapshot' });
    expect(store.records.size).toBe(0);
    await app.close();
  });

  it('is idempotent for the same snapshot and rejects an older snapshot', async () => {
    const { app } = appFor();
    const first = snapshot('snapshot-new', new Date(Date.now() - 10_000).toISOString());
    const older = snapshot('snapshot-old', new Date(Date.now() - 20_000).toISOString());

    const firstResponse = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { snapshot: first },
    });
    const replayResponse = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { snapshot: first },
    });
    const staleResponse = await app.inject({
      method: 'POST',
      url: '/api/products/agent-bridge/runtime-snapshot',
      headers: { authorization: 'Bearer runtime-token' },
      payload: { snapshot: older },
    });

    expect(replayResponse.json().ack.receivedAt).toBe(firstResponse.json().ack.receivedAt);
    expect(staleResponse.statusCode).toBe(409);
    expect(staleResponse.json()).toEqual({ code: 'runtime_snapshot_stale' });
    await app.close();
  });

  it('returns only the authenticated workspace with derived safe operational summaries', async () => {
    const { app, store } = appFor();
    await store.saveLatest(runtimeIdentity, snapshot());
    await store.saveLatest(
      { ...runtimeIdentity, tenantId: 'workspace-b', installationId: 'installation-b' },
      snapshot('snapshot-b'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/products/agent-bridge/runtimes',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().runtimes).toHaveLength(1);
    expect(response.json().runtimes[0]).toMatchObject({
      installationId: 'installation-a',
      bridgeInstanceId: 'bridge-a',
      freshness: 'online',
      connectorCount: 1,
      toolCount: 2,
      degradedConnectorCount: 1,
      blockedToolCount: 1,
    });
    expect(JSON.stringify(response.json())).not.toContain('session-a');
    await app.close();
  });

  it('requires integration management capability for the human-facing inventory', async () => {
    const readonlyProvider: AuthProvider = {
      name: 'readonly',
      async resolveSession() {
        return { ...operatorSession, capabilities: [] };
      },
    };
    const store = new MemoryRuntimeStore();
    const app = buildApp({
      authProvider: readonlyProvider,
      agentBridgeRuntimeIdentityProvider: runtimeIdentityProvider,
      agentBridgeRuntimeObservabilityStore: store,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/products/agent-bridge/runtimes',
      headers: { authorization: 'Bearer operator-token' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'agent_bridge_observability_forbidden' });
    await app.close();
  });
});
