import { describe, expect, it } from 'vitest';
import { planAgentBridgeExecution } from '../lib/agent-bridge-execution';
import type { AgentBridgeToolInventory } from '../lib/agent-bridge-tools';

const inventory: AgentBridgeToolInventory = {
  installationId: 'installation-1',
  snapshotId: 'snapshot-1',
  generatedAt: '2026-10-20T06:00:00.000Z',
  receivedAt: '2026-10-20T06:00:01.000Z',
  tools: [
    {
      executionToolId: 'woocommerce.main.orders.list',
      name: 'List orders',
      description: 'List orders',
      risk: 'READ',
      availability: 'available',
      connector: { connectorId: 'woocommerce', name: 'WooCommerce', version: '1.0.0' },
    },
    {
      executionToolId: 'woocommerce.main.orders.update',
      name: 'Update order',
      description: 'Update order',
      risk: 'WRITE',
      availability: 'available',
      connector: { connectorId: 'woocommerce', name: 'WooCommerce', version: '1.0.0' },
    },
    {
      executionToolId: 'woocommerce.main.store.reset',
      name: 'Reset store',
      description: 'Reset store',
      risk: 'CRITICAL',
      availability: 'available',
      connector: { connectorId: 'woocommerce', name: 'WooCommerce', version: '1.0.0' },
    },
    {
      executionToolId: 'woocommerce.main.orders.blocked',
      name: 'Blocked tool',
      description: 'Blocked tool',
      risk: 'READ',
      availability: 'blocked',
      blockedReason: 'credential_rotation',
      connector: { connectorId: 'woocommerce', name: 'WooCommerce', version: '1.0.0' },
    },
  ],
};

describe('Agent Bridge execution planner', () => {
  it('routes READ through the read path and mutations through signed approval', () => {
    expect(
      planAgentBridgeExecution(inventory, 'woocommerce.main.orders.list', '{"limit":10}'),
    ).toMatchObject({ plan: { endpointKind: 'read', input: { limit: 10 } } });

    expect(
      planAgentBridgeExecution(inventory, 'woocommerce.main.orders.update', '{"id":123}'),
    ).toMatchObject({ plan: { endpointKind: 'approved', input: { id: 123 } } });

    expect(
      planAgentBridgeExecution(inventory, 'woocommerce.main.store.reset', '{}'),
    ).toMatchObject({ plan: { endpointKind: 'approved', input: {} } });
  });

  it('does not allow the browser to substitute a tool or execute blocked tools', () => {
    expect(planAgentBridgeExecution(inventory, 'unknown-tool', '{}')).toEqual({
      error: 'tool_not_found',
    });
    expect(
      planAgentBridgeExecution(inventory, 'woocommerce.main.orders.blocked', '{}'),
    ).toEqual({ error: 'tool_blocked' });
  });

  it('rejects invalid and oversized JSON before execution', () => {
    expect(
      planAgentBridgeExecution(inventory, 'woocommerce.main.orders.list', '{not-json}'),
    ).toEqual({ error: 'invalid_input' });

    expect(
      planAgentBridgeExecution(
        inventory,
        'woocommerce.main.orders.list',
        JSON.stringify({ value: 'x'.repeat(70 * 1024) }),
      ),
    ).toEqual({ error: 'input_too_large' });
  });

  it('uses an empty input as an empty JSON object', () => {
    expect(
      planAgentBridgeExecution(inventory, 'woocommerce.main.orders.list', '   '),
    ).toMatchObject({ plan: { endpointKind: 'read', input: {} } });
  });
});
