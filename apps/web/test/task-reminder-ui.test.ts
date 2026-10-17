import { describe, expect, it } from 'vitest';
import { localDateTimeToIso, parseOperationalMutation } from '../lib/operations';

function reminderForm(values: string[], extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set('locale', 'es');
  form.set('operation', 'task-reminders');
  form.set('scope', 'workspace');
  form.set('id', 'task/one');
  for (const value of values) form.append('remindAtLocal', value);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

describe('task reminder web mutation', () => {
  it('converts Madrid local time to UTC and preserves seconds', () => {
    expect(localDateTimeToIso('2026-10-20T09:30:15', 'Europe/Madrid')).toBe(
      '2026-10-20T07:30:15.000Z',
    );
    expect(localDateTimeToIso('2027-01-20T09:30:15', 'Europe/Madrid')).toBe(
      '2027-01-20T08:30:15.000Z',
    );
  });

  it('rejects a local time that does not exist across the Madrid DST jump', () => {
    expect(localDateTimeToIso('2026-03-29T02:30:00', 'Europe/Madrid')).toBeNull();
  });

  it('builds a sorted reminder replacement for the authenticated timezone', () => {
    expect(
      parseOperationalMutation(
        reminderForm(['2026-10-20T10:00:00', '', '2026-10-20T09:00:00']),
        { timeZone: 'Europe/Madrid' },
      ),
    ).toEqual({
      path: '/v1/tasks/task%2Fone/reminders',
      method: 'PUT',
      body: {
        scope: 'workspace',
        reminderRules: [
          { kind: 'at', remindAt: '2026-10-20T07:00:00.000Z' },
          { kind: 'at', remindAt: '2026-10-20T08:00:00.000Z' },
        ],
      },
    });
  });

  it('supports clearing all reminders', () => {
    expect(
      parseOperationalMutation(reminderForm(['']), { timeZone: 'Europe/Madrid' }),
    ).toEqual({
      path: '/v1/tasks/task%2Fone/reminders',
      method: 'PUT',
      body: { scope: 'workspace', reminderRules: [] },
    });
  });

  it('requires the authenticated timezone and rejects duplicates, overflow and authority fields', () => {
    expect(parseOperationalMutation(reminderForm(['2026-10-20T09:00:00']))).toBeNull();

    expect(
      parseOperationalMutation(
        reminderForm(['2026-10-20T09:00:00', '2026-10-20T09:00:00']),
        { timeZone: 'Europe/Madrid' },
      ),
    ).toBeNull();

    expect(
      parseOperationalMutation(
        reminderForm(Array.from({ length: 11 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}T09:00:00`)),
        { timeZone: 'Europe/Madrid' },
      ),
    ).toBeNull();

    expect(
      parseOperationalMutation(
        reminderForm(['2026-10-20T09:00:00'], { workspaceId: 'foreign-workspace' }),
        { timeZone: 'Europe/Madrid' },
      ),
    ).toBeNull();
  });
});
