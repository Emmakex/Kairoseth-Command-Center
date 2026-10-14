import { MongoClient } from 'mongodb';
import { loadWorkerConfig } from '@kcc/config';

const config = loadWorkerConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
let stopped = false;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tick() {
  try {
    await mongo.connect();
    await mongo.db().command({ ping: 1 });
    console.info(JSON.stringify({ level: 'info', service: 'kcc-worker', event: 'heartbeat', mongodb: 'ok', at: new Date().toISOString() }));
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', service: 'kcc-worker', event: 'heartbeat', mongodb: 'error', at: new Date().toISOString(), message: error instanceof Error ? error.message : 'unknown_error' }));
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
