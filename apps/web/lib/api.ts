import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'kcc_session';

type SessionResponse = {
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

type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  progress: number;
  dueAt?: string;
};

type TaskSummary = {
  id: string;
  title: string;
  status: string;
  priority: number;
  dueAt?: string;
};

type AlertSummary = {
  id: string;
  title: string;
  status: string;
  severity: string;
  message?: string;
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
