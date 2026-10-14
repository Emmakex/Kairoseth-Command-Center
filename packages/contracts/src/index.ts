export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}

export interface ReadyResponse {
  status: 'ready' | 'not_ready';
  checks: Record<string, 'ok' | 'error' | 'not_configured'>;
  timestamp: string;
}
