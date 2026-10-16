import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'kcc_session';

export type SessionResponse = {
  user: {
    id: string;
    email: string;
    displayName: string;
    locale: 'es' | 'en';
    timezone: string;
  };
  activeWorkspaceId: string | null;
  membershipId: string | null;
  role: string | null;
  capabilities: string[];
  productEntitlements: string[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  progress: number;
  dueAt?: string;
};

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
  priority: number;
  dueAt?: string;
};

export type AlertSummary = {
  id: string;
  title: string;
  status: string;
  severity: string;
  message?: string;
};

export type MilestoneSummary = {
  id: string;
  projectId: string;
  title: string;
  status: 'planned' | 'active' | 'done' | 'cancelled';
  weight: number;
  dueAt?: string;
};

export type DecisionSummary = {
  id: string;
  projectId?: string;
  title: string;
  context?: string;
  decision: string;
  status: 'active' | 'superseded' | 'reversed';
  madeBy: string;
  madeAt: string;
  supersedesId?: string;
};

export type TimelineEventSummary = {
  id: string;
  type: string;
  actorUserId?: string;
  entityType: string;
  entityId: string;
  summary: string;
  source: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export type IntegrationSignalSummary = {
  id: string;
  source: string;
  type:
    | 'repository.commit'
    | 'repository.pull_request'
    | 'repository.issue'
    | 'repository.ci'
    | 'repository.release'
    | 'calendar.event'
    | 'generic.webhook';
  workspaceId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type GitHubConnectionSummary = {
  id: string;
  provider: 'github';
  displayName: string;
  status: string;
  credentialConfigured: boolean;
  lastValidatedAt?: string;
  remoteAccountId?: string;
  remoteAccountLabel?: string;
  lastErrorCode?: string;
  createdAt: string;
  updatedAt: string;
};

export type GitHubRepositorySummary = {
  id: string;
  provider: 'github';
  kind: string;
  externalId: string;
  displayName: string;
  url: string;
  projectId?: string;
  connectionId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type GitHubWebhookSummary = {
  id: string;
  connectionId: string;
  enabled: boolean;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type GitHubWebhookState =
  | { state: 'configured'; webhook: GitHubWebhookSummary }
  | { state: 'not-configured' }
  | { state: 'unavailable' };

export type AutomationRuleSeverity = 'info' | 'warning' | 'urgent' | 'critical';

export type AutomationRulePolicySummary = {
  ruleId:
    | 'repository.ci.failed.v1'
    | 'repository.ci.action_required.v1'
    | 'repository.pull_request.stale.v1'
    | 'repository.issue.stale.v1';
  enabled: boolean;
  severity: AutomationRuleSeverity;
  overridden: boolean;
  updatedAt?: string;
};

export type OperationalPriorityReasonSummary = {
  code:
    | 'task.manual_priority'
    | 'task.blocked'
    | 'task.overdue'
    | 'task.due_today'
    | 'alert.severity'
    | 'project.blocked'
    | 'project.overdue'
    | 'project.due_today'
    | 'project.remaining_progress'
    | 'milestone.overdue'
    | 'milestone.due_today'
    | 'milestone.weight';
  contribution: number;
  value?: string | number;
};

export type OperationalPrioritySummary = {
  kind: 'task' | 'alert' | 'project' | 'milestone';
  id: string;
  title: string;
  score: number;
  status: string;
  reasons: OperationalPriorityReasonSummary[];
  projectId?: string;
  dueAt?: string;
  severity?: AutomationRuleSeverity;
};

export type PrioritiesResponse = {
  scope: 'workspace' | 'private';
  range: { start: string; end: string };
  priorities: OperationalPrioritySummary[];
};

export type TodayResponse = {
  scope: 'workspace' | 'private';
  range: { start: string; end: string };
  summary: {
    openTasks: number;
    dueToday: number;
    blockedTasks: number;
    openAlerts: number;
    urgentAlerts: number;
    activeProjects: number;
  };
  projects: ProjectSummary[];
  tasks: TaskSummary[];
  alerts: AlertSummary[];
};

export type ProjectsResponse = { projects: ProjectSummary[] };
export type MilestonesResponse = { milestones: MilestoneSummary[] };
export type DecisionsResponse = { decisions: DecisionSummary[] };
export type TimelineResponse = { events: TimelineEventSummary[] };
export type IntegrationSignalsResponse = { signals: IntegrationSignalSummary[] };
export type GitHubConnectionsResponse = { connections: GitHubConnectionSummary[] };
export type GitHubRepositoriesResponse = { repositories: GitHubRepositorySummary[] };
export type AutomationRulesResponse = { rules: AutomationRulePolicySummary[] };

export function apiBaseUrl(): string {
  return (
    process.env.KCC_API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '');
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

async function authenticatedGet<T>(path: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getSession(token: string): Promise<SessionResponse | null> {
  return authenticatedGet<SessionResponse>('/v1/session', token);
}

export function getToday(
  token: string,
  scope: 'workspace' | 'private',
): Promise<TodayResponse | null> {
  return authenticatedGet<TodayResponse>(`/v1/today?scope=${scope}`, token);
}

export async function getPriorities(
  token: string,
  scope: 'workspace' | 'private',
  limit = 8,
): Promise<OperationalPrioritySummary[] | null> {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const response = await authenticatedGet<PrioritiesResponse>(
    `/v1/priorities?scope=${scope}&limit=${safeLimit}`,
    token,
  );
  return response?.priorities ?? null;
}

export async function getProjects(
  token: string,
  scope: 'workspace' | 'private',
): Promise<ProjectSummary[] | null> {
  const response = await authenticatedGet<ProjectsResponse>(`/v1/projects?scope=${scope}`, token);
  return response?.projects ?? null;
}

export async function getMilestones(
  token: string,
  scope: 'workspace' | 'private',
): Promise<MilestoneSummary[] | null> {
  const response = await authenticatedGet<MilestonesResponse>(`/v1/milestones?scope=${scope}`, token);
  return response?.milestones ?? null;
}

export async function getDecisions(token: string): Promise<DecisionSummary[] | null> {
  const response = await authenticatedGet<DecisionsResponse>('/v1/decisions', token);
  return response?.decisions ?? null;
}

export async function getTimeline(
  token: string,
  scope: 'workspace' | 'private',
): Promise<TimelineEventSummary[] | null> {
  const response = await authenticatedGet<TimelineResponse>(`/v1/timeline?scope=${scope}`, token);
  return response?.events ?? null;
}

export async function getIntegrationSignals(
  token: string,
  limit = 12,
): Promise<IntegrationSignalSummary[] | null> {
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const response = await authenticatedGet<IntegrationSignalsResponse>(
    `/v1/integrations/signals?limit=${safeLimit}`,
    token,
  );
  return response?.signals ?? null;
}

export async function getGitHubConnections(token: string): Promise<GitHubConnectionSummary[] | null> {
  const response = await authenticatedGet<GitHubConnectionsResponse>(
    '/v1/integrations/github/connections',
    token,
  );
  return response?.connections ?? null;
}

export async function getGitHubRepositories(token: string): Promise<GitHubRepositorySummary[] | null> {
  const response = await authenticatedGet<GitHubRepositoriesResponse>(
    '/v1/integrations/github/repositories',
    token,
  );
  return response?.repositories ?? null;
}

export async function getAutomationRules(token: string): Promise<AutomationRulePolicySummary[] | null> {
  const response = await authenticatedGet<AutomationRulesResponse>('/v1/automation/rules', token);
  return response?.rules ?? null;
}

export async function getGitHubWebhookState(
  token: string,
  connectionId: string,
): Promise<GitHubWebhookState> {
  try {
    const response = await fetch(
      `${apiBaseUrl()}/v1/integrations/github/connections/${encodeURIComponent(connectionId)}/webhook`,
      {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      },
    );
    if (response.status === 404) return { state: 'not-configured' };
    if (!response.ok) return { state: 'unavailable' };
    const body = (await response.json()) as { webhook?: GitHubWebhookSummary };
    const webhook = body.webhook;
    if (
      !webhook ||
      typeof webhook.id !== 'string' ||
      webhook.connectionId !== connectionId ||
      typeof webhook.path !== 'string' ||
      !webhook.path.startsWith('/v1/integrations/github/webhooks/')
    ) {
      return { state: 'unavailable' };
    }
    return { state: 'configured', webhook };
  } catch {
    return { state: 'unavailable' };
  }
}
