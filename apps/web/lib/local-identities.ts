import { apiBaseUrl } from './api';

export type LocalMember = {
  id: string;
  email: string;
  displayName: string;
  locale: 'es' | 'en';
  timezone: string;
  status: 'active' | 'suspended' | 'disabled';
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
};

export async function getLocalMembers(token: string): Promise<LocalMember[] | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/auth/local/members`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { members?: LocalMember[] };
    return body.members ?? null;
  } catch {
    return null;
  }
}
