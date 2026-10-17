export type ManualScope = 'workspace' | 'private';

type ReminderRuleBody = { kind: 'at'; remindAt: string };
type RecurrenceRuleBody = { kind: 'interval_days'; intervalDays: number };
type OperationalBodyValue =
  | string
  | number
  | string[]
  | ReminderRuleBody[]
  | RecurrenceRuleBody
  | null;

export type OperationalMutation = {
  path: string;
  method: 'POST' | 'PATCH' | 'PUT';
  body: Record<string, OperationalBodyValue>;
};

export type OperationalParseOptions = {
  timeZone?: string;
};

const PROJECT_STATUSES = ['planned', 'active', 'blocked', 'done', 'archived'] as const;
const MILESTONE_STATUSES = ['planned', 'active', 'done', 'cancelled'] as const;
const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
const ALERT_STATUSES = ['open', 'acknowledged', 'resolved', 'dismissed'] as const;
const TASK_DEPENDENCY_FORM_KEYS = new Set(['locale', 'operation', 'scope', 'id', 'dependencyIds']);
const TASK_REMINDER_FORM_KEYS = new Set(['locale', 'operation', 'scope', 'id', 'remindAtLocal']);
const TASK_RECURRENCE_FORM_KEYS = new Set([
  'locale',
  'operation',
  'scope',
  'id',
  'recurrenceMode',
  'intervalDays',
]);
const MAX_TASK_REMINDERS = 10;

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

function taskDependencyIds(form: FormData, taskId: string): string[] | null {
  for (const key of form.keys()) {
    if (!TASK_DEPENDENCY_FORM_KEYS.has(key)) return null;
  }

  const values = form.getAll('dependencyIds');
  if (values.length > 50) return null;

  const dependencyIds: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || normalized.length > 100 || normalized === taskId) return null;
    dependencyIds.push(normalized);
  }

  return new Set(dependencyIds).size === dependencyIds.length ? dependencyIds : null;
}

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseLocalDateTime(value: string): LocalDateTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const local = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText ?? '0'),
  };
  if (
    local.month < 1 ||
    local.month > 12 ||
    local.day < 1 ||
    local.day > 31 ||
    local.hour < 0 ||
    local.hour > 23 ||
    local.minute < 0 ||
    local.minute > 59 ||
    local.second < 0 ||
    local.second > 59
  ) {
    return null;
  }
  const check = new Date(
    Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second),
  );
  if (
    check.getUTCFullYear() !== local.year ||
    check.getUTCMonth() + 1 !== local.month ||
    check.getUTCDate() !== local.day ||
    check.getUTCHours() !== local.hour ||
    check.getUTCMinutes() !== local.minute ||
    check.getUTCSeconds() !== local.second
  ) {
    return null;
  }
  return local;
}

function partsInZone(date: Date, timeZone: string): LocalDateTime | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
    const local = {
      year: value('year'),
      month: value('month'),
      day: value('day'),
      hour: value('hour'),
      minute: value('minute'),
      second: value('second'),
    };
    return Object.values(local).every(Number.isFinite) ? local : null;
  } catch {
    return null;
  }
}

export function localDateTimeToIso(value: string, timeZone: string): string | null {
  const local = parseLocalDateTime(value.trim());
  if (!local || !timeZone.trim()) return null;
  const target = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  let guess = new Date(target);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = partsInZone(guess, timeZone);
    if (!actual) return null;
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess = new Date(guess.getTime() + (target - actualAsUtc));
  }

  const roundTrip = partsInZone(guess, timeZone);
  if (!roundTrip) return null;
  if (
    roundTrip.year !== local.year ||
    roundTrip.month !== local.month ||
    roundTrip.day !== local.day ||
    roundTrip.hour !== local.hour ||
    roundTrip.minute !== local.minute ||
    roundTrip.second !== local.second
  ) {
    return null;
  }
  return guess.toISOString();
}

