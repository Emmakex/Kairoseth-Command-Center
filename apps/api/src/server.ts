import { MongoClient } from 'mongodb';
import { loadApiConfig } from '@kcc/config';
import { MongoOperationalStore } from '@kcc/persistence';
import { buildApp } from './application';
import { MongoDecisionLifecycleStore } from './decision-lifecycle-store';
import { StandaloneLocalAuthProvider } from './local-auth';
import { MongoOperationalAuditStore } from './operational-audit-store';

const config = loadApiConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
const operationalStore = new MongoOperationalStore(mongo.db());
const operationalAuditStore = new MongoOperationalAuditStore(mongo, mongo.db());
const decisionLifecycleStore = new MongoDecisionLifecycleStore(mongo, mongo.db());
let mongoReady = false;

try {
  await mongo.connect();
  await mongo.db().command({ ping: 1 });
  await Promise.all([operationalStore.ensureIndexes(), decisionLifecycleStore.ensureIndexes()]);
  mongoReady = true;
} catch (error) {
  console.error('MongoDB is not ready; API will stay alive but readiness will fail.', error);
}

let standaloneAuthProvider: StandaloneLocalAuthProvider | undefined;
if (config.KCC_AUTH_MODE === 'local') {
  if (config.KCC_LOCAL_ADMIN_PASSWORD && config.KCC_LOCAL_AUTH_SECRET) {
    standaloneAuthProvider = new StandaloneLocalAuthProvider({
      email: config.KCC_LOCAL_ADMIN_EMAIL,
      password: config.KCC_LOCAL_ADMIN_PASSWORD,
      secret: config.KCC_LOCAL_AUTH_SECRET,
      displayName: config.KCC_LOCAL_ADMIN_DISPLAY_NAME,
      locale: config.KCC_LOCAL_LOCALE,
      timezone: config.KCC_LOCAL_TIMEZONE,
      userId: config.KCC_LOCAL_USER_ID,
      workspaceId: config.KCC_LOCAL_WORKSPACE_ID,
      workspaceName: config.KCC_LOCAL_WORKSPACE_NAME,
      sessionTtlSeconds: config.KCC_LOCAL_SESSION_TTL_SECONDS,
    });
  } else {
    console.warn(
      'Standalone local auth is selected but KCC_LOCAL_ADMIN_PASSWORD or KCC_LOCAL_AUTH_SECRET is missing.',
    );
  }
}

const app = buildApp({
  logger: true,
  operationalStore,
  operationalAuditStore,
  milestoneStore: operationalStore,
  decisionLifecycleStore,
  ...(standaloneAuthProvider
    ? {
        authProvider: standaloneAuthProvider,
        standaloneAuthProvider,
      }
    : {}),
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
      authentication:
        config.KCC_AUTH_MODE === 'disabled'
          ? 'not_configured'
          : standaloneAuthProvider || config.KCC_AUTH_MODE === 'external'
            ? 'ok'
            : 'error',
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
