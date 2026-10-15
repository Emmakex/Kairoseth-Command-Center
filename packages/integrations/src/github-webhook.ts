import { createHmac, timingSafeEqual } from 'node:crypto';

export type GitHubWebhookHeaders = {
  signature256: string;
  deliveryId: string;
  event: string;
};

export type VerifiedGitHubWebhook = GitHubWebhookHeaders & {
  event: string;
};

function boundedHeader(value: string | string[] | undefined, max: number): string | null {
  if (Array.isArray(value)) return null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

export function parseGitHubWebhookHeaders(headers: Record<string, string | string[] | undefined>): GitHubWebhookHeaders | null {
  const signature256 = boundedHeader(headers['x-hub-signature-256'], 80);
  const deliveryId = boundedHeader(headers['x-github-delivery'], 200);
  const event = boundedHeader(headers['x-github-event'], 100);
  if (!signature256 || !deliveryId || !event) return null;
  if (!/^sha256=[a-fA-F0-9]{64}$/.test(signature256)) return null;
  return { signature256, deliveryId, event };
}

export function verifyGitHubWebhookSignature(
  secret: string,
  rawBody: Buffer,
  signature256: string,
): boolean {
  if (!secret || secret.length > 4096) return false;
  if (!/^sha256=[a-fA-F0-9]{64}$/.test(signature256)) return false;
  const provided = Buffer.from(signature256.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function verifyGitHubWebhook(input: {
  secret: string;
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}): VerifiedGitHubWebhook | null {
  const headers = parseGitHubWebhookHeaders(input.headers);
  if (!headers) return null;
  if (!verifyGitHubWebhookSignature(input.secret, input.rawBody, headers.signature256)) return null;
  return headers;
}

export function githubWebhookTriggersRepositoryRefresh(event: string): boolean {
  return event === 'pull_request' || event === 'issues' || event === 'workflow_run' || event === 'release';
}
