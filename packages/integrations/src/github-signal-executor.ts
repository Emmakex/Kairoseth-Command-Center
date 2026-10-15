import type { IntegrationSignal } from './index';
import type { GitHubProviderClient } from './github';
import { normalizeGitHubRepositorySignals } from './github-signals';

export type ExecuteGitHubRepositorySignalsInput = {
  providerClient: GitHubProviderClient;
  token: string;
  workspaceId: string;
  resourceId: string;
  projectId?: string;
  owner: string;
  repository: string;
  limit?: number;
};

function boundedLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

export async function executeGitHubRepositorySignals(
  input: ExecuteGitHubRepositorySignalsInput,
): Promise<IntegrationSignal[]> {
  const limit = boundedLimit(input.limit);
  const [pullRequests, issues, workflowRuns, releases] = await Promise.all([
    input.providerClient.listPullRequests(input.token, input.owner, input.repository, limit),
    input.providerClient.listIssues(input.token, input.owner, input.repository, limit),
    input.providerClient.listWorkflowRuns(input.token, input.owner, input.repository, limit),
    input.providerClient.listReleases(input.token, input.owner, input.repository, limit),
  ]);

  return normalizeGitHubRepositorySignals({
    workspaceId: input.workspaceId,
    resourceId: input.resourceId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    repository: `${input.owner}/${input.repository}`,
    pullRequests,
    issues,
    workflowRuns,
    releases,
  });
}
