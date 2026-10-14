import type { AuthProvider } from '@kcc/auth';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';
import { buildApp as buildBaseApp } from './app';
import type { ReadinessCheck } from './app';
import { registerDecisionCompatibilityGuard } from './decision-compatibility';
import { registerDecisionLifecycleRoutes } from './decisions';
import type { DecisionLifecycleStore } from './decision-lifecycle-store';
import { registerStandaloneAuthRoutes } from './local-auth';
import type { StandaloneLocalAuthProvider } from './local-auth';
import { registerMilestoneRoutes } from './milestones';
import { registerOperationalAuditRoutes } from './operational-audit-routes';
import type { OperationalAuditStore } from './operational-audit-store';

type ApplicationOptions = {
  readinessCheck?: ReadinessCheck;
  logger?: boolean;
  authProvider?: AuthProvider;
  standaloneAuthProvider?: StandaloneLocalAuthProvider;
  operationalStore?: OperationalStore;
  milestoneStore?: MilestoneStore;
  decisionLifecycleStore?: DecisionLifecycleStore;
  operationalAuditStore?: OperationalAuditStore;
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

  return app;
}
