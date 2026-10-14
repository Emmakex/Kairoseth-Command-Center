import { MongoClient } from 'mongodb';
import { loadApiConfig } from '@kcc/config';
import { MongoOperationalStore } from '@kcc/persistence';
import { buildApp } from './app';

const config = loadApiConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
const operationalStore = new MongoOperationalStore(mongo.db());
let mongoReady = false;

try {
  await mongo.connect();
  await mongo.db().command({ ping: 1 });
  await operationalStore.ensureIndexes();
  mongoReady = true;
} catch (error) {
  console.error('MongoDB is not ready; API will stay alive but readiness will fail.', error);
}

const app = buildApp({
  logger: true,
  operationalStore,
  readinessCheck: async () => {
    if (!mongoReady) {
      try {
        await mongo.db().command({ ping: 1 });
        mongoReady = true;
      } catch {
        mongoReady = false;
      }
    }

    return {
      process: 'ok',
      mongodb: mongoReady ? 'ok' : 'error',
    };
  },
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  await mongo.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.KCC_API_HOST, port: config.KCC_API_PORT });
