import { describe, expect, it } from 'vitest';
import { parseOperationalMutation } from '../lib/operations';

function recurrenceForm(
  mode: 'none' | 'interval_days',
  intervalDays?: string,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set('locale', 'es');
  form.set('operation', 'task-recurrence');
  form.set('scope', 'workspace');
  form.set('id', 'task/one');
  form.set('recurrenceMode', mode);
  if (intervalDays !== undefined) form.set('intervalDays', intervalDays);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

describe('task recurrence web mutation', () => {
  it('builds a fixed-day recurrence replacement', () => {
    expect(parseOperationalMutation(recurrenceForm('interval_days', '7'))).toEqual({
      path: '/v1/tasks/task%2Fone/recurrence',
      method: 'PUT',
      body: {
        scope: 'workspace',
        recurrenceRule: { kind: 'interval_days', intervalDays: 7 },
      },
    });
  });

  it('supports clearing recurrence without an interval value', () => {
    expect(parseOperationalMutation(recurrenceForm('none'))).toEqual({
      path: '/v1/tasks/task%2Fone/recurrence',
      method: 'PUT',
      body: { scope: 'workspace', recurrenceRule: null },
    });
  });

  it('accepts only whole-day intervals from 1 through 365', () => {
    for (const value of ['1', '365']) {
      expect(parseOperationalMutation(recurrenceForm('interval_days', value))).not.toBeNull();
    }

    for (const value of ['', '0', '366', '1.5', 'seven']) {
      expect(parseOperationalMutation(recurrenceForm('interval_days', value))).toBeNull();
    }
  });

  it('rejects unsupported modes and client authority fields', () => {
    const unsupported = recurrenceForm('none');
    unsupported.set('recurrenceMode', 'weekly');
    expect(parseOperationalMutation(unsupported)).toBeNull();

    expect(
      parseOperationalMutation(
        recurrenceForm('interval_days', '7', { workspaceId: 'foreign-workspace' }),
      ),
    ).toBeNull();

    expect(
      parseOperationalMutation(
        recurrenceForm('interval_days', '7', { actorUserId: 'foreign-user' }),
      ),
    ).toBeNull();
  });
});
