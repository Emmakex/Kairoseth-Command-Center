import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db } from 'mongodb';
import type { Scope } from '@kcc/domain';

type WorkspaceScope = Extract<Scope, { kind: 'workspace' }>;

type EncryptedPayload = {
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
};

type IntegrationSecretDocument = EncryptedPayload & {
  id: string;
  scope: WorkspaceScope;
  createdAt: string;
  updatedAt: string;
};

function keyBuffer(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('integration_secret_key_must_be_32_bytes');
  }
  return key;
}

function aad(scope: WorkspaceScope, secretRef: string): Buffer {
  return Buffer.from(`kcc:${scope.workspaceId}:${secretRef}`, 'utf8');
}

export function encryptIntegrationSecret(
  keyHex: string,
  scope: WorkspaceScope,
  secretRef: string,
  plaintext: string,
): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer(keyHex), iv);
  cipher.setAAD(aad(scope, secretRef));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptIntegrationSecret(
  keyHex: string,
  scope: WorkspaceScope,
  secretRef: string,
  payload: EncryptedPayload,
): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyBuffer(keyHex),
    Buffer.from(payload.iv, 'base64'),
  );
  decipher.setAAD(aad(scope, secretRef));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export interface IntegrationSecretStore {
  ensureIndexes(): Promise<void>;
  createSecret(scope: WorkspaceScope, plaintext: string, session?: ClientSession): Promise<string>;
  replaceSecret(
    scope: WorkspaceScope,
    secretRef: string,
    plaintext: string,
    session?: ClientSession,
  ): Promise<boolean>;
  deleteSecret(scope: WorkspaceScope, secretRef: string, session?: ClientSession): Promise<boolean>;
  revealSecret(scope: WorkspaceScope, secretRef: string): Promise<string | null>;
}

export class MongoEncryptedIntegrationSecretStore implements IntegrationSecretStore {
  private readonly secrets: Collection<IntegrationSecretDocument>;

  constructor(
    db: Db,
    private readonly keyHex: string,
  ) {
    keyBuffer(keyHex);
    this.secrets = db.collection<IntegrationSecretDocument>('integration_secrets');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.secrets.createIndex({ id: 1 }, { unique: true }),
      this.secrets.createIndex({ 'scope.workspaceId': 1, updatedAt: -1 }),
    ]);
  }

  async createSecret(
    scope: WorkspaceScope,
    plaintext: string,
    session?: ClientSession,
  ): Promise<string> {
    const id = `sec_${randomUUID()}`;
    const now = new Date().toISOString();
    const encrypted = encryptIntegrationSecret(this.keyHex, scope, id, plaintext);
    const document: IntegrationSecretDocument = {
      id,
      scope,
      ...encrypted,
      createdAt: now,
      updatedAt: now,
    };
    await this.secrets.insertOne(document, session ? { session } : undefined);
    return id;
  }

  async replaceSecret(
    scope: WorkspaceScope,
    secretRef: string,
    plaintext: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const encrypted = encryptIntegrationSecret(this.keyHex, scope, secretRef, plaintext);
    const result = await this.secrets.updateOne(
      { id: secretRef, scope },
      { $set: { ...encrypted, updatedAt: new Date().toISOString() } },
      session ? { session } : undefined,
    );
    return result.matchedCount === 1;
  }

  async deleteSecret(
    scope: WorkspaceScope,
    secretRef: string,
    session?: ClientSession,
  ): Promise<boolean> {
    const result = await this.secrets.deleteOne(
      { id: secretRef, scope },
      session ? { session } : undefined,
    );
    return result.deletedCount === 1;
  }

  async revealSecret(scope: WorkspaceScope, secretRef: string): Promise<string | null> {
    const document = await this.secrets.findOne({ id: secretRef, scope });
    if (!document) return null;
    return decryptIntegrationSecret(this.keyHex, scope, secretRef, document);
  }
}
