import { describe, expect, it } from 'vitest';
import { githubRateLimitRetryAt } from './github';

describe('githubRateLimitRetryAt', () => {
  const now = Date.parse('2026-10-15T08:00:00.000Z');

  it('uses Retry-After seconds as an absolute retry time', () => {
    const headers = new Headers({ 'retry-after': '120' });
    expect(githubRateLimitRetryAt(headers, now)).toBe('2026-10-15T08:02:00.000Z');
  });

  it('uses the latest provider hint when reset is later than Retry-After', () => {
    const resetSeconds = Math.floor(Date.parse('2026-10-15T08:10:00.000Z') / 1000);
    const headers = new Headers({
      'retry-after': '120',
      'x-ratelimit-reset': String(resetSeconds),
    });
    expect(githubRateLimitRetryAt(headers, now)).toBe('2026-10-15T08:10:00.000Z');
  });

  it('ignores stale or invalid hints', () => {
    const headers = new Headers({
      'retry-after': 'not-a-date',
      'x-ratelimit-reset': String(Math.floor((now - 60_000) / 1000)),
    });
    expect(githubRateLimitRetryAt(headers, now)).toBeUndefined();
  });
});
