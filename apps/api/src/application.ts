import type { AuthProvider } from '@kcc/auth';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';
import { buildApp as buildBaseApp } from './app';
import type { ReadinessCheck } from './app';
import { registerDecisionCompatibilityGuard } from './decision-compatibility';
import { registerDecisionLifecycleRoutes } from './decisions';
import type { DecisionLifecycleStore } from './decision-lifecycle-store';
import { registerGitHubRepositoryRoutes } from './github-repositories';
import type { GitHubRepositoryStore } from './github-repository-store';
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

  registerGitHubRepositoryRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.githubRepositoryStore
      ? { githubRepositoryStore: options.githubRepositoryStore }
      : {}),
  });

  return app;
}
