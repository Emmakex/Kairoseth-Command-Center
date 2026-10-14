import { MongoClient } from 'mongodb';
import { LocalAuthProvider } from '@kcc/auth';
import { loadApiConfig } from '@kcc/config';
import { MongoLocalAuthStore } from '@kcc/local-auth';
import { MongoOperationalStore } from '@kcc/persistence';
import { buildApp } from './application';

const config = loadApiConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
const db = mongo.db();
const operationalStore = new MongoOperationalStore(db);
const localAuthStore = new MongoLocalAuthStore(db, {
  sessionTtlHours: config.KCC_LOCAL_SESSION_TTL_HOURS,
  ...(config.KCC_BOOTSTRAP_SECRET ? { bootstrapSecret: config.KCC_BOOTSTRAP_SECRET } : {}),
});
const authProvider = new LocalAuthProvider(localAuthStore);
let mongoReady = false;

try {
  await mongo.connect();
  await db.command({ ping: 1 });
  await Promise.all([operationalStore.ensureIndexes(), localAuthStore.ensureIndexes()]);
  mongoReady = true;
} catch (error) {
  console.error('MongoDB is not ready; API will stay alive but readiness will fail.', error);
}

const app = buildApp({
  logger: true,
  authProvider,
  localAuthService: localAuthStore,
  operationalStore,
  milestoneStore: operationalStore,
  readinessCheck: async () => {
    if (!mongoReady) {
      try {
        await db.command({ ping: 1 });
        mongoReady = true;
      } catch {
        mongoReady = false;
      }
    }

    return {
      process: 'ok',
      mongodb: mongoReady ? 'ok' : 'error',
      local_auth: config.KCC_AUTH_MODE === 'local' ? 'ok' : 'error',
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
