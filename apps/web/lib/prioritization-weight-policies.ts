import type { PrioritizationWeightsSummary } from './api';

export type PrioritizationWeightPolicyMutation = {
  path: '/v1/prioritization/weights';
  method: 'PATCH';
  body: { weights: PrioritizationWeightsSummary };
};

export const prioritizationWeightKeys = [
  'taskManualPriorityMax',
  'taskBlocked',
  'taskDependencyImpactPerDependent',
  'taskOverdue',
  'taskDueToday',
  'alertInfo',
  'alertWarning',
  'alertUrgent',
  'alertCritical',
  'projectBlocked',
  'projectOverdue',
  'projectDueToday',
  'projectRemainingProgressMax',
  'milestoneOverdue',
  'milestoneDueToday',
  'milestoneWeightMax',
] as const satisfies readonly (keyof PrioritizationWeightsSummary)[];

const allowedFormKeys = new Set<string>(['locale', 'operation', ...prioritizationWeightKeys]);

function integerWeight(form: FormData, name: keyof PrioritizationWeightsSummary): number | null {
  const value = form.get(name);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^\d{1,3}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

export function parsePrioritizationWeightPolicyMutation(
  form: FormData,
): PrioritizationWeightPolicyMutation | null {
  if (form.get('operation') !== 'priority-weights-update') return null;
  for (const key of form.keys()) {
    if (!allowedFormKeys.has(key)) return null;
  }

  const weights = {} as PrioritizationWeightsSummary;
  for (const key of prioritizationWeightKeys) {
    const value = integerWeight(form, key);
    if (value === null) return null;
    weights[key] = value;
  }

  return {
    path: '/v1/prioritization/weights',
    method: 'PATCH',
    body: { weights },
  };
}
