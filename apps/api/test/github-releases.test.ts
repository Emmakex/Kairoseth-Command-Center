import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubRestClient } from '../src/github-provider-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHub release normalization', () => {
  it('normalizes published and draft releases without requiring nullable provider fields', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      expect(parsed.pathname).toBe('/repos/Owner/Repo/releases');
      expect(parsed.searchParams.get('per_page')).toBe('5');
      return new Response(
        JSON.stringify([
          {
            id: 801,
            tag_name: 'v1.2.0',
            name: 'Stable release',
            draft: false,
            prerelease: false,
            target_commitish: 'main',
            html_url: 'https://github.com/Owner/Repo/releases/tag/v1.2.0',
            created_at: '2026-10-15T06:00:00Z',
            published_at: '2026-10-15T06:10:00Z',
          },
          {
            id: 802,
            tag_name: 'v1.3.0-rc.1',
            name: null,
            draft: true,
            prerelease: true,
            target_commitish: 'release/1.3',
            html_url: 'https://github.com/Owner/Repo/releases/tag/v1.3.0-rc.1',
            created_at: '2026-10-15T06:20:00Z',
            published_at: null,
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GitHubRestClient('https://provider.example.test');
    await expect(client.listReleases('credential', 'Owner', 'Repo', 5)).resolves.toEqual([
      {
        id: '801',
        tagName: 'v1.2.0',
        name: 'Stable release',
        draft: false,
        prerelease: false,
        targetCommitish: 'main',
        htmlUrl: 'https://github.com/Owner/Repo/releases/tag/v1.2.0',
        createdAt: '2026-10-15T06:00:00Z',
        publishedAt: '2026-10-15T06:10:00Z',
      },
      {
        id: '802',
        tagName: 'v1.3.0-rc.1',
        draft: true,
        prerelease: true,
        targetCommitish: 'release/1.3',
        htmlUrl: 'https://github.com/Owner/Repo/releases/tag/v1.3.0-rc.1',
        createdAt: '2026-10-15T06:20:00Z',
      },
    ]);
  });
});
