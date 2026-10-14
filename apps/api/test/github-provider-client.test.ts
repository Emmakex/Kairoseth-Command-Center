import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubProviderError, GitHubRestClient } from '../src/github-provider-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHubRestClient', () => {
  it('validates credentials using the trusted base URL and bearer header', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://provider.example.test/user');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture-credential');
      expect(init?.redirect).toBe('error');
      return new Response(JSON.stringify({ id: 101, login: 'fixture-owner' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GitHubRestClient('https://provider.example.test');
    await expect(client.validateCredential('fixture-credential')).resolves.toEqual({
      id: '101',
      login: 'fixture-owner',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('normalizes repository and latest commit provider data', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const path = new URL(String(url)).pathname;
      if (path === '/repos/Owner/Repo') {
        return new Response(
          JSON.stringify({
            id: 99,
            full_name: 'Owner/Repo',
            default_branch: 'main',
            private: false,
            archived: true,
            updated_at: '2026-10-14T18:30:00Z',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          sha: 'abc123',
          html_url: 'https://github.com/Owner/Repo/commit/abc123',
          commit: { committer: { date: '2026-10-14T18:29:00Z' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GitHubRestClient('https://provider.example.test/');
    await expect(client.getRepository('credential', 'Owner', 'Repo')).resolves.toEqual({
      id: '99',
      fullName: 'Owner/Repo',
      defaultBranch: 'main',
      private: false,
      archived: true,
      updatedAt: '2026-10-14T18:30:00Z',
    });
    await expect(client.getLatestCommit('credential', 'Owner', 'Repo', 'main')).resolves.toEqual({
      sha: 'abc123',
      htmlUrl: 'https://github.com/Owner/Repo/commit/abc123',
      committedAt: '2026-10-14T18:29:00Z',
    });
  });

  it('maps provider rate limiting without exposing the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'provider internal detail' }), {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0' },
        }),
      ),
    );

    const client = new GitHubRestClient('https://provider.example.test');
    try {
      await client.validateCredential('credential');
      throw new Error('expected_failure');
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubProviderError);
      expect((error as GitHubProviderError).code).toBe('rate_limited');
      expect((error as Error).message).toBe('github_http_403');
      expect((error as Error).message).not.toContain('provider internal detail');
    }
  });

  it('rejects malformed successful provider responses as upstream errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ login: 'missing-id' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const client = new GitHubRestClient('https://provider.example.test');
    await expect(client.validateCredential('credential')).rejects.toMatchObject({
      name: 'GitHubProviderError',
      code: 'upstream_error',
    });
  });
});
