import { describe, expect, it } from 'vitest';
import { parseOperationalMutation } from '../lib/operations';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('parseOperationalMutation', () => {
  it('builds a private task quick-capture request', () => {
    expect(
      parseOperationalMutation(
        form({
          operation: 'quick-capture',
          scope: 'private',
          kind: 'task',
          title: 'Call supplier',
          description: 'Confirm delivery window',
          priority: '80',
        }),
      ),
    ).toEqual({
      path: '/v1/quick-capture',
      method: 'POST',
      body: {
        scope: 'private',
        kind: 'task',
        title: 'Call supplier',
        description: 'Confirm delivery window',
        priority: 80,
      },
    });
  });

  it('builds milestone create and status mutations inside the selected scope', () => {
    expect(
      parseOperationalMutation(
        form({
          operation: 'milestone-create',
          scope: 'private',
          projectId: 'project-1',
          title: 'First usable release',
          weight: '35',
        }),
      ),
    ).toEqual({
      path: '/v1/milestones',
      method: 'POST',
      body: {
        scope: 'private',
        projectId: 'project-1',
        title: 'First usable release',
        weight: 35,
      },
    });

    expect(
      parseOperationalMutation(
        form({
          operation: 'milestone-status',
          scope: 'workspace',
          id: 'milestone/1',
          status: 'done',
        }),
      ),
    ).toEqual({
      path: '/v1/milestones/milestone%2F1/status',
      method: 'PATCH',
      body: { scope: 'workspace', status: 'done' },
    });
  });

  it('builds validated workspace decision creation and rejects private decisions', () => {
    expect(
      parseOperationalMutation(
        form({
          operation: 'decision-create',
          scope: 'workspace',
          projectId: 'validated-project-reference',
          title: 'Launch path',
          context: 'We need one deployment model for v1.',
          decision: 'Ship standalone first.',
        }),
      ),
    ).toEqual({
      path: '/v1/decision-lifecycle',
      method: 'POST',
      body: {
        scope: 'workspace',
        projectId: 'validated-project-reference',
        title: 'Launch path',
        context: 'We need one deployment model for v1.',
        decision: 'Ship standalone first.',
      },
    });

    expect(
      parseOperationalMutation(
        form({
          operation: 'decision-create',
          scope: 'private',
          title: 'Private decision',
          decision: 'This must not be accepted.',
        }),
      ),
    ).toBeNull();
  });

  it('encodes entity identifiers before placing them in an API path', () => {
    expect(
      parseOperationalMutation(
        form({
          operation: 'task-status',
          scope: 'workspace',
          id: 'task/unsafe path',
          status: 'done',
        }),
      ),
    ).toEqual({
      path: '/v1/tasks/task%2Funsafe%20path/status',
      method: 'PATCH',
      body: { scope: 'workspace', status: 'done' },
    });
  });

  it('rejects invalid scope, status, weights and out-of-range progress values', () => {
    expect(
      parseOperationalMutation(
        form({
          operation: 'project-status',
          scope: 'other-workspace',
          id: 'project-1',
          status: 'active',
          progress: '50',
        }),
      ),
    ).toBeNull();

    expect(
      parseOperationalMutation(
        form({
          operation: 'project-status',
          scope: 'workspace',
          id: 'project-1',
          status: 'active',
          progress: '101',
        }),
      ),
    ).toBeNull();

    expect(
      parseOperationalMutation(
        form({
          operation: 'milestone-create',
          scope: 'workspace',
          projectId: 'project-1',
          title: 'Too heavy',
          weight: '101',
        }),
      ),
    ).toBeNull();

    expect(
      parseOperationalMutation(
        form({
          operation: 'alert-status',
          scope: 'workspace',
          id: 'alert-1',
          status: 'deleted',
        }),
      ),
    ).toBeNull();
  });
});
