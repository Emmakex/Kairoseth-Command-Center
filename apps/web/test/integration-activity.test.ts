import { describe, expect, it } from 'vitest';
import type { IntegrationSignalSummary } from '../lib/api';
import {
  integrationActivityView,
  safeIntegrationUrl,
} from '../components/integration-activity-panel';
import { dictionary } from '../lib/i18n';

function signal(
  type: IntegrationSignalSummary['type'],
  payload: Record<string, unknown>,
  source = 'github',
): IntegrationSignalSummary {
  return {
    id: `test:${type}`,
    source,
    type,
    workspaceId: 'workspace-a',
    occurredAt: '2026-10-15T14:00:00.000Z',
    payload,
  };
}

describe('integration activity presentation', () => {
  it('renders a normalized pull request in Spanish without exposing internal provider ids', () => {
    const view = integrationActivityView(
      signal('repository.pull_request', {
        resourceId: 'internal-resource',
        providerId: 501,
        repository: 'acme/product',
        number: 17,
        title: 'Preparar release',
        state: 'closed',
        merged: true,
        url: 'https://github.example/acme/product/pull/17',
      }),
      dictionary.es,
    );

    expect(view).toEqual({
      typeLabel: 'Pull request',
      title: 'Preparar release',
      detail: 'acme/product · #17 · Fusionado',
      source: 'github',
      url: 'https://github.example/acme/product/pull/17',
    });
    expect(JSON.stringify(view)).not.toContain('internal-resource');
    expect(JSON.stringify(view)).not.toContain('501');
  });

  it('localizes a successful CI signal in English', () => {
    const view = integrationActivityView(
      signal('repository.ci', {
        repository: 'acme/product',
        name: 'Release gate',
        status: 'completed',
        conclusion: 'success',
        url: 'https://github.example/acme/product/actions/runs/701',
      }),
      dictionary.en,
    );

    expect(view.typeLabel).toBe('CI');
    expect(view.title).toBe('Release gate');
    expect(view.detail).toBe('acme/product · Successful');
  });

  it('rejects non-http integration links', () => {
    expect(safeIntegrationUrl({ url: 'javascript:alert(1)' })).toBeNull();
    expect(safeIntegrationUrl({ url: 'data:text/html,boom' })).toBeNull();
    expect(safeIntegrationUrl({ url: 'https://example.com/path' })).toBe('https://example.com/path');
  });

  it('falls back safely for malformed or sparse normalized payloads', () => {
    const view = integrationActivityView(
      signal('generic.webhook', { title: 12, url: 'not-a-url' }, '   '),
      dictionary.en,
    );

    expect(view).toEqual({
      typeLabel: 'Webhook',
      title: 'Integration signal',
      detail: '',
      source: 'Integration',
      url: null,
    });
  });
});
