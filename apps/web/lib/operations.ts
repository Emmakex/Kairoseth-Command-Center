export type ManualScope = 'workspace' | 'private';

export type OperationalMutation = {
  path: string;
  method: 'POST' | 'PATCH';
  body: Record<string, string | number>;
};

const PROJECT_STATUSES = ['planned', 'active', 'blocked', 'done', 'archived'] as const;
const MILESTONE_STATUSES = ['planned', 'active', 'done', 'cancelled'] as const;
const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
const ALERT_STATUSES = ['open', 'acknowledged', 'resolved', 'dismissed'] as const;

function requiredText(value: FormDataEntryValue | null, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function optionalText(
  value: FormDataEntryValue | null,
  maxLength: number,
): string | undefined | null {
  if (value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.length <= maxLength ? normalized : null;
}

function scopeValue(value: FormDataEntryValue | null): ManualScope | null {
  return value === 'workspace' || value === 'private' ? value : null;
}

function numericValue(
  value: FormDataEntryValue | null,
  min: number,
  max: number,
): number | undefined | null {
  if (value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function enumValue<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
): T | null {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : null;
}

export function parseOperationalMutation(form: FormData): OperationalMutation | null {
  const operation = form.get('operation');
  const scope = scopeValue(form.get('scope'));
  if (typeof operation !== 'string' || !scope) return null;

  if (operation === 'quick-capture') {
    const kind = form.get('kind');
    if (kind !== 'project' && kind !== 'task') return null;

    const title = requiredText(form.get('title'), kind === 'project' ? 160 : 240);
    const description = optionalText(form.get('description'), kind === 'project' ? 4000 : 8000);
    if (!title || description === null) return null;

    const body: Record<string, string | number> = { scope, kind, title };
    if (description) body.description = description;

    if (kind === 'task') {
      const priority = numericValue(form.get('priority'), 0, 100);
      if (priority === null) return null;
      if (priority !== undefined) body.priority = priority;
    }

    return { path: '/v1/quick-capture', method: 'POST', body };
  }

  if (operation === 'milestone-create') {
    const projectId = requiredText(form.get('projectId'), 100);
    const title = requiredText(form.get('title'), 240);
    const weight = numericValue(form.get('weight'), 1, 100);
    if (!projectId || !title || weight === undefined || weight === null) return null;

    return {
      path: '/v1/milestones',
      method: 'POST',
      body: { scope, projectId, title, weight },
    };
  }

  if (operation === 'decision-create') {
    if (scope !== 'workspace') return null;
    const title = requiredText(form.get('title'), 240);
    const decision = requiredText(form.get('decision'), 8000);
    const context = optionalText(form.get('context'), 8000);
    const projectId = optionalText(form.get('projectId'), 100);
    if (!title || !decision || context === null || projectId === null) return null;

    const body: Record<string, string | number> = { scope, title, decision };
    if (context) body.context = context;
    if (projectId) body.projectId = projectId;
    return { path: '/v1/decisions', method: 'POST', body };
  }

  const id = requiredText(form.get('id'), 100);
  if (!id) return null;
  const encodedId = encodeURIComponent(id);

  if (operation === 'project-status') {
    const status = enumValue(form.get('status'), PROJECT_STATUSES);
    const progress = numericValue(form.get('progress'), 0, 100);
    if (!status || progress === null) return null;

    const body: Record<string, string | number> = { scope, status };
    if (progress !== undefined) body.progress = progress;
    return { path: `/v1/projects/${encodedId}/status`, method: 'PATCH', body };
  }

  if (operation === 'milestone-status') {
    const status = enumValue(form.get('status'), MILESTONE_STATUSES);
    if (!status) return null;
    return {
      path: `/v1/milestones/${encodedId}/status`,
      method: 'PATCH',
      body: { scope, status },
    };
  }

  if (operation === 'task-status') {
    const status = enumValue(form.get('status'), TASK_STATUSES);
    if (!status) return null;
    return {
      path: `/v1/tasks/${encodedId}/status`,
      method: 'PATCH',
      body: { scope, status },
    };
  }

  if (operation === 'alert-status') {
    const status = enumValue(form.get('status'), ALERT_STATUSES);
    if (!status) return null;
    return {
      path: `/v1/alerts/${encodedId}/status`,
      method: 'PATCH',
      body: { scope, status },
    };
  }

  return null;
}
