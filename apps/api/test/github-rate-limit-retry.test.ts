import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubProviderError, GitHubRestClient } from '../src/github-provider-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GitHub rate-limit retry timing', () => {
  it('uses Retry-After seconds without exposing provider response details', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'provider internal detail' }), {
          status: 429,
          headers: { 'retry-after': '120' },
        }),
      ),
    );

    const client = new GitHubRestClient('https://provider.example.test');
    try {
      await client.validateCredential('credential');
      throw new Error('expected_failure');
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubProviderError);
      expect(error).toMatchObject({
        code: 'rate_limited',
        message: 'github_http_429',
        retryAt: '2026-10-15T08:02:00.000Z',
      });
      expect((error as Error).message).not.toContain('provider internal detail');
    }
  });

  it('falls back to X-RateLimit-Reset when Retry-After is absent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T08:00:00.000Z'));
    const resetSeconds = Math.floor(Date.parse('2026-10-15T08:05:00.000Z') / 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('{}', {
          status: 403,
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(resetSeconds),
          },
        }),
      ),
    );

    const client = new GitHubRestClient('https://provider.example.test');
    await expect(client.validateCredential('credential')).rejects.toMatchObject({
      name: 'GitHubProviderError',
      code: 'rate_limited',
      retryAt: '2026-10-15T08:05:00.000Z',
    });
  });
});
