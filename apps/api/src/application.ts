import type { AuthProvider } from '@kcc/auth';
import type { MilestoneStore, OperationalStore } from '@kcc/persistence';
import type { IntegrationSignalStore } from '@kcc/persistence/integration-signals';
import type { IntegrationSyncJobStore } from '@kcc/persistence/integration-sync-jobs';
import type { PrioritizationWeightPolicyStore } from '@kcc/persistence/prioritization-weight-policies';
import type { SignalAlertRulePolicyStore } from '@kcc/persistence/signal-alert-rule-policies';
import type { GitHubWebhookStore } from '@kcc/persistence/github-webhooks';
import { registerAgentBridgeA2ARoutes } from './agent-bridge-a2a';
import type { AgentBridgeA2AStore } from './agent-bridge-a2a-store';
import { registerAgentBridgeControlRoutes } from './agent-bridge-control';
import type { AgentBridgeControlStore } from './agent-bridge-control-store';
import { registerAgentBridgeExecutionRoutes } from './agent-bridge-execution';
import type { AgentBridgeExecutionStore } from './agent-bridge-execution-store';
import { registerAgentBridgeRuntimeObservabilityRoutes } from './agent-bridge-runtime-observability';
import { buildApp as buildBaseApp } from './app';
import type { ReadinessCheck } from './app';
import { registerAutomationRulePolicyRoutes } from './automation-rule-policies';
import { registerDecisionCompatibilityGuard } from './decision-compatibility';
import { registerDecisionLifecycleRoutes } from './decisions';
import type { DecisionLifecycleStore } from './decision-lifecycle-store';
import { registerGitHubConnectionRoutes } from './github-connections';
import type { GitHubConnectionStore } from './github-connection-store';
import type { GitHubProviderClient } from './github-provider-client';
import { registerGitHubRepositoryRoutes } from './github-repositories';
import type { GitHubRepositoryStore } from './github-repository-store';
import { registerGitHubSignalRoutes } from './github-signals';
import { registerGitHubSyncJobRoutes } from './github-sync-jobs';
import { registerGitHubWebhookRoutes } from './github-webhooks';
import { registerIntegrationSignalRoutes } from './integration-signals';
import { registerStandaloneAuthRoutes } from './local-auth';
import type { LocalLoginProvider } from './local-auth';
import { registerLocalIdentityRoutes } from './local-identity-routes';
import type { PersistentLocalAuthProvider } from './persistent-local-auth';
import { registerMilestoneRoutes } from './milestones';
import { registerOperationalAuditRoutes } from './operational-audit-routes';
import type { OperationalAuditStore } from './operational-audit-store';
import { registerPriorityRoutes } from './priorities';
import { registerPrioritizationWeightPolicyRoutes } from './prioritization-weight-policies';
import { registerTaskDependencyRoutes } from './task-dependencies';
import type { TaskDependencyStore } from './task-dependency-store';
import { registerTaskRecurrenceRoutes } from './task-recurrence';
import type { TaskRecurrenceStore } from './task-recurrence-store';
import { registerTaskReminderRoutes } from './task-reminders';
import type { TaskReminderStore } from './task-reminder-store';
import { registerTaskStartGuard } from './task-start-guard';

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
  taskDependencyStore?: TaskDependencyStore;
  taskRecurrenceStore?: TaskRecurrenceStore;
  taskReminderStore?: TaskReminderStore;
  agentBridgeA2AStore?: AgentBridgeA2AStore;
  agentBridgeControlStore?: AgentBridgeControlStore;
  agentBridgeExecutionStore?: AgentBridgeExecutionStore;
  githubRepositoryStore?: GitHubRepositoryStore;
  githubConnectionStore?: GitHubConnectionStore;
  githubProviderClient?: GitHubProviderClient;
  githubWebhookStore?: GitHubWebhookStore;
  integrationSignalStore?: IntegrationSignalStore;
  integrationSyncJobStore?: IntegrationSyncJobStore;
  signalAlertRulePolicyStore?: SignalAlertRulePolicyStore;
  prioritizationWeightPolicyStore?: PrioritizationWeightPolicyStore;
};

