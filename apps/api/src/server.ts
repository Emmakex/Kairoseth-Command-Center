import { MongoClient } from 'mongodb';
import { loadApiConfig } from '@kcc/config';
import { MongoOperationalStore } from '@kcc/persistence';
import { MongoGitHubWebhookStore } from '@kcc/persistence/github-webhooks';
import { MongoIntegrationSignalStore } from '@kcc/persistence/integration-signals';
import { MongoIntegrationSyncJobStore } from '@kcc/persistence/integration-sync-jobs';
import { MongoPrioritizationWeightPolicyStore } from '@kcc/persistence/prioritization-weight-policies';
import { MongoSignalAlertRulePolicyStore } from '@kcc/persistence/signal-alert-rule-policies';
import { MongoAgentBridgeA2AStore } from './agent-bridge-a2a-store';
import { buildApp } from './application';
import { MongoDecisionLifecycleStore } from './decision-lifecycle-store';
import { MongoGitHubConnectionStore } from './github-connection-store';
import { GitHubRestClient } from './github-provider-client';
import { MongoGitHubRepositoryStore } from './github-repository-store';
import { MongoEncryptedIntegrationSecretStore } from './integration-secret-store';
import { MongoLocalIdentityStore } from './local-identity-store';
import { MongoOperationalAuditStore } from './operational-audit-store';
import { PersistentLocalAuthProvider } from './persistent-local-auth';
import { MongoTaskDependencyStore } from './task-dependency-store';
import { MongoTaskRecurrenceStore } from './task-recurrence-store';
import { MongoTaskReminderStore } from './task-reminder-store';

const config = loadApiConfig();
const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
const operationalStore = new MongoOperationalStore(mongo.db());
const operationalAuditStore = new MongoOperationalAuditStore(mongo, mongo.db());
const decisionLifecycleStore = new MongoDecisionLifecycleStore(mongo, mongo.db());
const taskDependencyStore = new MongoTaskDependencyStore(mongo, mongo.db());
const taskRecurrenceStore = new MongoTaskRecurrenceStore(mongo, mongo.db());
const taskReminderStore = new MongoTaskReminderStore(mongo, mongo.db());
const agentBridgeA2AStore = new MongoAgentBridgeA2AStore(mongo.db());
const integrationSignalStore = new MongoIntegrationSignalStore(mongo.db());
const integrationSyncJobStore = new MongoIntegrationSyncJobStore(mongo.db());
const signalAlertRulePolicyStore = new MongoSignalAlertRulePolicyStore(mongo, mongo.db());
const prioritizationWeightPolicyStore = new MongoPrioritizationWeightPolicyStore(mongo, mongo.db());
const githubRepositoryStore = new MongoGitHubRepositoryStore(mongo, mongo.db());
const githubProviderClient = new GitHubRestClient(config.KCC_GITHUB_API_BASE_URL);
const integrationSecretStore = config.KCC_INTEGRATION_SECRET_KEY
  ? new MongoEncryptedIntegrationSecretStore(mongo.db(), config.KCC_INTEGRATION_SECRET_KEY)
  : undefined;
const githubConnectionStore = integrationSecretStore
  ? new MongoGitHubConnectionStore(mongo, mongo.db(), integrationSecretStore)
  : undefined;
const githubWebhookStore = integrationSecretStore
  ? new MongoGitHubWebhookStore(mongo, mongo.db(), integrationSecretStore)
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
    taskDependencyStore.ensureIndexes(),
    taskRecurrenceStore.ensureIndexes(),
    taskReminderStore.ensureIndexes(),
    agentBridgeA2AStore.ensureIndexes(),
    integrationSignalStore.ensureIndexes(),
    integrationSyncJobStore.ensureIndexes(),
    signalAlertRulePolicyStore.ensureIndexes(),
    prioritizationWeightPolicyStore.ensureIndexes(),
    githubRepositoryStore.ensureIndexes(),
    ...(githubConnectionStore ? [githubConnectionStore.ensureIndexes()] : []),
    ...(githubWebhookStore ? [githubWebhookStore.ensureIndexes()] : []),
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
  taskDependencyStore,
  taskRecurrenceStore,
  taskReminderStore,
  agentBridgeA2AStore,
  integrationSignalStore,
  integrationSyncJobStore,
  signalAlertRulePolicyStore,
  prioritizationWeightPolicyStore,
  githubRepositoryStore,
  githubProviderClient,
  ...(githubConnectionStore ? { githubConnectionStore } : {}),
  ...(githubWebhookStore ? { githubWebhookStore } : {}),
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
      githubWebhooks: githubWebhookStore ? 'ok' : 'not_configured',
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
