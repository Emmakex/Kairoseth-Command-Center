import { MongoClient } from 'mongodb';
import { loadWorkerConfig } from '@kcc/config';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';

const config = loadWorkerConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
const outbox = new MongoAuditOutboxStore(mongo.db());
let stopped = false;
let initialized = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick() {
  try {
    await mongo.connect();
    await mongo.db().command({ ping: 1 });
    if (!initialized) {
      await outbox.ensureIndexes();
      initialized = true;
    }

    const drained = await outbox.drainPending(50);
    console.info(
      JSON.stringify({
        level: 'info',
        service: 'kcc-worker',
        event: 'audit_outbox.tick',
        mongodb: 'ok',
        claimed: drained.claimed,
        delivered: drained.delivered,
        failed: drained.failed,
        at: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'kcc-worker',
        event: 'audit_outbox.tick',
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
