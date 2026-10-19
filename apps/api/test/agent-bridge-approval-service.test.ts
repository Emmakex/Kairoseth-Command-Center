import {
  createPublicKey,
  generateKeyPairSync,
  verify as verifySignature,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AgentBridgeApprovalService } from '../src/agent-bridge-approval-service';

describe('AgentBridgeApprovalService', () => {
  it('emits a kab.approval.v1 token verifiable by the advertised trusted key', () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const privateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const service = new AgentBridgeApprovalService(privateKeyPem);
    const trusted = service.trustedKey();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();

    const token = service.signApproval({
      tenantId: 'workspace-a',
      installationId: 'installation-a',
      toolId: 'files.local.write-file',
      correlationId: 'correlation-a',
      actionFingerprint: 'fingerprint-a',
      expiresAt,
    });

    const segments = token.split('.');
    expect(segments).toHaveLength(4);
    expect(segments[0]).toBe('kab1');
    expect(Buffer.from(segments[1]!, 'base64url').toString('utf8')).toBe(trusted.keyId);

    const payload = JSON.parse(Buffer.from(segments[2]!, 'base64url').toString('utf8')) as {
      version: string;
      decision: string;
      tenantId: string;
      installationId: string;
      toolId: string;
      correlationId: string;
      actionFingerprint: string;
      issuedAt: string;
      expiresAt: string;
      nonce: string;
    };
    expect(payload).toEqual(expect.objectContaining({
      version: 'kab.approval.v1',
      decision: 'ALLOW',
      tenantId: 'workspace-a',
      installationId: 'installation-a',
      toolId: 'files.local.write-file',
      correlationId: 'correlation-a',
      actionFingerprint: 'fingerprint-a',
      expiresAt,
    }));
    expect(payload.nonce.length).toBeGreaterThan(20);
    expect(Number.isFinite(Date.parse(payload.issuedAt))).toBe(true);

    const signingInput = `${segments[0]}.${segments[1]}.${segments[2]}`;
    expect(
      verifySignature(
        null,
        Buffer.from(signingInput, 'utf8'),
        createPublicKey(trusted.publicKeyPem),
        Buffer.from(segments[3]!, 'base64url'),
      ),
    ).toBe(true);
  });

  it('refuses non-Ed25519 signing keys', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    expect(() => new AgentBridgeApprovalService(pem)).toThrow(/Ed25519/);
  });
});
