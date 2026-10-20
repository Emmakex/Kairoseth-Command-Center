import { describe, expect, it } from 'vitest';
import {
  parseAgentBridgeCommandResponse,
  sanitizeAgentBridgeOutput,
} from '../lib/agent-bridge-command';

describe('Agent Bridge command projection', () => {
  it('drops runtime-only acknowledgement fields and sanitizes secret-looking output', () => {
    const parsed = parseAgentBridgeCommandResponse({
      version: 'kcc.agent-bridge-command.v1',
      command: {
        commandId: 'command-1',
        correlationId: 'correlation-private',
        installationId: 'installation-1',
        toolId: 'woocommerce.main.orders.list',
        state: 'completed',
        issuedAt: '2026-10-20T06:00:00.000Z',
        expiresAt: '2026-10-20T06:05:00.000Z',
        deliveryAttempt: 1,
        acknowledgement: {
          version: 'kab.command-ack.v1',
          commandId: 'command-1',
          sessionId: 'runtime-session-private',
          correlationId: 'correlation-private',
          status: 'executed',
          completedAt: '2026-10-20T06:00:02.000Z',
          reason: 'Remote said Bearer abc.def.ghi and token=plain-secret',
          output: {
            count: 2,
            accessToken: 'must-not-render',
            sessionId: 'nested-runtime-session',
            actionFingerprint: 'nested-fingerprint',
            publicKeyPem: 'nested-public-key',
            message: 'authorization=another-secret',
            nested: { password: 'must-not-render', ok: true },
          },
        },
      },
    });

    expect(parsed).toEqual({
      version: 'kcc.agent-bridge-command.v1',
      command: {
        commandId: 'command-1',
        installationId: 'installation-1',
        toolId: 'woocommerce.main.orders.list',
        state: 'completed',
        issuedAt: '2026-10-20T06:00:00.000Z',
        expiresAt: '2026-10-20T06:05:00.000Z',
        deliveryAttempt: 1,
        acknowledgement: {
          status: 'executed',
          completedAt: '2026-10-20T06:00:02.000Z',
          reason: 'Remote said Bearer [redacted] and token=[redacted]',
          output: {
            count: 2,
            accessToken: '[redacted]',
            sessionId: '[redacted]',
            actionFingerprint: '[redacted]',
            publicKeyPem: '[redacted]',
            message: 'authorization=[redacted]',
            nested: { password: '[redacted]', ok: true },
          },
        },
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('runtime-session-private');
    expect(JSON.stringify(parsed)).not.toContain('correlation-private');
    expect(JSON.stringify(parsed)).not.toContain('must-not-render');
    expect(JSON.stringify(parsed)).not.toContain('plain-secret');
    expect(JSON.stringify(parsed)).not.toContain('another-secret');
    expect(JSON.stringify(parsed)).not.toContain('nested-runtime-session');
    expect(JSON.stringify(parsed)).not.toContain('nested-fingerprint');
    expect(JSON.stringify(parsed)).not.toContain('nested-public-key');
  });

  it('rejects malformed command state, lifecycle and acknowledgement status', () => {
    const base = {
      version: 'kcc.agent-bridge-command.v1',
      command: {
        commandId: 'command-1',
        installationId: 'installation-1',
        toolId: 'tool-1',
        state: 'queued',
        issuedAt: '2026-10-20T06:00:00.000Z',
        expiresAt: '2026-10-20T06:05:00.000Z',
        deliveryAttempt: 0,
      },
    };
    const acknowledgement = {
      status: 'executed',
      completedAt: '2026-10-20T06:00:01.000Z',
    };

    expect(
      parseAgentBridgeCommandResponse({
        ...base,
        command: { ...base.command, state: 'unknown' },
      }),
    ).toBeNull();

    expect(
      parseAgentBridgeCommandResponse({
        ...base,
        command: { ...base.command, state: 'completed' },
      }),
    ).toBeNull();

    expect(
      parseAgentBridgeCommandResponse({
        ...base,
        command: { ...base.command, acknowledgement },
      }),
    ).toBeNull();

    expect(
      parseAgentBridgeCommandResponse({
        ...base,
        command: {
          ...base.command,
          state: 'completed',
          acknowledgement: {
            status: 'owner_override',
            completedAt: '2026-10-20T06:00:01.000Z',
          },
        },
      }),
    ).toBeNull();
  });

  it('bounds deeply nested and long output', () => {
    const value = {
      text: 'x'.repeat(5000),
      nested: { a: { b: { c: { d: { e: { f: { g: 'too-deep' } } } } } } } },
    };
    const sanitized = sanitizeAgentBridgeOutput(value);
    expect(JSON.stringify(sanitized)).toContain('[truncated]');
    expect((sanitized as { text: string }).text.length).toBeLessThan(5000);
  });
});
