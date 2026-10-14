export type IntegrationSignalType =
  | 'repository.commit'
  | 'repository.pull_request'
  | 'repository.issue'
  | 'repository.ci'
  | 'repository.release'
  | 'calendar.event'
  | 'generic.webhook';

export interface IntegrationSignal {
  id: string;
  source: string;
  type: IntegrationSignalType;
  workspaceId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

export interface IntegrationAdapter {
  name: string;
  health(): Promise<'ok' | 'error'>;
  sync(input: { workspaceId: string; cursor?: string }): Promise<{
    signals: IntegrationSignal[];
    nextCursor?: string;
  }>;
}
