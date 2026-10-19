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

export type AgentBridgeApprovalKeySetPayload = {
  version: 'kab.approval-keyset.v1';
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  generation: number;
  keys: AgentBridgeTrustedApprovalKey[];
  issuedAt: string;
};

export type AgentBridgeSignedApprovalKeySet = {
  payload: AgentBridgeApprovalKeySetPayload;
  signerKeyId: string;
  signature: string;
};

export type AgentBridgeApprovalRotationStatus = {
  generation: number;
  phase: 'stable' | 'overlap' | 'retiring';
  signingKeyId: string;
  trustedKeyIds: string[];
};

export interface AgentBridgeApprovalService {
  ensureIndexes(): Promise<void>;
  trustedApprovalKeys(tenantId: string): Promise<AgentBridgeTrustedApprovalKey[]>;
  generation(tenantId: string): Promise<number>;
  rotationStatus(tenantId: string): Promise<AgentBridgeApprovalRotationStatus>;
  beginRotation(tenantId: string): Promise<AgentBridgeApprovalRotationStatus>;
  syncApprovalKeys(input: {
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    currentGeneration: number;
  }): Promise<{
    update: AgentBridgeSignedApprovalKeySet | null;
    status: AgentBridgeApprovalRotationStatus;
  }>;
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

type ApprovalKeyMaterial = AgentBridgeTrustedApprovalKey & {
  privateKeySecretRef: string;
};

type ApprovalRotationState = {
  phase: 'overlap' | 'retiring';
  oldKey: ApprovalKeyMaterial;
  newKey: ApprovalKeyMaterial;
  startedAt: string;
  promotedAt?: string;
};

type ApprovalSignerDocument = {
  tenantId: string;
  generation: number;
  keyId: string;
  publicKeyPem: string;
  privateKeySecretRef: string;
  trustedKeys?: AgentBridgeTrustedApprovalKey[];
  rotation?: ApprovalRotationState;
  createdAt: string;
  updatedAt: string;
};

type InstallationDocument = {
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  status: 'active' | 'revoked';
};

type ApprovalSyncStateDocument = {
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  observedGeneration: number;
  observedAt: string;
};

const MAX_APPROVAL_LIFETIME_MS = 5 * 60 * 1000;

export class MongoAgentBridgeApprovalService implements AgentBridgeApprovalService {
  private readonly signers: Collection<ApprovalSignerDocument>;
  private readonly installations: Collection<InstallationDocument>;
  private readonly syncStates: Collection<ApprovalSyncStateDocument>;

