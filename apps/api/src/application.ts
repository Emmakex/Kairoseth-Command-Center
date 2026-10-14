import type { AuthProvider } from '@kcc/auth';
import type { LocalAuthService } from '@kcc/local-auth';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';
import { buildApp as buildBaseApp } from './app';
import type { ReadinessCheck } from './app';
import { registerLocalAuthRoutes } from './local-auth';
import { registerMilestoneRoutes } from './milestones';

type ApplicationOptions = {
  readinessCheck?: ReadinessCheck;
  logger?: boolean;
  authProvider?: AuthProvider;
  localAuthService?: LocalAuthService;
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

  registerLocalAuthRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.localAuthService ? { localAuthService: options.localAuthService } : {}),
  });

  registerMilestoneRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.milestoneStore ? { milestoneStore: options.milestoneStore } : {}),
  });

  return app;
}
