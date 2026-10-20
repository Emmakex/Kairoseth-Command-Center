import { describe, expect, it } from 'vitest';
import { parseAgentBridgeToolInventoryResponse } from '../lib/agent-bridge-tools';

const valid = {
  version: 'kcc.agent-bridge-tool-inventory.v1',
  inventory: {
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
    ],
  },
} as const;

describe('Agent Bridge tool inventory parser', () => {
  it('accepts the bounded safe operator projection', () => {
    expect(parseAgentBridgeToolInventoryResponse(valid)).toEqual(valid);
  });

  it('rejects invalid risk, availability and duplicate executable IDs', () => {
    expect(
      parseAgentBridgeToolInventoryResponse({
        ...valid,
        inventory: {
          ...valid.inventory,
          tools: [{ ...valid.inventory.tools[0], risk: 'OWNER' }],
        },
      }),
    ).toBeNull();

    expect(
      parseAgentBridgeToolInventoryResponse({
        ...valid,
        inventory: {
          ...valid.inventory,
          tools: [{ ...valid.inventory.tools[0], availability: 'unknown' }],
        },
      }),
    ).toBeNull();

    expect(
      parseAgentBridgeToolInventoryResponse({
        ...valid,
        inventory: {
          ...valid.inventory,
          tools: [valid.inventory.tools[0], valid.inventory.tools[0]],
        },
      }),
    ).toBeNull();
  });

  it('rejects malformed timestamps and unsafe text', () => {
    expect(
      parseAgentBridgeToolInventoryResponse({
        ...valid,
        inventory: { ...valid.inventory, generatedAt: 'not-a-date' },
      }),
    ).toBeNull();

    expect(
      parseAgentBridgeToolInventoryResponse({
        ...valid,
        inventory: {
          ...valid.inventory,
          tools: [{ ...valid.inventory.tools[0], executionToolId: 'bad\nvalue' }],
        },
      }),
    ).toBeNull();
  });
});
