import type { MongoGitHubScheduleDiscoveryStore } from '@kcc/persistence/github-schedule-discovery';
import type { MongoIntegrationSyncJobStore } from '@kcc/persistence/integration-sync-jobs';
import type { MongoIntegrationSyncScheduleStore } from '@kcc/persistence/integration-sync-schedules';

const DEFAULT_GITHUB_INTERVAL_SECONDS = 15 * 60;
const ENQUEUE_RETRY_DELAY_MS = 30_000;

export async function discoverGitHubSchedules(
  discoveryStore: MongoGitHubScheduleDiscoveryStore,
  scheduleStore: MongoIntegrationSyncScheduleStore,
): Promise<number> {
  const resources = await discoveryStore.listSchedulable();
  await Promise.all(
    resources.map((resource) =>
      scheduleStore.upsert({
        workspaceId: resource.workspaceId,
        provider: 'github',
        kind: 'repository_signals',
        resourceId: resource.resourceId,
        enabled: true,
        intervalSeconds: DEFAULT_GITHUB_INTERVAL_SECONDS,
      }),
    ),
  );
  return resources.length;
}

export async function enqueueDueGitHubSchedule(
  scheduleStore: MongoIntegrationSyncScheduleStore,
  jobStore: MongoIntegrationSyncJobStore,
  now = new Date(),
): Promise<'idle' | 'enqueued' | 'claim_lost'> {
  const schedule = await scheduleStore.claimDue({
    provider: 'github',
    kind: 'repository_signals',
    now,
  });
  if (!schedule) return 'idle';

  const claimToken = schedule.claimToken;
  if (!claimToken) return 'claim_lost';

  try {
    await jobStore.enqueue({
      workspaceId: schedule.workspaceId,
      provider: schedule.provider,
      kind: schedule.kind,
      resourceId: schedule.resourceId,
      dedupeKey: `schedule:${schedule.id}:${schedule.nextRunAt}`,
    });
    const completed = await scheduleStore.completeClaim(schedule.id, claimToken, now);
    return completed ? 'enqueued' : 'claim_lost';
  } catch (error) {
    await scheduleStore.releaseClaim(
      schedule.id,
      claimToken,
      new Date(now.getTime() + ENQUEUE_RETRY_DELAY_MS).toISOString(),
      now,
    );
    throw error;
  }
}
