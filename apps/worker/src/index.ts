import { MongoClient } from 'mongodb';
import { loadWorkerConfig } from '@kcc/config';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';
import { MongoIntegrationSyncJobStore } from '@kcc/persistence/integration-sync-jobs';

const config = loadWorkerConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
const outbox = new MongoAuditOutboxStore(mongo.db());
const syncJobs = new MongoIntegrationSyncJobStore(mongo.db());
let stopped = false;
let initialized = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick() {
  try {
    await mongo.connect();
    await mongo.db().command({ ping: 1 });
    if (!initialized) {
      await Promise.all([outbox.ensureIndexes(), syncJobs.ensureIndexes()]);
      initialized = true;
    }

    const [drained, requeuedSyncJobs] = await Promise.all([
      outbox.drainPending(50),
      syncJobs.requeueExpired({ limit: 100 }),
    ]);
    console.info(
      JSON.stringify({
        level: 'info',
        service: 'kcc-worker',
        event: 'worker.tick',
        mongodb: 'ok',
        auditOutbox: {
          claimed: drained.claimed,
          delivered: drained.delivered,
          failed: drained.failed,
        },
        integrationSync: {
          requeuedExpired: requeuedSyncJobs,
          executionEnabled: false,
        },
        at: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'kcc-worker',
        event: 'worker.tick',
        mongodb: 'error',
        at: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'unknown_error',
      }),
    );
  }
}

async function shutdown(signal: string) {
  stopped = true;
  console.info(JSON.stringify({ level: 'info', service: 'kcc-worker', event: 'shutdown', signal }));
  await mongo.close();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

while (!stopped) {
  await tick();
  await wait(config.KCC_WORKER_POLL_MS);
}
