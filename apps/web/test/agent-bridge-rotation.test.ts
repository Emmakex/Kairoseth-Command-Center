import { describe, expect, it } from 'vitest';
import { parseAgentBridgeApprovalRotationResponse } from '../lib/agent-bridge-rotation';

describe('Agent Bridge approval rotation response parser', () => {
  it('accepts the safe operator projection', () => {
    expect(
      parseAgentBridgeApprovalRotationResponse({
        version: 'kcc.agent-bridge-approval-rotation.v1',
        status: {
          generation: 2,
          phase: 'stable',
          signingKeyId: 'key-current',
          trustedKeyIds: ['key-current'],
        },
      }),
    ).toEqual({
      version: 'kcc.agent-bridge-approval-rotation.v1',
      status: {
        generation: 2,
        phase: 'stable',
        signingKeyId: 'key-current',
        trustedKeyIds: ['key-current'],
      },
    });
  });

  it('rejects malformed generations, phases and key projections', () => {
    const base = {
      version: 'kcc.agent-bridge-approval-rotation.v1',
      status: {
        generation: 1,
        phase: 'overlap',
        signingKeyId: 'key-current',
        trustedKeyIds: ['key-current', 'key-next'],
      },
    };

    expect(
      parseAgentBridgeApprovalRotationResponse({
        ...base,
        status: { ...base.status, generation: -1 },
      }),
    ).toBeNull();
    expect(
      parseAgentBridgeApprovalRotationResponse({
        ...base,
        status: { ...base.status, phase: 'unknown' },
      }),
    ).toBeNull();
    expect(
      parseAgentBridgeApprovalRotationResponse({
        ...base,
        status: { ...base.status, signingKeyId: '' },
      }),
    ).toBeNull();
    expect(
      parseAgentBridgeApprovalRotationResponse({
        ...base,
        status: { ...base.status, trustedKeyIds: [] },
      }),
    ).toBeNull();
  });
});
