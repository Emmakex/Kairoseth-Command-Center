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

  it('normalizes pull requests, excludes pull requests from issues and reads workflow runs', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith('/pulls')) {
        expect(parsed.searchParams.get('per_page')).toBe('5');
        return new Response(
          JSON.stringify([
            {
              id: 501,
              number: 17,
              title: 'Ship signals',
              state: 'closed',
              draft: false,
              html_url: 'https://github.com/Owner/Repo/pull/17',
              updated_at: '2026-10-15T06:00:00Z',
              merged_at: '2026-10-15T05:59:00Z',
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (parsed.pathname.endsWith('/issues')) {
        return new Response(
          JSON.stringify([
            {
              id: 601,
              number: 20,
              title: 'Real issue',
              state: 'open',
              html_url: 'https://github.com/Owner/Repo/issues/20',
              updated_at: '2026-10-15T05:00:00Z',
            },
            {
              id: 602,
              number: 21,
              title: 'PR returned by issues endpoint',
              state: 'open',
              html_url: 'https://github.com/Owner/Repo/pull/21',
              updated_at: '2026-10-15T04:00:00Z',
              pull_request: { url: 'https://api.github.com/repos/Owner/Repo/pulls/21' },
            },
          ]),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          workflow_runs: [
            {
              id: 701,
              name: 'CI',
              status: 'completed',
              conclusion: 'success',
              event: 'push',
              head_branch: 'main',
              head_sha: 'abc123',
              html_url: 'https://github.com/Owner/Repo/actions/runs/701',
              updated_at: '2026-10-15T06:30:00Z',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GitHubRestClient('https://provider.example.test');
    await expect(client.listPullRequests('credential', 'Owner', 'Repo', 5)).resolves.toEqual([
      {
        id: '501',
        number: 17,
        title: 'Ship signals',
        state: 'closed',
        draft: false,
        htmlUrl: 'https://github.com/Owner/Repo/pull/17',
        updatedAt: '2026-10-15T06:00:00Z',
        mergedAt: '2026-10-15T05:59:00Z',
      },
    ]);
    await expect(client.listIssues('credential', 'Owner', 'Repo', 5)).resolves.toEqual([
      {
        id: '601',
        number: 20,
        title: 'Real issue',
        state: 'open',
        htmlUrl: 'https://github.com/Owner/Repo/issues/20',
        updatedAt: '2026-10-15T05:00:00Z',
      },
    ]);
    await expect(client.listWorkflowRuns('credential', 'Owner', 'Repo', 5)).resolves.toEqual([
      {
        id: '701',
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        event: 'push',
        headBranch: 'main',
        headSha: 'abc123',
        htmlUrl: 'https://github.com/Owner/Repo/actions/runs/701',
        updatedAt: '2026-10-15T06:30:00Z',
      },
    ]);
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
