import { describe, expect, it } from 'vitest';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import { buildApp } from '../src/application';
import type {
  AgentBridgeToolInventory,
  AgentBridgeToolInventoryStore,
} from '../src/agent-bridge-tool-inventory-store';

const operator: SessionContext = {
  user: {
    id: 'operator-1',
    email: 'operator@example.com',
    displayName: 'Operator',
    locale: 'es',
    timezone: 'Europe/Madrid',
  },
  activeWorkspaceId: 'workspace-a',
  membershipId: 'membership-1',
  role: 'admin',
  capabilities: ['workspace.manage'],
  productEntitlements: ['agent-bridge'],
};

const viewer: SessionContext = {
  ...operator,
  user: { ...operator.user, id: 'viewer-1', email: 'viewer@example.com' },
  membershipId: 'membership-2',
  role: 'viewer',
  capabilities: [],
};

const authProvider: AuthProvider = {
  name: 'test',
  async resolveSession(input) {
    if (input.authorization === 'Bearer operator-token') return operator;
    if (input.authorization === 'Bearer viewer-token') return viewer;
    return null;
  },
};

const inventory: AgentBridgeToolInventory = {
  installationId: 'installation-1',
  snapshotId: 'snapshot-1',
  generatedAt: '2026-10-20T06:00:00.000Z',
  receivedAt: '2026-10-20T06:00:01.000Z',
  tools: [
    {
      executionToolId: 'woocommerce.main.orders.list',
      name: 'List orders',
      description: 'List WooCommerce orders',
      risk: 'READ',
      availability: 'available',
      localizations: {
        es: { name: 'Listar pedidos', description: 'Lista pedidos de WooCommerce' },
        en: { name: 'List orders', description: 'List WooCommerce orders' },
      },
      connector: {
        connectorId: 'woocommerce',
        name: 'WooCommerce',
        version: '1.0.0',
      },
    },
    {
      executionToolId: 'woocommerce.main.orders.update',
      name: 'Update order',
      description: 'Update one WooCommerce order',
      risk: 'WRITE',
      availability: 'blocked',
      blockedReason: 'credential_rotation',
      connector: {
        connectorId: 'woocommerce',
        name: 'WooCommerce',
        version: '1.0.0',
      },
    },
  ],
};

class FakeToolInventoryStore implements AgentBridgeToolInventoryStore {
  calls: Array<{ tenantId: string; installationId: string }> = [];

  async getInstallationTools(tenantId: string, installationId: string) {
    this.calls.push({ tenantId, installationId });
    return tenantId === 'workspace-a' && installationId === 'installation-1'
      ? structuredClone(inventory)
      : null;
  }
}

describe('Agent Bridge operator tool inventory', () => {
  it('returns only the safe workspace-scoped execution inventory to managers', async () => {
    const store = new FakeToolInventoryStore();
    const app = buildApp({ authProvider, agentBridgeToolInventoryStore: store });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/installations/installation-1/tools',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(store.calls).toEqual([{ tenantId: 'workspace-a', installationId: 'installation-1' }]);
    expect(response.json()).toEqual({
      version: 'kcc.agent-bridge-tool-inventory.v1',
      inventory,
    });
    for (const forbidden of [
      'accessToken',
      'approvalToken',
      'publicKeyPem',
      'keyId',
      'sessionId',
      'connectorInstanceId',
      'actionFingerprint',
    ]) {
      expect(response.body).not.toContain(forbidden);
    }

    await app.close();
  });

  it('requires workspace management capability even for entitled users', async () => {
    const store = new FakeToolInventoryStore();
    const app = buildApp({ authProvider, agentBridgeToolInventoryStore: store });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/installations/installation-1/tools',
      headers: { authorization: 'Bearer viewer-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'agent_bridge_forbidden' });
    expect(store.calls).toEqual([]);

    await app.close();
  });

  it('does not reveal installations outside the active workspace projection', async () => {
    const store = new FakeToolInventoryStore();
    const app = buildApp({ authProvider, agentBridgeToolInventoryStore: store });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/installations/installation-other/tools',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'agent_bridge_tool_inventory_not_found' });
    expect(store.calls).toEqual([
      { tenantId: 'workspace-a', installationId: 'installation-other' },
    ]);

    await app.close();
  });

  it('fails closed when the inventory store is unavailable', async () => {
    const app = buildApp({ authProvider });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/products/agent-bridge/installations/installation-1/tools',
      headers: { authorization: 'Bearer operator-token' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: 'agent_bridge_tool_inventory_unavailable' });

    await app.close();
  });
});