export function buildApp(options: ApplicationOptions = {}) {
  const app = buildBaseApp({
    ...(options.readinessCheck ? { readinessCheck: options.readinessCheck } : {}),
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.operationalStore ? { operationalStore: options.operationalStore } : {}),
  });

  registerDecisionCompatibilityGuard(app);
  registerTaskStartGuard(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.operationalStore ? { operationalStore: options.operationalStore } : {}),
  });
  registerOperationalAuditRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.operationalAuditStore ? { auditStore: options.operationalAuditStore } : {}),
  });
  registerAgentBridgeA2ARoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.agentBridgeA2AStore
      ? { agentBridgeA2AStore: options.agentBridgeA2AStore }
      : {}),
  });
  registerAgentBridgeControlRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.agentBridgeControlStore
      ? { controlStore: options.agentBridgeControlStore }
      : {}),
  });
  registerAgentBridgeExecutionRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.agentBridgeControlStore
      ? { controlStore: options.agentBridgeControlStore }
      : {}),
    ...(options.agentBridgeExecutionStore
      ? { executionStore: options.agentBridgeExecutionStore }
      : {}),
  });
  registerAgentBridgeRuntimeObservabilityRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.agentBridgeControlStore
      ? { controlStore: options.agentBridgeControlStore }
      : {}),
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

  registerTaskDependencyRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.taskDependencyStore
      ? { taskDependencyStore: options.taskDependencyStore }
      : {}),
  });

  registerTaskRecurrenceRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.taskRecurrenceStore
      ? { taskRecurrenceStore: options.taskRecurrenceStore }
      : {}),
  });

  registerTaskReminderRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.taskReminderStore ? { taskReminderStore: options.taskReminderStore } : {}),
  });

  registerPriorityRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.operationalStore ? { operationalStore: options.operationalStore } : {}),
    ...(options.milestoneStore ? { milestoneStore: options.milestoneStore } : {}),
    ...(options.prioritizationWeightPolicyStore
      ? { prioritizationWeightPolicyStore: options.prioritizationWeightPolicyStore }
      : {}),
  });

  registerPrioritizationWeightPolicyRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.prioritizationWeightPolicyStore
      ? { prioritizationWeightPolicyStore: options.prioritizationWeightPolicyStore }
      : {}),
  });

  registerIntegrationSignalRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.integrationSignalStore
      ? { integrationSignalStore: options.integrationSignalStore }
      : {}),
  });

  registerAutomationRulePolicyRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.signalAlertRulePolicyStore
      ? { signalAlertRulePolicyStore: options.signalAlertRulePolicyStore }
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

  registerGitHubSyncJobRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.githubRepositoryStore
      ? { githubRepositoryStore: options.githubRepositoryStore }
      : {}),
    ...(options.githubConnectionStore
      ? { githubConnectionStore: options.githubConnectionStore } : {}),
    ...(options.integrationSyncJobStore
      ? { integrationSyncJobStore: options.integrationSyncJobStore }
      : {}),
  });

  registerGitHubConnectionRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.githubConnectionStore
      ? { githubConnectionStore: options.githubConnectionStore }
      : {}),
    ...(options.githubProviderClient
      ? { githubProviderClient: options.githubProviderClient } : {}),
  });

  registerGitHubWebhookRoutes(app, {
    ...(options.authProvider ? { authProvider: options.authProvider } : {}),
    ...(options.githubConnectionStore
      ? { githubConnectionStore: options.githubConnectionStore }
      : {}),
    ...(options.githubWebhookStore ? { githubWebhookStore: options.githubWebhookStore } : {}),
    ...(options.integrationSyncJobStore
      ? { integrationSyncJobStore: options.integrationSyncJobStore }
      : {}),
  });

  return app;
}
