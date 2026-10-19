import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as signPayload,
  type KeyObject,
} from 'node:crypto';

export type AgentBridgeApprovalDecision = 'ALLOW' | 'DENY';

export type AgentBridgeApprovalPayload = {
  version: 'kab.approval.v1';
  decision: AgentBridgeApprovalDecision;
  tenantId: string;
  installationId: string;
  toolId: string;
  correlationId: string;
  actionFingerprint: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

export type AgentBridgeTrustedApprovalKey = {
  keyId: string;
  publicKeyPem: string;
  notBefore?: string;
  notAfter?: string;
};

export interface AgentBridgeApprovalSigner {
  signApproval(input: {
    decision?: AgentBridgeApprovalDecision;
    tenantId: string;
    installationId: string;
    toolId: string;
    correlationId: string;
    actionFingerprint: string;
    expiresAt: string;
  }): string;
}

export class AgentBridgeApprovalService implements AgentBridgeApprovalSigner {
  readonly generation = 0;
  private readonly privateKey: KeyObject;
  private readonly publicKeyPem: string;
  private readonly keyId: string;

  constructor(privateKeyPem: string) {
    if (!privateKeyPem.trim()) {
      throw new Error('Agent Bridge approval private key is required.');
    }

    try {
      this.privateKey = createPrivateKey(privateKeyPem);
    } catch {
      throw new Error('Agent Bridge approval private key is invalid.');
    }

    if (this.privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('Agent Bridge approval private key must be Ed25519.');
    }

    const publicKey = createPublicKey(this.privateKey);
    this.publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
    this.keyId = createHash('sha256').update(publicKeyDer).digest('base64url');
  }

  trustedKey(): AgentBridgeTrustedApprovalKey {
    return {
      keyId: this.keyId,
      publicKeyPem: this.publicKeyPem,
    };
  }

  signApproval(input: {
    decision?: AgentBridgeApprovalDecision;
    tenantId: string;
    installationId: string;
    toolId: string;
    correlationId: string;
    actionFingerprint: string;
    expiresAt: string;
  }): string {
    const issuedAt = new Date();
    const expiresAtMs = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= issuedAt.getTime()) {
      throw new Error('Agent Bridge approval expiration must be in the future.');
    }

    const payload: AgentBridgeApprovalPayload = {
      version: 'kab.approval.v1',
      decision: input.decision ?? 'ALLOW',
      tenantId: requireText(input.tenantId, 'tenantId'),
      installationId: requireText(input.installationId, 'installationId'),
      toolId: requireText(input.toolId, 'toolId'),
      correlationId: requireText(input.correlationId, 'correlationId'),
      actionFingerprint: requireText(input.actionFingerprint, 'actionFingerprint'),
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      nonce: randomBytes(24).toString('base64url'),
    };

    const keyIdSegment = Buffer.from(this.keyId, 'utf8').toString('base64url');
    const payloadSegment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signingInput = `kab1.${keyIdSegment}.${payloadSegment}`;
    const signature = signPayload(null, Buffer.from(signingInput, 'utf8'), this.privateKey);
    return `${signingInput}.${signature.toString('base64url')}`;
  }
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Agent Bridge approval ${field} is required.`);
  if (normalized.length > 512) throw new Error(`Agent Bridge approval ${field} is too long.`);
  return normalized;
}
