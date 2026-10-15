import { MongoClient } from 'mongodb';
import { loadApiConfig } from '@kcc/config';
import { MongoOperationalStore } from '@kcc/persistence';
import { MongoIntegrationSignalStore } from '@kcc/persistence/integration-signals';
import { buildApp } from './application';
import { MongoDecisionLifecycleStore } from './decision-lifecycle-store';
import { MongoGitHubConnectionStore } from './github-connection-store';
import { GitHubRestClient } from './github-provider-client';
import { MongoGitHubRepositoryStore } from './github-repository-store';
import { MongoEncryptedIntegrationSecretStore } from './integration-secret-store';
import { MongoLocalIdentityStore } from './local-identity-store';
import { MongoOperationalAuditStore } from './operational-audit-store';
import { PersistentLocalAuthProvider } from './persistent-local-auth';

const config = loadApiConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
const operationalStore = new MongoOperationalStore(mongo.db());
const operationalAuditStore = new MongoOperationalAuditStore(mongo, mongo.db());
const decisionLifecycleStore = new MongoDecisionLifecycleStore(mongo, mongo.db());
const integrationSignalStore = new MongoIntegrationSignalStore(mongo.db());
const githubRepositoryStore = new MongoGitHubRepositoryStore(mongo, mongo.db());
const githubProviderClient = new GitHubRestClient(config.KCC_GITHUB_API_BASE_URL);
const integrationSecretStore = config.KCC_INTEGRATION_SECRET_KEY
  ? new MongoEncryptedIntegrationSecretStore(mongo.db(), config.KCC_INTEGRATION_SECRET_KEY)
  : undefined;
const githubConnectionStore = integrationSecretStore
  ? new MongoGitHubConnectionStore(mongo, mongo.db(), integrationSecretStore)
  : undefined;
const localIdentityStore = new MongoLocalIdentityStore(mongo, mongo.db());
let mongoReady = false;
let localAuthProvider: PersistentLocalAuthProvider | undefined;

try {
  await mongo.connect();
  await mongo.db().command({ ping: 1 });
  await Promise.all([
    operationalStore.ensureIndexes(),
    decisionLifecycleStore.ensureIndexes(),
    integrationSignalStore.ensureIndexes(),
    githubRepositoryStore.ensureIndexes(),
    ...(githubConnectionStore ? [githubConnectionStore.ensureIndexes()] : []),
  ]);
  mongoReady = true;

  if (config.KCC_AUTH_MODE === 'local') {
    if (!config.KCC_LOCAL_AUTH_SECRET) {
      console.warn('Standalone local auth is selected but KCC_LOCAL_AUTH_SECRET is missing.');
    } else {
      const provider = new PersistentLocalAuthProvider(localIdentityStore, {
        secret: config.KCC_LOCAL_AUTH_SECRET,
        sessionTtlSeconds: config.KCC_LOCAL_SESSION_TTL_SECONDS,
      });
      await provider.initialize(
        config.KCC_LOCAL_ADMIN_PASSWORD
          ? {
              email: config.KCC_LOCAL_ADMIN_EMAIL,
              password: config.KCC_LOCAL_ADMIN_PASSWORD,
              displayName: config.KCC_LOCAL_ADMIN_DISPLAY_NAME,
              locale: config.KCC_LOCAL_LOCALE,
              timezone: config.KCC_LOCAL_TIMEZONE,
              userId: config.KCC_LOCAL_USER_ID,
              workspaceId: config.KCC_LOCAL_WORKSPACE_ID,
              workspaceName: config.KCC_LOCAL_WORKSPACE_NAME,
            }
          : undefined,
      );
      localAuthProvider = provider;
    }
  }
} catch (error) {
  console.error('MongoDB or local identity bootstrap is not ready; API will stay alive but readiness will fail.', error);
}

const app = buildApp({
  logger: true,
  operationalStore,
  operationalAuditStore,
  milestoneStore: operationalStore,
  decisionLifecycleStore,
  integrationSignalStore,
  githubRepositoryStore,
  githubProviderClient,
  ...(githubConnectionStore ? { githubConnectionStore } : {}),
  ...(localAuthProvider
    ? {
        authProvider: localAuthProvider,
        standaloneAuthProvider: localAuthProvider,
        localIdentityProvider: localAuthProvider,
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
          : localAuthProvider || config.KCC_AUTH_MODE === 'external'
            ? 'ok'
            : 'error',
      integrationSecrets: githubConnectionStore ? 'ok' : 'not_configured',
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
