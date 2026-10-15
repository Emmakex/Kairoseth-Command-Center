import { describe, expect, it } from 'vitest';
import { integrationSyncRetryDelayMs } from '@kcc/persistence/integration-sync-jobs';

describe('integration sync retry policy', () => {
  it('uses bounded exponential backoff from the first claimed attempt', () => {
    expect(integrationSyncRetryDelayMs(1)).toBe(30_000);
    expect(integrationSyncRetryDelayMs(2)).toBe(60_000);
    expect(integrationSyncRetryDelayMs(3)).toBe(120_000);
    expect(integrationSyncRetryDelayMs(8)).toBe(3_600_000);
    expect(integrationSyncRetryDelayMs(50)).toBe(3_600_000);
  });

  it('enforces sane lower bounds for custom retry configuration', () => {
    expect(integrationSyncRetryDelayMs(1, 10, 20)).toBe(1_000);
    expect(integrationSyncRetryDelayMs(2, 10, 20)).toBe(1_000);
    expect(integrationSyncRetryDelayMs(2, 2_000, 10_000)).toBe(4_000);
  });
});
