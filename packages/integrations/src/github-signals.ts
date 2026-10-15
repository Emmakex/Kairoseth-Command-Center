import type { IntegrationSignal } from './index';
import type {
  GitHubRemoteIssue,
  GitHubRemotePullRequest,
  GitHubRemoteRelease,
  GitHubRemoteWorkflowRun,
} from './github';

export type NormalizeGitHubRepositorySignalsInput = {
  workspaceId: string;
  resourceId: string;
  projectId?: string;
  repository: string;
  pullRequests: GitHubRemotePullRequest[];
  issues: GitHubRemoteIssue[];
  workflowRuns: GitHubRemoteWorkflowRun[];
  releases: GitHubRemoteRelease[];
};

function compareSignals(left: IntegrationSignal, right: IntegrationSignal): number {
  return Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
}

export function normalizeGitHubRepositorySignals(
  input: NormalizeGitHubRepositorySignalsInput,
): IntegrationSignal[] {
  const commonPayload = {
    resourceId: input.resourceId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    repository: input.repository,
  };

  const signals: IntegrationSignal[] = [
    ...input.pullRequests.map((pullRequest): IntegrationSignal => ({
      id: `github:pull-request:${pullRequest.id}`,
      source: 'github',
      type: 'repository.pull_request',
      workspaceId: input.workspaceId,
      occurredAt: pullRequest.updatedAt,
      payload: {
        ...commonPayload,
        providerId: pullRequest.id,
        number: pullRequest.number,
        title: pullRequest.title,
        state: pullRequest.state,
        draft: pullRequest.draft,
        merged: Boolean(pullRequest.mergedAt),
        url: pullRequest.htmlUrl,
      },
    })),
    ...input.issues.map((issue): IntegrationSignal => ({
      id: `github:issue:${issue.id}`,
      source: 'github',
      type: 'repository.issue',
      workspaceId: input.workspaceId,
      occurredAt: issue.updatedAt,
      payload: {
        ...commonPayload,
        providerId: issue.id,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        url: issue.htmlUrl,
      },
    })),
    ...input.workflowRuns.map((workflowRun): IntegrationSignal => ({
      id: `github:workflow-run:${workflowRun.id}`,
      source: 'github',
      type: 'repository.ci',
      workspaceId: input.workspaceId,
      occurredAt: workflowRun.updatedAt,
      payload: {
        ...commonPayload,
        providerId: workflowRun.id,
        name: workflowRun.name,
        status: workflowRun.status,
        ...(workflowRun.conclusion ? { conclusion: workflowRun.conclusion } : {}),
        event: workflowRun.event,
        ...(workflowRun.headBranch ? { headBranch: workflowRun.headBranch } : {}),
        headSha: workflowRun.headSha,
        url: workflowRun.htmlUrl,
      },
    })),
    ...input.releases.map((release): IntegrationSignal => ({
      id: `github:release:${release.id}`,
      source: 'github',
      type: 'repository.release',
      workspaceId: input.workspaceId,
      occurredAt: release.publishedAt ?? release.createdAt,
      payload: {
        ...commonPayload,
        providerId: release.id,
        tagName: release.tagName,
        ...(release.name ? { name: release.name } : {}),
        draft: release.draft,
        prerelease: release.prerelease,
        targetCommitish: release.targetCommitish,
        url: release.htmlUrl,
      },
    })),
  ];

  signals.sort(compareSignals);
  return signals;
}
