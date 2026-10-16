import { describe, expect, it } from 'vitest';
import {
  parsePrioritizationWeightPolicyMutation,
  prioritizationWeightKeys,
} from '../lib/prioritization-weight-policies';

function validValues(): Record<string, string> {
  return Object.fromEntries(prioritizationWeightKeys.map((key, index) => [key, String(index + 1)]));
}

function form(values: Record<string, string>) {
  const data = new FormData();
  data.set('locale', 'es');
  data.set('operation', 'priority-weights-update');
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('parsePrioritizationWeightPolicyMutation', () => {
  it('builds a full allow-listed policy update', () => {
    const values = validValues();
    const mutation = parsePrioritizationWeightPolicyMutation(form(values));

    expect(mutation).toEqual({
      path: '/v1/prioritization/weights',
      method: 'PATCH',
      body: {
        weights: Object.fromEntries(
          prioritizationWeightKeys.map((key) => [key, Number(values[key])]),
        ),
      },
    });
  });

  it('accepts the inclusive zero and one-hundred boundaries', () => {
    const values = validValues();
    values.taskBlocked = '0';
    values.alertCritical = '100';
    const mutation = parsePrioritizationWeightPolicyMutation(form(values));

    expect(mutation?.body.weights.taskBlocked).toBe(0);
    expect(mutation?.body.weights.alertCritical).toBe(100);
  });

  it('rejects missing, negative, fractional, non-numeric and out-of-range values', () => {
    const cases: Array<[string, string | undefined]> = [
      ['taskBlocked', undefined],
      ['taskBlocked', '-1'],
      ['taskBlocked', '10.5'],
      ['taskBlocked', 'abc'],
      ['taskBlocked', '101'],
    ];

    for (const [key, value] of cases) {
      const values = validValues();
      if (value === undefined) delete values[key];
      else values[key] = value;
      expect(parsePrioritizationWeightPolicyMutation(form(values))).toBeNull();
    }
  });

  it('rejects unexpected fields and the wrong operation', () => {
    const unexpected = form({ ...validValues(), workspaceId: 'workspace-b' });
    expect(parsePrioritizationWeightPolicyMutation(unexpected)).toBeNull();

    const wrongOperation = form(validValues());
    wrongOperation.set('operation', 'custom-script');
    expect(parsePrioritizationWeightPolicyMutation(wrongOperation)).toBeNull();
  });
});
