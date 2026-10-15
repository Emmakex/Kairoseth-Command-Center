export type GitHubSetupMutation = {
  path: string;
  method: 'POST' | 'PATCH';
  body?: Record<string, unknown>;
};

function requiredText(form: FormData, name: string, maxLength: number): string | null {
  const value = form.get(name);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function optionalText(form: FormData, name: string, maxLength: number): string | null | undefined {
  const value = form.get(name);
  if (value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function tokenValue(form: FormData): string | null {
  const token = requiredText(form, 'token', 2048);
  if (!token || token.length < 20 || /\s/.test(token)) return null;
  return token;
}

function githubOwner(value: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(value);
}

function githubRepository(value: string): boolean {
  return value !== '.' && value !== '..' && /^[A-Za-z0-9._-]+$/.test(value);
}

export function parseGitHubSetupMutation(form: FormData): GitHubSetupMutation | null {
  const operation = form.get('operation');

  if (operation === 'connection-create') {
    const displayName = requiredText(form, 'displayName', 160);
    const token = tokenValue(form);
    if (!displayName || !token) return null;
    return {
      path: '/v1/integrations/github/connections',
      method: 'POST',
      body: { displayName, token },
    };
  }

  if (operation === 'connection-validate') {
    const connectionId = requiredText(form, 'connectionId', 100);
    if (!connectionId) return null;
    return {
      path: `/v1/integrations/github/connections/${encodeURIComponent(connectionId)}/validate`,
      method: 'POST',
    };
  }

  if (operation === 'repository-create') {
    const projectId = requiredText(form, 'projectId', 100);
    const owner = requiredText(form, 'owner', 100);
    const repository = requiredText(form, 'repository', 100);
    const defaultBranch = optionalText(form, 'defaultBranch', 255);
    if (
      !projectId ||
      !owner ||
      !repository ||
      !githubOwner(owner) ||
      !githubRepository(repository) ||
      defaultBranch === null
    ) {
      return null;
    }
    return {
      path: '/v1/integrations/github/repositories',
      method: 'POST',
      body: {
        projectId,
        owner,
        repository,
        ...(defaultBranch ? { defaultBranch } : {}),
      },
    };
  }

  if (operation === 'repository-bind') {
    const resourceId = requiredText(form, 'resourceId', 100);
    const connectionId = requiredText(form, 'connectionId', 100);
    if (!resourceId || !connectionId) return null;
    return {
      path: `/v1/integrations/github/repositories/${encodeURIComponent(resourceId)}/connection`,
      method: 'PATCH',
      body: { connectionId },
    };
  }

  if (operation === 'repository-sync') {
    const resourceId = requiredText(form, 'resourceId', 100);
    if (!resourceId) return null;
    return {
      path: `/v1/integrations/github/repositories/${encodeURIComponent(resourceId)}/sync`,
      method: 'POST',
    };
  }

  return null;
}
