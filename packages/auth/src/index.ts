export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName?: string;
}

export interface SessionContext {
  user: AuthenticatedUser;
  workspaceId?: string;
  capabilities: string[];
}

export interface AuthProvider {
  name: string;
  resolveSession(input: { authorization?: string; cookie?: string }): Promise<SessionContext | null>;
}
