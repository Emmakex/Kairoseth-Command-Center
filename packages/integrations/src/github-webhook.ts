import { createHmac, timingSafeEqual } from 'node:crypto';

export type GitHubWebhookHeaders = {
  signature256: string;
  deliveryId: string;
  event: string;
};

export type GitHubWebhookVerification =
  | { ok: true; headers: GitHubWebhookHeaders }
  | { ok: false; error: 'invalid_headers' | 'invalid_signature' };

type HeaderValue = string | string[] | undefined;

function singleHeader(value: HeaderValue): string | null {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && value.length === 1) return value[0]?.trim() ?? null;
  return null;
}

export function parseGitHubWebhookHeaders(headers: Record<string, HeaderValue>): GitHubWebhookHeaders | null {
  const signature = singleHeader(headers['x-hub-signature-256']);
  const deliveryId = singleHeader(headers['x-github-delivery']);
  const event = singleHeader(headers['x-github-event']);

  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return null;
  if (!deliveryId || !/^[a-z0-9._:-]{1,200}$/i.test(deliveryId)) return null;
  if (!event || !/^[a-z0-9._-]{1,100}$/i.test(event)) return null;

  return {
    signature256: signature.toLowerCase(),
    deliveryId,
    event: event.toLowerCase(),
  };
}

export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: Buffer | Uint8Array | string,
  signature256: string,
): boolean {
  if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(signature256)) return false;

  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
    'utf8',
  );
  const actual = Buffer.from(signature256.toLowerCase(), 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyGitHubWebhook(input: {
  secret: string;
  rawBody: Buffer | Uint8Array | string;
  headers: Record<string, HeaderValue>;
}): GitHubWebhookVerification {
  const headers = parseGitHubWebhookHeaders(input.headers);
  if (!headers) return { ok: false, error: 'invalid_headers' };
  if (!verifyGitHubWebhookSignature(input.secret, input.rawBody, headers.signature256)) {
    return { ok: false, error: 'invalid_signature' };
  }
  return { ok: true, headers };
}

const REFRESH_EVENTS = new Set(['pull_request', 'issues', 'workflow_run', 'release']);

export function githubWebhookTriggersRepositoryRefresh(event: string): boolean {
  return REFRESH_EVENTS.has(event.toLowerCase());
}
