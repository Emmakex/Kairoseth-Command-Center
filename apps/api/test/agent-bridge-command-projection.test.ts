import { describe, expect, it } from 'vitest';
import {
  projectAgentBridgeOperatorCommand,
  sanitizeAgentBridgeOperatorOutput,
} from '../src/agent-bridge-command-projection';

describe('Agent Bridge operator command projection', () => {
  it('redacts runtime identity and key material inside arbitrary output', () => {
    expect(
      sanitizeAgentBridgeOperatorOutput({
        sessionId: 'runtime-session-secret',
        runtime_session: 'runtime-session-secret-2',
        actionFingerprint: 'fingerprint-secret',
        publicKeyPem: 'public-key-material',
        private_key: 'private-key-material',
        keyId: 'key-id-material',
        nested: {
          token: 'token-secret',
          ok: true,
        },
      }),
    ).toEqual({
      sessionId: '[redacted]',
      runtime_session: '[redacted]',
      actionFingerprint: '[redacted]',
      publicKeyPem: '[redacted]',
      private_key: '[redacted]',
      keyId: '[redacted]',
      nested: {
        token: '[redacted]',
        ok: true,
      },
    });
  });

  it('removes runtime ACK sessions and correlations while keeping a bounded operator trace', () => {
    const projected = projectAgentBridgeOperatorCommand({
      commandId: 'command-1',
      correlationId: 'correlation-1',
      installationId: 'installation-1',
      toolId: 'tool-1',
      state: 'completed',
      issuedAt: '2026-10-20T06:00:00.000Z',
      expiresAt: '2026-10-20T06:05:00.000Z',
      deliveryAttempt: 1,
      acknowledgement: {
        version: 'kab.command-ack.v1',
        commandId: 'command-1',
        deliveryAttempt: 1,
        sessionId: 'runtime-session-secret',
        correlationId: 'correlation-1',
        status: 'executed',
        completedAt: '2026-10-20T06:00:01.000Z',
        output: { sessionId: 'nested-runtime-secret', value: 42 },
      },
    });

    expect(projected).toEqual({
      commandId: 'command-1',
      installationId: 'installation-1',
      toolId: 'tool-1',
      state: 'completed',
      issuedAt: '2026-10-20T06:00:00.000Z',
      expiresAt: '2026-10-20T06:05:00.000Z',
      deliveryAttempt: 1,
      acknowledgement: {
        version: 'kab.command-ack.v1',
        commandId: 'command-1',
        deliveryAttempt: 1,
        status: 'executed',
        completedAt: '2026-10-20T06:00:01.000Z',
        output: { sessionId: '[redacted]', value: 42 },
      },
    });
    expect(JSON.stringify(projected)).not.toContain('runtime-session-secret');
    expect(JSON.stringify(projected)).not.toContain('nested-runtime-secret');
    expect(JSON.stringify(projected)).not.toContain('correlation-1');
  });
});