  constructor(
    db: Db,
    private readonly secrets: IntegrationSecretStore,
  ) {
    this.signers = db.collection<ApprovalSignerDocument>('agent_bridge_approval_signers');
    this.installations = db.collection<InstallationDocument>('agent_bridge_installations');
    this.syncStates = db.collection<ApprovalSyncStateDocument>('agent_bridge_approval_sync_state');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.secrets.ensureIndexes(),
      this.signers.createIndex({ tenantId: 1 }, { unique: true }),
      this.signers.createIndex({ keyId: 1 }, { unique: true }),
      this.syncStates.createIndex({ tenantId: 1, installationId: 1 }, { unique: true }),
      this.syncStates.createIndex({ tenantId: 1, observedGeneration: 1 }),
    ]);
  }

  async trustedApprovalKeys(tenantId: string): Promise<AgentBridgeTrustedApprovalKey[]> {
    return publicKeys(await this.getOrCreateSigner(tenantId));
  }

  async generation(tenantId: string): Promise<number> {
    return (await this.getOrCreateSigner(tenantId)).generation;
  }

  async rotationStatus(tenantId: string): Promise<AgentBridgeApprovalRotationStatus> {
    return projectRotationStatus(await this.getOrCreateSigner(tenantId));
  }

  async beginRotation(tenantId: string): Promise<AgentBridgeApprovalRotationStatus> {
    const signer = await this.getOrCreateSigner(tenantId);
    if (signer.rotation) return projectRotationStatus(signer);

    const nextKey = await this.createKeyMaterial(signer.tenantId);
    const oldKey: ApprovalKeyMaterial = {
      keyId: signer.keyId,
      publicKeyPem: signer.publicKeyPem,
      privateKeySecretRef: signer.privateKeySecretRef,
    };
    const now = new Date().toISOString();
    const result = await this.signers.updateOne(
      {
        tenantId: signer.tenantId,
        generation: signer.generation,
        rotation: { $exists: false },
      },
      {
        $set: {
          generation: signer.generation + 1,
          trustedKeys: [publicKey(oldKey), publicKey(nextKey)],
          rotation: {
            phase: 'overlap',
            oldKey,
            newKey: nextKey,
            startedAt: now,
          },
          updatedAt: now,
        },
      },
    );

    if (result.modifiedCount !== 1) {
      await this.secrets
        .deleteSecret(workspaceScope(signer.tenantId), nextKey.privateKeySecretRef)
        .catch(() => false);
    }

    return projectRotationStatus(await this.getOrCreateSigner(signer.tenantId));
  }

  async syncApprovalKeys(input: {
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    currentGeneration: number;
  }): Promise<{
    update: AgentBridgeSignedApprovalKeySet | null;
    status: AgentBridgeApprovalRotationStatus;
  }> {
    if (!Number.isInteger(input.currentGeneration) || input.currentGeneration < 0) {
      throw new Error('agent_bridge_approval_generation_invalid');
    }

    await this.syncStates.updateOne(
      {
        tenantId: input.tenantId,
        installationId: input.installationId,
      },
      {
        $set: {
          bridgeInstanceId: input.bridgeInstanceId,
          observedGeneration: input.currentGeneration,
          observedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );

    let signer = await this.getOrCreateSigner(input.tenantId);
    signer = await this.advanceRotationIfSafe(signer);

    if (input.currentGeneration > signer.generation) {
      throw new Error('agent_bridge_approval_generation_ahead');
    }

    const status = projectRotationStatus(signer);
    if (input.currentGeneration === signer.generation) {
      return { update: null, status };
    }

    return {
      update: await this.signKeySetUpdate(signer, {
        installationId: input.installationId,
        bridgeInstanceId: input.bridgeInstanceId,
      }),
      status,
    };
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
    const privateKeyPem = await this.requirePrivateKey(
      signer.tenantId,
      signer.privateKeySecretRef,
    );

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

  private async advanceRotationIfSafe(
    signer: ApprovalSignerDocument,
  ): Promise<ApprovalSignerDocument> {
    if (!signer.rotation) return signer;

    if (signer.rotation.phase === 'overlap') {
      if (!(await this.allActiveInstallationsObserved(signer.tenantId, signer.generation))) {
        return signer;
      }

      const now = new Date().toISOString();
      const nextGeneration = signer.generation + 1;
      const result = await this.signers.updateOne(
        {
          tenantId: signer.tenantId,
          generation: signer.generation,
          'rotation.phase': 'overlap',
        },
        {
          $set: {
            generation: nextGeneration,
            keyId: signer.rotation.newKey.keyId,
            publicKeyPem: signer.rotation.newKey.publicKeyPem,
            privateKeySecretRef: signer.rotation.newKey.privateKeySecretRef,
            trustedKeys: [publicKey(signer.rotation.newKey)],
            rotation: {
              ...signer.rotation,
              phase: 'retiring',
              promotedAt: now,
            },
            updatedAt: now,
          },
        },
      );
      if (result.modifiedCount === 1) {
        return (await this.signers.findOne({ tenantId: signer.tenantId })) ?? signer;
      }
      return (await this.signers.findOne({ tenantId: signer.tenantId })) ?? signer;
    }

    if (!(await this.allActiveInstallationsObserved(signer.tenantId, signer.generation))) {
      return signer;
    }

    const oldSecretRef = signer.rotation.oldKey.privateKeySecretRef;
    const now = new Date().toISOString();
    const result = await this.signers.updateOne(
      {
        tenantId: signer.tenantId,
        generation: signer.generation,
        'rotation.phase': 'retiring',
      },
      {
        $set: {
          trustedKeys: [{ keyId: signer.keyId, publicKeyPem: signer.publicKeyPem }],
          updatedAt: now,
        },
        $unset: { rotation: '' },
      },
    );
    if (result.modifiedCount === 1 && oldSecretRef !== signer.privateKeySecretRef) {
      await this.secrets
        .deleteSecret(workspaceScope(signer.tenantId), oldSecretRef)
        .catch(() => false);
    }
    return (await this.signers.findOne({ tenantId: signer.tenantId })) ?? signer;
  }

  private async allActiveInstallationsObserved(
    tenantId: string,
    generation: number,
  ): Promise<boolean> {
    const installations = await this.installations
      .find({ tenantId, status: 'active' })
      .project<{ installationId: string; bridgeInstanceId: string }>({
        installationId: 1,
        bridgeInstanceId: 1,
      })
      .toArray();

    for (const installation of installations) {
      const state = await this.syncStates.findOne({
        tenantId,
        installationId: installation.installationId,
        bridgeInstanceId: installation.bridgeInstanceId,
        observedGeneration: { $gte: generation },
      });
      if (!state) return false;
    }
    return true;
  }

  private async signKeySetUpdate(
    signer: ApprovalSignerDocument,
    scope: { installationId: string; bridgeInstanceId: string },
  ): Promise<AgentBridgeSignedApprovalKeySet> {
    const payload: AgentBridgeApprovalKeySetPayload = {
      version: 'kab.approval-keyset.v1',
      tenantId: signer.tenantId,
      installationId: scope.installationId,
      bridgeInstanceId: scope.bridgeInstanceId,
      generation: signer.generation,
      keys: publicKeys(signer),
      issuedAt: new Date().toISOString(),
    };
    const privateKeyPem = await this.requirePrivateKey(
      signer.tenantId,
      signer.privateKeySecretRef,
    );
    const signature = signPayload(
      null,
      Buffer.from(canonicalJson(payload), 'utf8'),
      createPrivateKey(privateKeyPem),
    ).toString('base64url');
    return {
      payload,
      signerKeyId: signer.keyId,
      signature,
    };
  }

  private async requirePrivateKey(tenantId: string, secretRef: string): Promise<string> {
    const privateKeyPem = await this.secrets.revealSecret(
      workspaceScope(tenantId),
      secretRef,
    );
    if (!privateKeyPem) throw new Error('agent_bridge_approval_private_key_unavailable');
    return privateKeyPem;
  }

  private async getOrCreateSigner(tenantId: string): Promise<ApprovalSignerDocument> {
    const normalizedTenantId = tenantId.trim();
    if (!normalizedTenantId) throw new Error('agent_bridge_approval_tenant_required');

    const existing = await this.signers.findOne({ tenantId: normalizedTenantId });
    if (existing) return existing;

    const key = await this.createKeyMaterial(normalizedTenantId);
    const now = new Date().toISOString();
    const document: ApprovalSignerDocument = {
      tenantId: normalizedTenantId,
      generation: 0,
      keyId: key.keyId,
      publicKeyPem: key.publicKeyPem,
      privateKeySecretRef: key.privateKeySecretRef,
      trustedKeys: [publicKey(key)],
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.signers.insertOne(document);
      return document;
    } catch (error) {
      await this.secrets
        .deleteSecret(workspaceScope(normalizedTenantId), key.privateKeySecretRef)
        .catch(() => false);
      if (isDuplicateKey(error)) {
        const winner = await this.signers.findOne({ tenantId: normalizedTenantId });
        if (winner) return winner;
      }
      throw error;
    }
  }

  private async createKeyMaterial(tenantId: string): Promise<ApprovalKeyMaterial> {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const keyId = createHash('sha256').update(publicKeyDer).digest('base64url');
    const privateKeySecretRef = await this.secrets.createSecret(
      workspaceScope(tenantId),
      privateKeyPem,
    );
    return { keyId, publicKeyPem, privateKeySecretRef };
  }
}

function publicKey(key: ApprovalKeyMaterial): AgentBridgeTrustedApprovalKey {
  return {
    keyId: key.keyId,
    publicKeyPem: key.publicKeyPem,
    ...(key.notBefore ? { notBefore: key.notBefore } : {}),
    ...(key.notAfter ? { notAfter: key.notAfter } : {}),
  };
}

function publicKeys(signer: ApprovalSignerDocument): AgentBridgeTrustedApprovalKey[] {
  return structuredClone(
    signer.trustedKeys ?? [{ keyId: signer.keyId, publicKeyPem: signer.publicKeyPem }],
  );
}

function projectRotationStatus(
  signer: ApprovalSignerDocument,
): AgentBridgeApprovalRotationStatus {
  return {
    generation: signer.generation,
    phase: signer.rotation?.phase ?? 'stable',
    signingKeyId: signer.keyId,
    trustedKeyIds: publicKeys(signer).map((key) => key.keyId),
  };
}

function workspaceScope(workspaceId: string) {
  return { kind: 'workspace' as const, workspaceId };
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Unsupported canonical JSON value');
    }
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported canonical JSON value');
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000,
  );
}
