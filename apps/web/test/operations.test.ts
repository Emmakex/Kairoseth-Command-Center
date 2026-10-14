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

  it('rejects invalid scope, status and out-of-range progress values', () => {
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
          operation: 'alert-status',
          scope: 'workspace',
          id: 'alert-1',
          status: 'deleted',
        }),
      ),
    ).toBeNull();
  });
});
