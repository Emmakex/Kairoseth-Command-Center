import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('health endpoints', () => {
  it('returns liveness', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      service: 'kairoseth-command-center-api',
    });

    await app.close();
  });

  it('returns 503 when a dependency is not ready', async () => {
    const app = buildApp({ readinessCheck: async () => ({ process: 'ok', mongodb: 'error' }) });
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'not_ready' });

    await app.close();
  });
});
