import { describe, expect, it } from 'vitest';
import { parseGitHubSetupMutation } from '../lib/github-setup';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('parseGitHubSetupMutation', () => {
  it('builds connection creation without placing the token in the path', () => {
    const token = 'github_pat_test_12345678901234567890';
    expect(
      parseGitHubSetupMutation(
        form({ operation: 'connection-create', displayName: 'Primary GitHub', token }),
      ),
    ).toEqual({
      path: '/v1/integrations/github/connections',
      method: 'POST',
      body: { displayName: 'Primary GitHub', token },
    });
  });

  it('encodes connection and repository identifiers in API paths', () => {
    expect(
      parseGitHubSetupMutation(
        form({ operation: 'connection-validate', connectionId: 'connection/one' }),
      ),
    ).toEqual({
      path: '/v1/integrations/github/connections/connection%2Fone/validate',
      method: 'POST',
    });

    expect(
      parseGitHubSetupMutation(
        form({
          operation: 'repository-bind',
          resourceId: 'resource/one',
          connectionId: 'connection-1',
        }),
      ),
    ).toEqual({
      path: '/v1/integrations/github/repositories/resource%2Fone/connection',
      method: 'PATCH',
      body: { connectionId: 'connection-1' },
    });
  });

  it('builds repository creation and manual sync mutations', () => {
    expect(
      parseGitHubSetupMutation(
        form({
          operation: 'repository-create',
          projectId: 'project-1',
          owner: 'Emmakex',
          repository: 'Kairoseth-Command-Center',
          defaultBranch: 'main',
        }),
      ),
    ).toEqual({
      path: '/v1/integrations/github/repositories',
      method: 'POST',
      body: {
        projectId: 'project-1',
        owner: 'Emmakex',
        repository: 'Kairoseth-Command-Center',
        defaultBranch: 'main',
      },
    });

    expect(
      parseGitHubSetupMutation(
        form({ operation: 'repository-sync', resourceId: 'resource-1' }),
      ),
    ).toEqual({
      path: '/v1/integrations/github/repositories/resource-1/sync',
      method: 'POST',
    });
  });

  it('builds write-only credential rotation and guarded delete mutations', () => {
    const token = 'github_pat_rotated_12345678901234567890';
    expect(
      parseGitHubSetupMutation(
        form({ operation: 'connection-rotate', connectionId: 'connection/one', token }),
      ),
    ).toEqual({
      path: '/v1/integrations/github/connections/connection%2Fone/credential',
      method: 'PATCH',
      body: { token },
    });

    expect(
      parseGitHubSetupMutation(
        form({
          operation: 'repository-delete',
          resourceId: 'resource/one',
          confirmation: 'unlink',
        }),
      ),
    ).toEqual({
      path: '/v1/integrations/github/repositories/resource%2Fone',
      method: 'DELETE',
    });

    expect(
      parseGitHubSetupMutation(
        form({
          operation: 'connection-delete',
          connectionId: 'connection/one',
          confirmation: 'disconnect',
        }),
      ),
    ).toEqual({
      path: '/v1/integrations/github/connections/connection%2Fone',
      method: 'DELETE',
    });
  });

  it('rejects destructive mutations without explicit confirmation', () => {
    expect(
      parseGitHubSetupMutation(
        form({ operation: 'repository-delete', resourceId: 'resource-1' }),
      ),
    ).toBeNull();
    expect(
      parseGitHubSetupMutation(
        form({ operation: 'connection-delete', connectionId: 'connection-1' }),
      ),
    ).toBeNull();
  });

  it('rejects malformed tokens and GitHub coordinates', () => {
    expect(
      parseGitHubSetupMutation(
        form({ operation: 'connection-create', displayName: 'GitHub', token: 'short token' }),
      ),
    ).toBeNull();
    expect(
      parseGitHubSetupMutation(
        form({ operation: 'connection-rotate', connectionId: 'connection-1', token: 'short token' }),
      ),
    ).toBeNull();

    expect(
      parseGitHubSetupMutation(
        form({
          operation: 'repository-create',
          projectId: 'project-1',
          owner: 'bad/owner',
          repository: '../repo',
        }),
      ),
    ).toBeNull();
  });
});
