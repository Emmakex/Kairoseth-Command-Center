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

export type GitHubRemotePullRequest = {
  id: string;
  number: number;
  title: string;
  state: string;
  draft: boolean;
  htmlUrl: string;
  updatedAt: string;
  mergedAt?: string;
};

export type GitHubRemoteIssue = {
  id: string;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  updatedAt: string;
  closedAt?: string;
};

export type GitHubRemoteWorkflowRun = {
  id: string;
  name: string;
  status: string;
  conclusion?: string;
  event: string;
  headBranch?: string;
  headSha: string;
  htmlUrl: string;
  updatedAt: string;
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
  listPullRequests(
    token: string,
    owner: string,
    repository: string,
    limit: number,
  ): Promise<GitHubRemotePullRequest[]>;
  listIssues(
    token: string,
    owner: string,
    repository: string,
    limit: number,
  ): Promise<GitHubRemoteIssue[]>;
  listWorkflowRuns(
    token: string,
    owner: string,
    repository: string,
    limit: number,
  ): Promise<GitHubRemoteWorkflowRun[]>;
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

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedLimit(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function repositoryPath(owner: string, repository: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
}

export class GitHubRestClient implements GitHubProviderClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl = 'https://api.github.com',
    private readonly timeoutMs = 10_000,
  ) {
    this.baseUrl = normalizedBaseUrl(baseUrl);
  }

  private async requestJson(options: RequestOptions): Promise<unknown> {
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
      return (await response.json()) as unknown;
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

  private async requestObject(options: RequestOptions): Promise<Record<string, unknown>> {
    const body = await this.requestJson(options);
    const normalized = objectValue(body);
    if (!normalized) {
      throw new GitHubProviderError('upstream_error', 'github_invalid_json_shape');
    }
    return normalized;
  }

  private async requestArray(options: RequestOptions): Promise<unknown[]> {
    const body = await this.requestJson(options);
    if (!Array.isArray(body)) {
      throw new GitHubProviderError('upstream_error', 'github_invalid_json_shape');
    }
    return body;
  }

  async validateCredential(token: string): Promise<GitHubRemoteAccount> {
    const body = await this.requestObject({ token, path: '/user' });
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
    const body = await this.requestObject({
      token,
      path: repositoryPath(owner, repository),
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
    const body = await this.requestObject({
      token,
      path: `${repositoryPath(owner, repository)}/commits/${encodeURIComponent(ref)}`,
    });
    const sha = stringValue(body.sha, 200);
    if (!sha) throw new GitHubProviderError('upstream_error', 'github_invalid_commit_response');
    const commit = objectValue(body.commit);
    const committer = objectValue(commit?.committer);
    return {
      sha,
      ...(stringValue(body.html_url, 2000) ? { htmlUrl: String(body.html_url) } : {}),
      ...(stringValue(committer?.date, 100) ? { committedAt: String(committer?.date) } : {}),
    };
  }

  async listPullRequests(
    token: string,
    owner: string,
    repository: string,
    limit: number,
  ): Promise<GitHubRemotePullRequest[]> {
    const body = await this.requestArray({
      token,
      path: `${repositoryPath(owner, repository)}/pulls?state=all&sort=updated&direction=desc&per_page=${boundedLimit(limit)}`,
    });

    return body.map((value) => {
      const item = objectValue(value);
      const id = idValue(item?.id);
      const number = numberValue(item?.number);
      const title = stringValue(item?.title, 500);
      const state = stringValue(item?.state, 50);
      const htmlUrl = stringValue(item?.html_url, 2000);
      const updatedAt = stringValue(item?.updated_at, 100);
      if (!id || number === undefined || !title || !state || !htmlUrl || !updatedAt) {
        throw new GitHubProviderError('upstream_error', 'github_invalid_pull_request_response');
      }
      return {
        id,
        number,
        title,
        state,
        draft: item?.draft === true,
        htmlUrl,
        updatedAt,
        ...(stringValue(item?.merged_at, 100) ? { mergedAt: String(item?.merged_at) } : {}),
      };
    });
  }

  async listIssues(
    token: string,
    owner: string,
    repository: string,
    limit: number,
  ): Promise<GitHubRemoteIssue[]> {
    const body = await this.requestArray({
      token,
      path: `${repositoryPath(owner, repository)}/issues?state=all&sort=updated&direction=desc&per_page=${boundedLimit(limit)}`,
    });

    return body.flatMap((value) => {
      const item = objectValue(value);
      if (!item || item.pull_request !== undefined) return [];
      const id = idValue(item.id);
      const number = numberValue(item.number);
      const title = stringValue(item.title, 500);
      const state = stringValue(item.state, 50);
      const htmlUrl = stringValue(item.html_url, 2000);
      const updatedAt = stringValue(item.updated_at, 100);
      if (!id || number === undefined || !title || !state || !htmlUrl || !updatedAt) {
        throw new GitHubProviderError('upstream_error', 'github_invalid_issue_response');
      }
      return [{
        id,
        number,
        title,
        state,
        htmlUrl,
        updatedAt,
        ...(stringValue(item.closed_at, 100) ? { closedAt: String(item.closed_at) } : {}),
      }];
    });
  }

  async listWorkflowRuns(
    token: string,
    owner: string,
    repository: string,
    limit: number,
  ): Promise<GitHubRemoteWorkflowRun[]> {
    const body = await this.requestObject({
      token,
      path: `${repositoryPath(owner, repository)}/actions/runs?per_page=${boundedLimit(limit)}`,
    });
    if (!Array.isArray(body.workflow_runs)) {
      throw new GitHubProviderError('upstream_error', 'github_invalid_workflow_runs_response');
    }

    return body.workflow_runs.map((value) => {
      const item = objectValue(value);
      const id = idValue(item?.id);
      const name = stringValue(item?.name, 300);
      const status = stringValue(item?.status, 100);
      const event = stringValue(item?.event, 100);
      const headBranch = stringValue(item?.head_branch, 255);
      const headSha = stringValue(item?.head_sha, 200);
      const htmlUrl = stringValue(item?.html_url, 2000);
      const updatedAt = stringValue(item?.updated_at, 100);
      if (!id || !name || !status || !event || !headSha || !htmlUrl || !updatedAt) {
        throw new GitHubProviderError('upstream_error', 'github_invalid_workflow_run_response');
      }
      return {
        id,
        name,
        status,
        ...(stringValue(item?.conclusion, 100) ? { conclusion: String(item?.conclusion) } : {}),
        event,
        ...(headBranch ? { headBranch } : {}),
        headSha,
        htmlUrl,
        updatedAt,
      };
    });
  }
}
