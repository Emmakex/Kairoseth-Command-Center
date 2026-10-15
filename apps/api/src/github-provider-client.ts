export type GitHubProviderErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'upstream_error';

export class GitHubProviderError extends Error {
  constructor(
    readonly code: GitHubProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubProviderError';
  }
}

export type GitHubRemoteAccount = {
  id: string;
  login: string;
};

export type GitHubRemoteRepository = {
  id: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  updatedAt?: string;
};

export type GitHubRemoteCommit = {
  sha: string;
  htmlUrl?: string;
  committedAt?: string;
};

export interface GitHubProviderClient {
  validateCredential(token: string): Promise<GitHubRemoteAccount>;
  getRepository(token: string, owner: string, repository: string): Promise<GitHubRemoteRepository>;
  getLatestCommit(
    token: string,
    owner: string,
    repository: string,
    ref: string,
  ): Promise<GitHubRemoteCommit>;
}

type RequestOptions = {
  token: string;
  path: string;
};

function normalizedBaseUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('github_api_base_url_must_be_http_or_https');
  }
  return url.toString().replace(/\/$/, '');
}

function providerCode(response: Response): GitHubProviderErrorCode {
  if (response.status === 401) return 'unauthorized';
  if (response.status === 403) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    return remaining === '0' ? 'rate_limited' : 'forbidden';
  }
  if (response.status === 404) return 'not_found';
  if (response.status === 429) return 'rate_limited';
  return 'upstream_error';
}

function stringValue(value: unknown, max = 1000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : undefined;
}

function idValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return stringValue(value, 200);
}

export class GitHubRestClient implements GitHubProviderClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl = 'https://api.github.com',
    private readonly timeoutMs = 10_000,
  ) {
    this.baseUrl = normalizedBaseUrl(baseUrl);
  }

  private async request(options: RequestOptions): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${options.path}`, {
        method: 'GET',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${options.token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'Kairoseth-Work-Manager',
        },
      });
      if (!response.ok) {
        throw new GitHubProviderError(providerCode(response), `github_http_${response.status}`);
      }
      const body = (await response.json()) as unknown;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new GitHubProviderError('upstream_error', 'github_invalid_json_shape');
      }
      return body as Record<string, unknown>;
    } catch (error) {
      if (error instanceof GitHubProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GitHubProviderError('timeout', 'github_request_timeout');
      }
      throw new GitHubProviderError('upstream_error', 'github_request_failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateCredential(token: string): Promise<GitHubRemoteAccount> {
    const body = await this.request({ token, path: '/user' });
    const id = idValue(body.id);
    const login = stringValue(body.login, 200);
    if (!id || !login) {
      throw new GitHubProviderError('upstream_error', 'github_invalid_user_response');
    }
    return { id, login };
  }

  async getRepository(
    token: string,
    owner: string,
    repository: string,
  ): Promise<GitHubRemoteRepository> {
    const body = await this.request({
      token,
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
    });
    const id = idValue(body.id);
    const fullName = stringValue(body.full_name, 300);
    const defaultBranch = stringValue(body.default_branch, 255);
    if (!id || !fullName || !defaultBranch) {
      throw new GitHubProviderError('upstream_error', 'github_invalid_repository_response');
    }
    return {
      id,
      fullName,
      defaultBranch,
      private: body.private === true,
      archived: body.archived === true,
      ...(stringValue(body.updated_at, 100) ? { updatedAt: String(body.updated_at) } : {}),
    };
  }

  async getLatestCommit(
    token: string,
    owner: string,
    repository: string,
    ref: string,
  ): Promise<GitHubRemoteCommit> {
    const body = await this.request({
      token,
      path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/${encodeURIComponent(ref)}`,
    });
    const sha = stringValue(body.sha, 200);
    if (!sha) throw new GitHubProviderError('upstream_error', 'github_invalid_commit_response');
    const commit = body.commit && typeof body.commit === 'object' && !Array.isArray(body.commit)
      ? (body.commit as Record<string, unknown>)
      : undefined;
    const committer = commit?.committer && typeof commit.committer === 'object' && !Array.isArray(commit.committer)
      ? (commit.committer as Record<string, unknown>)
      : undefined;
    return {
      sha,
      ...(stringValue(body.html_url, 2000) ? { htmlUrl: String(body.html_url) } : {}),
      ...(stringValue(committer?.date, 100) ? { committedAt: String(committer?.date) } : {}),
    };
  }
}
