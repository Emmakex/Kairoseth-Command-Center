import type { Collection, Db } from 'mongodb';
import type { Decision, Project, Scope } from '@kcc/domain';

export type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;
export type DecisionLifecycleStatus = Extract<Decision['status'], 'superseded' | 'reversed'>;

export interface DecisionLifecycleStore {
  projectExists(scope: WorkspaceScope, projectId: string): Promise<boolean>;
  getDecision(scope: WorkspaceScope, decisionId: string): Promise<Decision | null>;
  transitionActiveDecision(
    scope: WorkspaceScope,
    decisionId: string,
    status: DecisionLifecycleStatus,
  ): Promise<Decision | null>;
}

export class MongoDecisionLifecycleStore implements DecisionLifecycleStore {
  private readonly projects: Collection<Project>;
  private readonly decisions: Collection<Decision>;

  constructor(db: Db) {
    this.projects = db.collection<Project>('projects');
    this.decisions = db.collection<Decision>('decisions');
  }

  async projectExists(scope: WorkspaceScope, projectId: string): Promise<boolean> {
    return Boolean(await this.projects.findOne({ scope, id: projectId }, { projection: { _id: 1 } }));
  }

  async getDecision(scope: WorkspaceScope, decisionId: string): Promise<Decision | null> {
    return this.decisions.findOne({ scope, id: decisionId });
  }

  async transitionActiveDecision(
    scope: WorkspaceScope,
    decisionId: string,
    status: DecisionLifecycleStatus,
  ): Promise<Decision | null> {
    const now = new Date().toISOString();
    const result = await this.decisions.updateOne(
      { scope, id: decisionId, status: 'active' },
      { $set: { status, updatedAt: now } },
    );
    if (result.matchedCount === 0) return null;
    return this.decisions.findOne({ scope, id: decisionId });
  }
}
