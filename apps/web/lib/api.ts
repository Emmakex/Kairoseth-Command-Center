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
