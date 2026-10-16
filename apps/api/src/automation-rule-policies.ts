import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authorize } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Scope } from '@kcc/domain';
import {
  isBuiltInSignalAlertRuleId,
  type DerivedAlertSeverity,
} from '@kcc/integrations/signal-alert-rules';
import type { SignalAlertRulePolicyStore } from '@kcc/persistence/signal-alert-rule-policies';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

const severities = new Set<DerivedAlertSeverity>(['info', 'warning', 'urgent', 'critical']);

async function resolveSession(
  request: FastifyRequest,
  authProvider?: AuthProvider,
): Promise<SessionContext | null> {
  if (!authProvider) return null;
  const authorization = request.headers.authorization;
  const cookie = request.headers.cookie;
  return authProvider.resolveSession({
    ...(authorization ? { authorization } : {}),
    ...(cookie ? { cookie } : {}),
  });
}

function workspaceScope(session: SessionContext): WorkspaceScope | null {
  return session.activeWorkspaceId
    ? { kind: 'workspace', workspaceId: session.activeWorkspaceId }
    : null;
}

function canManageAutomation(session: SessionContext, scope: WorkspaceScope): boolean {
  return authorize(session, {
    scope,
    capability: 'automation.manage',
    product: 'command-center',
  });
}

function parseSeverity(value: unknown): DerivedAlertSeverity | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !severities.has(value as DerivedAlertSeverity)) return null;
  return value as DerivedAlertSeverity;
}

export function registerAutomationRulePolicyRoutes(
  app: FastifyInstance,
  options: {
    authProvider?: AuthProvider;
    signalAlertRulePolicyStore?: SignalAlertRulePolicyStore;
  },
): void {
  app.get('/v1/automation/rules', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageAutomation(session, scope)) return reply.code(403).send({ error: 'forbidden' });
    if (!options.signalAlertRulePolicyStore) {
      return reply.code(503).send({ error: 'automation_rule_policy_store_unavailable' });
    }

    const rules = await options.signalAlertRulePolicyStore.listEffective(scope.workspaceId);
    return { rules };
  });

  app.patch('/v1/automation/rules/:ruleId', async (request, reply) => {
    const session = await resolveSession(request, options.authProvider);
    if (!session) return reply.code(401).send({ error: 'unauthorized' });
    const scope = workspaceScope(session);
    if (!scope) return reply.code(400).send({ error: 'workspace_required' });
    if (!canManageAutomation(session, scope)) return reply.code(403).send({ error: 'forbidden' });
    if (!options.signalAlertRulePolicyStore) {
      return reply.code(503).send({ error: 'automation_rule_policy_store_unavailable' });
    }

    const params = request.params as { ruleId?: unknown };
    const rawRuleId = typeof params.ruleId === 'string' ? params.ruleId.trim() : '';
    if (!rawRuleId || !isBuiltInSignalAlertRuleId(rawRuleId)) {
      return reply.code(404).send({ error: 'automation_rule_not_found' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const enabled = body.enabled;
    const severity = parseSeverity(body.severity);
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'invalid_enabled' });
    }
    if (severity === null) return reply.code(400).send({ error: 'invalid_severity' });
    if (enabled === undefined && severity === undefined) {
      return reply.code(400).send({ error: 'automation_rule_policy_change_required' });
    }

    const current = (await options.signalAlertRulePolicyStore.listEffective(scope.workspaceId)).find(
      (rule) => rule.ruleId === rawRuleId,
    );
    if (!current) return reply.code(404).send({ error: 'automation_rule_not_found' });

    const policy = await options.signalAlertRulePolicyStore.upsert({
      workspaceId: scope.workspaceId,
      actorUserId: session.user.id,
      ruleId: rawRuleId,
      enabled: enabled === undefined ? current.enabled : enabled,
      severity: severity === undefined ? current.severity : severity,
    });

    return {
      rule: {
        ruleId: policy.ruleId,
        enabled: policy.enabled,
        severity: policy.severity,
        overridden: true,
        updatedAt: policy.updatedAt,
      },
    };
  });
}
