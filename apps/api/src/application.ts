import type { AuthProvider } from '@kcc/auth';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';
import { buildApp as buildBaseApp } from './app';
import type { ReadinessCheck } from './app';
import { registerStandaloneAuthRoutes } from './local-auth';
import type { StandaloneLocalAuthProvider } from './local-auth';
import { registerMilestoneRoutes } from './milestones';

type ApplicationOptions = {
  readinessCheck?: ReadinessCheck;
  logger?: boolean;
  authProvider?: AuthProvider;
  standaloneAuthProvider?: StandaloneLocalAuthProvider;
  operationalStore?: OperationalStore;
  milestoneStore?: MilestoneStore;
};

export function buildApp(options: ApplicationOptions = {}) {
  const app = buildBaseApp({
    ...(options.readinessCheck ? { readinessCheck: options.readinessCheck } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.operationalStore ? { operationalStore: options.operationalStore } : {}),
  });

  if (options.standaloneAuthProvider) {
    registerStandaloneAuthRoutes(app, options.standaloneAuthProvider);
  }

  registerMilestoneRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.milestoneStore ? { milestoneStore: options.milestoneStore } : {}),
  });

  return app;
}
