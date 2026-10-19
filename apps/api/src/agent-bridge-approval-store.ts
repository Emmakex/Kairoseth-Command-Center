import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
  sign as signPayload,
} from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import type { IntegrationSecretStore } from './integration-secret-store';

export type AgentBridgeTrustedApprovalKey = {
  keyId: string;
  publicKeyPem: string;
  notBefore?: string;
  notAfter?: string;
};

export type AgentBridgeApprovalPayload = {
  version: 'kab.approval.v1';
  decision: 'ALLOW' | 'DENY';
  tenantId: string;
  installationId: string;
  toolId: string;
  correlationId: string;
  actionFingerprint: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

export interface AgentBridgeApprovalService {
  ensureIndexes(): Promise<void>;
  trustedApprovalKeys(tenantId: string): Promise<AgentBridgeTrustedApprovalKey[]>;
  generation(tenantId: string): Promise<number>;
  signApproval(input: {
    tenantId: string;
    installationId: string;
    toolId: string;
    correlationId: string;
    actionFingerprint: string;
    expiresAt: string;
    decision?: 'ALLOW' | 'DENY';
  }): Promise<string>;
}

type ApprovalSignerDocument = {
  tenantId: string;
  generation: number;
  keyId: string;
  publicKeyPem: string;
  privateKeySecretRef: string;
  createdAt: string;
  updatedAt: string;
};

const MAX_APPROVAL_LIFETIME_MS = 5 * 60 * 1000;

export class MongoAgentBridgeApprovalService implements AgentBridgeApprovalService {
  private readonly signers: Collection<ApprovalSignerDocument>;

  constructor(
    db: Db,
    private readonly secrets: IntegrationSecretStore,
  ) {
    this.signers = db.collection<ApprovalSignerDocument>('agent_bridge_approval_signers');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.signers.createIndex({ tenantId: 1 }, { unique: true }),
      this.signers.createIndex({ keyId: 1 }, { unique: true }),
    ]);
  }

  async trustedApprovalKeys(tenantId: string): Promise<AgentBridgeTrustedApprovalKey[]> {
    const signer = await this.getOrCreateSigner(tenantId);
    return [{ keyId: signer.keyId, publicKeyPem: signer.publicKeyPem }];
  }

  async generation(tenantId: string): Promise<number> {
    return (await this.getOrCreateSigner(tenantId)).generation;
  }

  async signApproval(input: {
    tenantId: string;
    installationId: string;
    toolId: string;
    correlationId: string;
    actionFingerprint: string;
    expiresAt: string;
    decision?: 'ALLOW' | 'DENY';
  }): Promise<string> {
    const signer = await this.getOrCreateSigner(input.tenantId);
    const privateKeyPem = await this.secrets.revealSecret(
      workspaceScope(input.tenantId),
      signer.privateKeySecretRef,
    );
    if (!privateKeyPem) throw new Error('agent_bridge_approval_private_key_unavailable');

    const now = new Date();
    const expiresAtMs = Date.parse(input.expiresAt);
    if (
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs <= now.getTime() ||
      expiresAtMs - now.getTime() > MAX_APPROVAL_LIFETIME_MS
    ) {
      throw new Error('agent_bridge_approval_lifetime_invalid');
    }

    const payload: AgentBridgeApprovalPayload = {
      version: 'kab.approval.v1',
      decision: input.decision ?? 'ALLOW',
      tenantId: input.tenantId,
      installationId: input.installationId,
      toolId: input.toolId,
      correlationId: input.correlationId,
      actionFingerprint: input.actionFingerprint,
      issuedAt: now.toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      nonce: randomUUID(),
    };
    const keyIdSegment = Buffer.from(signer.keyId, 'utf8').toString('base64url');
    const payloadSegment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signingInput = `kab1.${keyIdSegment}.${payloadSegment}`;
    const signature = signPayload(
      null,
      Buffer.from(signingInput, 'utf8'),
      createPrivateKey(privateKeyPem),
    ).toString('base64url');
    return `${signingInput}.${signature}`;
  }

  private async getOrCreateSigner(tenantId: string): Promise<ApprovalSignerDocument> {
    const normalizedTenantId = tenantId.trim();
    if (!normalizedTenantId) throw new Error('agent_bridge_approval_tenant_required');

    const existing = await this.signers.findOne({ tenantId: normalizedTenantId });
    if (existing) return existing;

    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const keyId = createHash('sha256').update(publicKeyDer).digest('base64url');
    const scope = workspaceScope(normalizedTenantId);
    const privateKeySecretRef = await this.secrets.createSecret(scope, privateKeyPem);
    const now = new Date().toISOString();
    const document: ApprovalSignerDocument = {
      tenantId: normalizedTenantId,
      generation: 0,
      keyId,
      publicKeyPem,
      privateKeySecretRef,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.signers.insertOne(document);
      return document;
    } catch (error) {
      await this.secrets.deleteSecret(scope, privateKeySecretRef).catch(() => false);
      if (isDuplicateKey(error)) {
        const winner = await this.signers.findOne({ tenantId: normalizedTenantId });
        if (winner) return winner;
      }
      throw error;
    }
  }
}

function workspaceScope(workspaceId: string) {
  return { kind: 'workspace' as const, workspaceId };
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000,
  );
}
