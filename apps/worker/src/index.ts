import { MongoClient } from 'mongodb';
import { loadWorkerConfig } from '@kcc/config';
import { executeGitHubRepositorySignals } from '@kcc/integrations/github-signal-executor';
import { GitHubProviderError, GitHubRestClient } from '@kcc/integrations/github';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';
import { MongoGitHubSignalRuntimeStore } from '@kcc/persistence/github-signal-runtime';
import { MongoEncryptedIntegrationSecretStore } from '@kcc/persistence/integration-secrets';
import { MongoIntegrationSignalStore } from '@kcc/persistence/integration-signals';
import {
  MongoIntegrationSyncJobStore,
  type IntegrationSyncJob,
} from '@kcc/persistence/integration-sync-jobs';

const config = loadWorkerConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
const db = mongo.db();
const outbox = new MongoAuditOutboxStore(db);
const syncJobs = new MongoIntegrationSyncJobStore(db);
const integrationSecretKey = config.KCC_INTEGRATION_SECRET_KEY;

const githubExecution = integrationSecretKey
  ? (() => {
      const secretStore = new MongoEncryptedIntegrationSecretStore(db, integrationSecretKey);
      return {
        secretStore,
        runtimeStore: new MongoGitHubSignalRuntimeStore(db, secretStore),
        signalStore: new MongoIntegrationSignalStore(db),
        providerClient: new GitHubRestClient(config.KCC_GITHUB_API_BASE_URL),
      };
    })()
  : null;

let stopped = false;
let initialized = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function workerLog(level: 'info' | 'error', event: string, details: Record<string, unknown> = {}) {
  const entry = JSON.stringify({
    level,
    service: 'kcc-worker',
    event,
    ...details,
    at: new Date().toISOString(),
  });
  if (level === 'error') console.error(entry);
  else console.info(entry);
}

async function failClaimedJob(job: IntegrationSyncJob, errorCode: string): Promise<void> {
  const claimToken = job.claimToken;
  if (!claimToken) {
    workerLog('error', 'integration_sync.claim_token_missing', { jobId: job.id, errorCode });
    return;
  }
  await syncJobs.fail(job.id, claimToken, errorCode);
}

async function retryClaimedJob(
  job: IntegrationSyncJob,
  errorCode: string,
  options: { baseDelayMs?: number; maxDelayMs?: number } = {},
): Promise<void> {
  const claimToken = job.claimToken;
  if (!claimToken) {
    workerLog('error', 'integration_sync.claim_token_missing', { jobId: job.id, errorCode });
    return;
  }
  const retried = await syncJobs.retry({
    jobId: job.id,
    claimToken,
    errorCode,
    ...options,
  });
  workerLog('info', 'integration_sync.retry_scheduled', {
    jobId: job.id,
    resourceId: job.resourceId,
    errorCode,
    status: retried?.status ?? 'claim_lost',
  });
}

async function executeGitHubSignalJob(job: IntegrationSyncJob): Promise<void> {
  if (!githubExecution) return;
  const claimToken = job.claimToken;
  if (!claimToken) {
    workerLog('error', 'integration_sync.claim_token_missing', { jobId: job.id });
    return;
  }

  let resolution;
  try {
    resolution = await githubExecution.runtimeStore.resolve(job.workspaceId, job.resourceId);
  } catch {
    await failClaimedJob(job, 'github_runtime_error');
    workerLog('error', 'github_refresh.runtime_error', {
      jobId: job.id,
      resourceId: job.resourceId,
      errorCode: 'github_runtime_error',
    });
    return;
  }

  if (resolution.status !== 'ready') {
    const errorCode = `github_${resolution.status}`;
    await failClaimedJob(job, errorCode);
    workerLog('error', 'github_refresh.runtime_unavailable', {
      jobId: job.id,
      resourceId: job.resourceId,
      errorCode,
    });
    return;
  }

  const runtime = resolution.runtime;
  try {
    const signals = await executeGitHubRepositorySignals({
      providerClient: githubExecution.providerClient,
      token: runtime.token,
      workspaceId: runtime.workspaceId,
      resourceId: runtime.resourceId,
      ...(runtime.projectId ? { projectId: runtime.projectId } : {}),
      owner: runtime.owner,
      repository: runtime.repository,
      limit: 50,
    });

    await githubExecution.signalStore.upsertSignals(runtime.workspaceId, signals);
    const completed = await syncJobs.complete(job.id, claimToken);
    if (!completed) {
      workerLog('error', 'github_refresh.complete_claim_lost', {
        jobId: job.id,
        resourceId: job.resourceId,
      });
      return;
    }

    workerLog('info', 'github_refresh.completed', {
      jobId: job.id,
      resourceId: job.resourceId,
      signalCount: signals.length,
    });
  } catch (error) {
    if (error instanceof GitHubProviderError) {
      const errorCode = `github_${error.code}`;
      switch (error.code) {
        case 'unauthorized':
          await githubExecution.runtimeStore.markConnectionInvalid(
            runtime.workspaceId,
            runtime.connectionId,
            error.code,
          );
          await failClaimedJob(job, errorCode);
          break;
        case 'forbidden':
        case 'not_found':
          await failClaimedJob(job, errorCode);
          break;
        case 'rate_limited':
          await retryClaimedJob(job, errorCode, {
            baseDelayMs: 5 * 60_000,
            maxDelayMs: 60 * 60_000,
          });
          break;
        case 'timeout':
        case 'upstream_error':
          await retryClaimedJob(job, errorCode);
          break;
      }
      workerLog('error', 'github_refresh.provider_error', {
        jobId: job.id,
        resourceId: job.resourceId,
        errorCode,
      });
      return;
    }

    await retryClaimedJob(job, 'github_worker_error');
    workerLog('error', 'github_refresh.worker_error', {
      jobId: job.id,
      resourceId: job.resourceId,
    });
  }
}

async function tick() {
  try {
    await mongo.connect();
    await db.command({ ping: 1 });
    if (!initialized) {
      await Promise.all([
        outbox.ensureIndexes(),
        syncJobs.ensureIndexes(),
        ...(githubExecution
          ? [githubExecution.secretStore.ensureIndexes(), githubExecution.signalStore.ensureIndexes()]
          : []),
      ]);
      initialized = true;
    }

    const [drained, requeuedSyncJobs] = await Promise.all([
      outbox.drainPending(50),
      syncJobs.requeueExpired({ limit: 100 }),
    ]);

    let githubRefresh: 'disabled' | 'idle' | 'processed' = 'disabled';
    if (githubExecution) {
      const job = await syncJobs.claimDue({ provider: 'github', kind: 'repository_signals' });
      if (job) {
        githubRefresh = 'processed';
        await executeGitHubSignalJob(job);
      } else {
        githubRefresh = 'idle';
      }
    }

    workerLog('info', 'worker.tick', {
      mongodb: 'ok',
      auditOutbox: {
        claimed: drained.claimed,
        delivered: drained.delivered,
        failed: drained.failed,
      },
      integrationSync: {
        requeuedExpired: requeuedSyncJobs,
        executionEnabled: Boolean(githubExecution),
        githubRefresh,
      },
    });
  } catch (error) {
    workerLog('error', 'worker.tick', {
      mongodb: 'error',
      message: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}

async function shutdown(signal: string) {
  stopped = true;
  workerLog('info', 'shutdown', { signal });
  await mongo.close();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

while (!stopped) {
  await tick();
  await wait(config.KCC_WORKER_POLL_MS);
}
