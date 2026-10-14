import { describe, expect, it } from 'vitest';
import { parseOperationalMutation } from '../lib/operations';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('decision operational proxy parsing', () => {
  it('forwards only validated workspace decision fields to the lifecycle endpoint', () => {
    const mutation = parseOperationalMutation(
      form({
        operation: 'decision-create',
        scope: 'workspace',
        title: 'Release rule',
        decision: 'Require green CI',
        context: 'Protect main',
        projectId: 'project-a',
        supersedesId: 'decision-old',
      }),
    );

    expect(mutation).toEqual({
      path: '/v1/decision-lifecycle',
      method: 'POST',
      body: {
        scope: 'workspace',
        title: 'Release rule',
        decision: 'Require green CI',
        context: 'Protect main',
        projectId: 'project-a',
        supersedesId: 'decision-old',
      },
    });
  });

  it('encodes decision IDs before creating reversal paths', () => {
    const mutation = parseOperationalMutation(
      form({
        operation: 'decision-reverse',
        scope: 'workspace',
        id: 'decision/../escape',
        reason: 'Assumption changed',
      }),
    );

    expect(mutation).toEqual({
      path: '/v1/decision-lifecycle/decision%2F..%2Fescape/reverse',
      method: 'PATCH',
      body: { scope: 'workspace', reason: 'Assumption changed' },
    });
  });

  it('rejects decision lifecycle mutations from private scope', () => {
    const create = parseOperationalMutation(
      form({
        operation: 'decision-create',
        scope: 'private',
        title: 'Private attempt',
        decision: 'No',
      }),
    );
    const reverse = parseOperationalMutation(
      form({
        operation: 'decision-reverse',
        scope: 'private',
        id: 'decision-a',
        reason: 'No',
      }),
    );

    expect(create).toBeNull();
    expect(reverse).toBeNull();
  });

  it('requires a reversal reason and rejects overlong references', () => {
    const missingReason = parseOperationalMutation(
      form({
        operation: 'decision-reverse',
        scope: 'workspace',
        id: 'decision-a',
      }),
    );
    const invalidProject = parseOperationalMutation(
      form({
        operation: 'decision-create',
        scope: 'workspace',
        title: 'Decision',
        decision: 'Body',
        projectId: 'x'.repeat(101),
      }),
    );

    expect(missingReason).toBeNull();
    expect(invalidProject).toBeNull();
  });
});
