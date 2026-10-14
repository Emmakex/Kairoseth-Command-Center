import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { buildWorkspaceSession } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Membership, User, Workspace } from '@kcc/domain';
import type {
  LocalIdentityRecord,
  LocalIdentityStore,
  LocalMemberSummary,
  PasswordMaterial,
} from './local-identity-store';
import type { LocalLoginResult } from './local-auth';

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export type PersistentLocalAuthOptions = {
  secret: string;
  sessionTtlSeconds: number;
};

export type LocalBootstrapOptions = {
  email: string;
  password: string;
  displayName: string;
  locale: 'es' | 'en';
  timezone: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
};

type TokenPayload = {
  v: 2;
  sub: string;
  ws: string;
  pv: number;
  iat: number;
  exp: number;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function bearerCredential(authorization?: string): string | null {
  if (!authorization) return null;
  const [scheme, credential] = authorization.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !credential) return null;
  return credential;
}

function encodePayload(payload: TokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded: string): TokenPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TokenPayload>;
  if (
    candidate.v !== 2 ||
    typeof candidate.sub !== 'string' ||
    typeof candidate.ws !== 'string' ||
    typeof candidate.pv !== 'number' ||
    typeof candidate.iat !== 'number' ||
    typeof candidate.exp !== 'number'
  ) {
    return null;
  }
  return candidate as TokenPayload;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function createPasswordMaterial(password: string): Promise<PasswordMaterial> {
  const salt = randomBytes(24);
  const hash = await deriveKey(password, salt);
  return {
    passwordScheme: 'scrypt-v1',
    passwordSalt: salt.toString('base64url'),
    passwordHash: hash.toString('base64url'),
  };
}

async function passwordMatches(password: string, material: PasswordMaterial): Promise<boolean> {
  if (material.passwordScheme !== 'scrypt-v1') return false;
  const salt = Buffer.from(material.passwordSalt, 'base64url');
  const expected = Buffer.from(material.passwordHash, 'base64url');
  const actual = await deriveKey(password, salt);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function credentialMaterial(record: LocalIdentityRecord): PasswordMaterial {
  return {
    passwordScheme: record.credential.passwordScheme,
    passwordSalt: record.credential.passwordSalt,
    passwordHash: record.credential.passwordHash,
  };
}

export class PersistentLocalAuthProvider implements AuthProvider {
  readonly name = 'standalone-local-persistent';

  constructor(
    private readonly store: LocalIdentityStore,
    private readonly options: PersistentLocalAuthOptions,
  ) {}

  async initialize(bootstrap?: LocalBootstrapOptions): Promise<{ bootstrapped: boolean }> {
    await this.store.ensureIndexes();
    if ((await this.store.countCredentials()) > 0) return { bootstrapped: false };
    if (!bootstrap?.password) throw new Error('Local identity bootstrap password is required');

    const now = new Date().toISOString();
    const user: User = {
      id: bootstrap.userId,
      email: normalizeEmail(bootstrap.email),
      displayName: bootstrap.displayName,
      locale: bootstrap.locale,
      timezone: bootstrap.timezone,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const workspace: Workspace = {
      id: bootstrap.workspaceId,
      name: bootstrap.workspaceName,
      slug: 'local',
      type: 'organization',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const membership: Membership = {
      id: `membership:${bootstrap.userId}:${bootstrap.workspaceId}`,
      userId: bootstrap.userId,
      workspaceId: bootstrap.workspaceId,
      role: 'owner',
      capabilities: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const password = await createPasswordMaterial(bootstrap.password);
    const bootstrapped = await this.store.bootstrapOwner({
      user,
      workspace,
      membership,
      emailNormalized: normalizeEmail(bootstrap.email),
      password,
    });
    return { bootstrapped };
  }

  async authenticate(email: string, password: string): Promise<LocalLoginResult | null> {
    const record = await this.store.findByEmail(normalizeEmail(email));
    if (!record) return null;
    if (!(await passwordMatches(password, credentialMaterial(record)))) return null;
    const session = this.sessionFromRecord(record);
    if (!session) return null;
    return this.issueToken(session, record.credential.passwordVersion);
  }

  async resolveSession(input: {
    authorization?: string;
    cookie?: string;
  }): Promise<SessionContext | null> {
    const credential = bearerCredential(input.authorization);
    if (!credential) return null;
    const [encoded, signature, extra] = credential.split('.');
    if (!encoded || !signature || extra) return null;
    const expected = this.sign(encoded);
    if (signature.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = decodePayload(encoded);
    if (!payload) return null;
    const now = Math.floor(Date.now() / 1000);
    if (
      !Number.isInteger(payload.pv) ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.iat > now + 60 ||
      payload.exp <= now
    ) {
      return null;
    }
    const record = await this.store.findBySession(payload.sub, payload.ws);
    if (!record || record.credential.passwordVersion !== payload.pv) return null;
    return this.sessionFromRecord(record);
  }

  async listMembers(workspaceId: string): Promise<LocalMemberSummary[]> {
    return this.store.listMembers(workspaceId);
  }

  async createMember(input: {
    actorUserId: string;
    workspaceId: string;
    email: string;
    displayName: string;
    locale: 'es' | 'en';
    timezone: string;
    role: 'admin' | 'member';
    password: string;
  }): Promise<LocalMemberSummary | null> {
    const password = await createPasswordMaterial(input.password);
    return this.store.createMember({
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      emailNormalized: normalizeEmail(input.email),
      displayName: input.displayName,
      locale: input.locale,
      timezone: input.timezone,
      role: input.role,
      password,
    });
  }

  async updateMember(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    role?: 'admin' | 'member';
    status?: 'active' | 'suspended' | 'disabled';
  }): Promise<LocalMemberSummary | null> {
    return this.store.updateMember(input);
  }

  async changePassword(input: {
    actorUserId: string;
    workspaceId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<boolean> {
    const record = await this.store.findBySession(input.actorUserId, input.workspaceId);
    if (!record) return false;
    if (!(await passwordMatches(input.currentPassword, credentialMaterial(record)))) return false;
    const password = await createPasswordMaterial(input.newPassword);
    return (
      (await this.store.updatePassword({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        expectedVersion: record.credential.passwordVersion,
        password,
        eventType: 'local.password_changed',
      })) !== null
    );
  }

  async resetPassword(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    newPassword: string;
  }): Promise<boolean> {
    const target = await this.store.findBySession(input.userId, input.workspaceId);
    if (!target || target.membership.role === 'owner') return false;
    const password = await createPasswordMaterial(input.newPassword);
    return (
      (await this.store.updatePassword({
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        password,
        eventType: 'local.password_reset',
      })) !== null
    );
  }

  private sessionFromRecord(record: LocalIdentityRecord): SessionContext | null {
    return buildWorkspaceSession({
      user: record.user,
      workspace: record.workspace,
      membership: record.membership,
      productEntitlements: ['command-center'],
    });
  }

  private issueToken(session: SessionContext, passwordVersion: number): LocalLoginResult {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + this.options.sessionTtlSeconds;
    const payload: TokenPayload = {
      v: 2,
      sub: session.user.id,
      ws: session.activeWorkspaceId ?? '',
      pv: passwordVersion,
      iat: issuedAt,
      exp: expiresAt,
    };
    const encoded = encodePayload(payload);
    return {
      accessToken: `${encoded}.${this.sign(encoded)}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      session,
    };
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.options.secret).update(encodedPayload).digest('base64url');
  }
}