function taskReminderRules(form: FormData, timeZone: string | undefined): ReminderRuleBody[] | null {
  for (const key of form.keys()) {
    if (!TASK_REMINDER_FORM_KEYS.has(key)) return null;
  }
  if (!timeZone) return null;

  const rawValues = form.getAll('remindAtLocal');
  if (rawValues.some((value) => typeof value !== 'string')) return null;
  const values = (rawValues as string[]).map((value) => value.trim()).filter(Boolean);
  if (values.length > MAX_TASK_REMINDERS) return null;

  const rules: ReminderRuleBody[] = [];
  const instants = new Set<string>();
  for (const value of values) {
    const remindAt = localDateTimeToIso(value, timeZone);
    if (!remindAt || instants.has(remindAt)) return null;
    instants.add(remindAt);
    rules.push({ kind: 'at', remindAt });
  }
  return rules.sort((left, right) => left.remindAt.localeCompare(right.remindAt));
}

function taskRecurrenceRule(form: FormData): RecurrenceRuleBody | null | undefined {
  for (const key of form.keys()) {
    if (!TASK_RECURRENCE_FORM_KEYS.has(key)) return undefined;
  }

  const mode = form.get('recurrenceMode');
  if (mode === 'none') return null;
  if (mode !== 'interval_days') return undefined;

  const rawInterval = form.get('intervalDays');
  if (typeof rawInterval !== 'string' || !rawInterval.trim()) return undefined;
  const intervalDays = Number(rawInterval);
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    return undefined;
  }
  return { kind: 'interval_days', intervalDays };
}

export function parseOperationalMutation(
  form: FormData,
  options: OperationalParseOptions = {},
): OperationalMutation | null {
  const operation = form.get('operation');
  const scope = scopeValue(form.get('scope'));
  if (typeof operation !== 'string' || !scope) return null;

  if (operation === 'quick-capture') {
    const kind = form.get('kind');
    if (kind !== 'project' && kind !== 'task') return null;

    const title = requiredText(form.get('title'), kind === 'project' ? 160 : 240);
    const description = optionalText(form.get('description'), kind === 'project' ? 4000 : 8000);
    if (!title || description === null) return null;

    const body: Record<string, OperationalBodyValue> = { scope, kind, title };
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
    const supersedesId = optionalText(form.get('supersedesId'), 100);
    if (!title || !decision || context === null || projectId === null || supersedesId === null) return null;

    const body: Record<string, OperationalBodyValue> = { scope, title, decision };
    if (context) body.context = context;
    if (projectId) body.projectId = projectId;
    if (supersedesId) body.supersedesId = supersedesId;
    return { path: '/v1/decision-lifecycle', method: 'POST', body };
  }

  const id = requiredText(form.get('id'), 100);
  if (!id) return null;
  const encodedId = encodeURIComponent(id);

  if (operation === 'task-dependencies') {
    const dependencyIds = taskDependencyIds(form, id);
    if (dependencyIds === null) return null;
    return {
      path: `/v1/tasks/${encodedId}/dependencies`,
      method: 'PUT',
      body: { scope, dependencyIds },
    };
  }

  if (operation === 'task-reminders') {
    const reminderRules = taskReminderRules(form, options.timeZone);
    if (reminderRules === null) return null;
    return {
      path: `/v1/tasks/${encodedId}/reminders`,
      method: 'PUT',
      body: { scope, reminderRules },
    };
  }

  if (operation === 'task-recurrence') {
    const recurrenceRule = taskRecurrenceRule(form);
    if (recurrenceRule === undefined) return null;
    return {
      path: `/v1/tasks/${encodedId}/recurrence`,
      method: 'PUT',
      body: { scope, recurrenceRule },
    };
  }

  if (operation === 'decision-reverse') {
    if (scope !== 'workspace') return null;
    const reason = requiredText(form.get('reason'), 4000);
    if (!reason) return null;
    return {
      path: `/v1/decision-lifecycle/${encodedId}/reverse`,
      method: 'PATCH',
      body: { scope, reason },
    };
  }

  if (operation === 'project-status') {
    const status = enumValue(form.get('status'), PROJECT_STATUSES);
    const progress = numericValue(form.get('progress'), 0, 100);
    if (!status || progress === null) return null;

    const body: Record<string, OperationalBodyValue> = { scope, status };
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
