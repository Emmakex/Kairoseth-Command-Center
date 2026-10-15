import type { AuthProvider } from '@kcc/auth';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';
import type { IntegrationSignalStore } from '@kcc/persistence/integration-signals';
import { buildApp as buildBaseApp } from './app';
import type { ReadinessCheck } from './app';
import { registerDecisionCompatibilityGuard } from './decision-compatibility';
import { registerDecisionLifecycleRoutes } from './decisions';
import type { DecisionLifecycleStore } from './decision-lifecycle-store';
import { registerGitHubConnectionRoutes } from './github-connections';
import type { GitHubConnectionStore } from './github-connection-store';
import type { GitHubProviderClient } from './github-provider-client';
import { registerGitHubRepositoryRoutes } from './github-repositories';
import type { GitHubRepositoryStore } from './github-repository-store';
import { registerGitHubSignalRoutes } from './github-signals';
import { registerIntegrationSignalRoutes } from './integration-signals';
import { registerStandaloneAuthRoutes } from './local-auth';
import type { LocalLoginProvider } from './local-auth';
import { registerLocalIdentityRoutes } from './local-identity-routes';
import type { PersistentLocalAuthProvider } from './persistent-local-auth';
import { registerMilestoneRoutes } from './milestones';
import { registerOperationalAuditRoutes } from './operational-audit-routes';
import type { OperationalAuditStore } from './operational-audit-store';

type ApplicationOptions = {
  readinessCheck?: ReadinessCheck;
  logger?: boolean;
  authProvider?: AuthProvider;
  standaloneAuthProvider?: LocalLoginProvider;
  localIdentityProvider?: PersistentLocalAuthProvider;
  operationalStore?: OperationalStore;
  milestoneStore?: MilestoneStore;
  decisionLifecycleStore?: DecisionLifecycleStore;
  operationalAuditStore?: OperationalAuditStore;
  githubRepositoryStore?: GitHubRepositoryStore;
  githubConnectionStore?: GitHubConnectionStore;
  githubProviderClient?: GitHubProviderClient;
  integrationSignalStore?: IntegrationSignalStore;
};

export function buildApp(options: ApplicationOptions = {}) {
  const app = buildBaseApp({
    ...(options.readinessCheck ? { readinessCheck: options.readinessCheck } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.operationalStore ? { operationalStore: options.operationalStore } : {}),
  });

  registerDecisionCompatibilityGuard(app);
  registerOperationalAuditRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.operationalAuditStore ? { auditStore: options.operationalAuditStore } : {}),
  });

  if (options.standaloneAuthProvider) {
    registerStandaloneAuthRoutes(app, options.standaloneAuthProvider);
  }
  if (options.localIdentityProvider) {
    registerLocalIdentityRoutes(app, {
      ...(options.authProvider ? { authProvider: options.authProvider } : {}),
      identityProvider: options.localIdentityProvider,
    });
  }

  registerMilestoneRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.milestoneStore ? { milestoneStore: options.milestoneStore } : {}),
  });

  registerDecisionLifecycleRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.decisionLifecycleStore
      ? { decisionLifecycleStore: options.decisionLifecycleStore }
      : {}),
  });

  registerIntegrationSignalRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.integrationSignalStore
      ? { integrationSignalStore: options.integrationSignalStore }
      : {}),
  });

  registerGitHubRepositoryRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.githubRepositoryStore
      ? { githubRepositoryStore: options.githubRepositoryStore }
      : {}),
    ...(options.githubConnectionStore
      ? { githubConnectionStore: options.githubConnectionStore }
      : {}),
    ...(options.githubProviderClient
      ? { githubProviderClient: options.githubProviderClient }
      : {}),
  });

  registerGitHubSignalRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.githubRepositoryStore
      ? { githubRepositoryStore: options.githubRepositoryStore }
      : {}),
    ...(options.githubConnectionStore
      ? { githubConnectionStore: options.githubConnectionStore }
      : {}),
    ...(options.githubProviderClient
      ? { githubProviderClient: options.githubProviderClient }
      : {}),
    ...(options.integrationSignalStore
      ? { integrationSignalStore: options.integrationSignalStore }
      : {}),
  });

  registerGitHubConnectionRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.githubConnectionStore
      ? { githubConnectionStore: options.githubConnectionStore }
      : {}),
    ...(options.githubProviderClient
      ? { githubProviderClient: options.githubProviderClient }
      : {}),
  });

  return app;
}
