import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Db, Collection } from 'mongodb';
import { MongoServerError } from 'mongodb';
import { buildWorkspaceSession } from '@kcc/auth';
import type { SessionContext, SessionCredentialResolver } from '@kcc/auth';
import type { Membership, User, Workspace } from '@kcc/domain';

export type LocalSessionStatus = 'active' | 'revoked' | 'expired';

interface LocalSessionRecord {
  id: string;
  tokenHash: string;
  userId: string;
  workspaceId: string;
  membershipId: string;
  productEntitlements: string[];
  status: LocalSessionStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

interface BootstrapState {
  key: string;
  state: 'initializing' | 'initialized';
  startedAt: string;
  initializedAt?: string;
}

export interface LocalBootstrapInput {
  bootstrapSecret: string;
  email: string;
  displayName: string;
  workspaceName: string;
  workspaceSlug?: string;
  locale?: 'es' | 'en';
  timezone?: string;
}

export interface LocalBootstrapResult {
  token: string;
  tokenType: 'Bearer';
  expiresAt: string;
  session: SessionContext;
}

export interface LocalBootstrapStatus {
  initialized: boolean;
  bootstrapConfigured: boolean;
}

export type LocalAuthErrorCode =
  | 'bootstrap_not_configured'
  | 'invalid_bootstrap_secret'
  | 'already_initialized'
  | 'invalid_bootstrap_input';

export class LocalAuthError extends Error {
  constructor(readonly code: LocalAuthErrorCode) {
    super(code);
    this.name = 'LocalAuthError';
  }
}

export interface LocalAuthService {
  getBootstrapStatus(): Promise<LocalBootstrapStatus>;
  bootstrap(input: LocalBootstrapInput): Promise<LocalBootstrapResult>;
  revokeCredential(credential: string): Promise<boolean>;
}

export interface MongoLocalAuthOptions {
  bootstrapSecret?: string;
  sessionTtlHours?: number;
}

export function hashCredential(credential: string): string {
  return createHash('sha256').update(credential, 'utf8').digest('hex');
}

export function secureSecretMatches(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizeName(value: string, maxLength: number): string | null {
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function normalizeSlug(value: string): string | null {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized.length > 0 ? normalized : null;
}

function normalizeTimezone(value?: string): string | null {
  const timezone = value?.trim() || 'UTC';
  if (timezone.length > 100) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return null;
  }
}

function futureIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export class MongoLocalAuthStore implements SessionCredentialResolver, LocalAuthService {
  private readonly users: Collection<User>;
  private readonly workspaces: Collection<Workspace>;
  private readonly memberships: Collection<Membership>;
  private readonly sessions: Collection<LocalSessionRecord>;
  private readonly bootstrapStates: Collection<BootstrapState>;
  private readonly sessionTtlHours: number;
  private readonly bootstrapSecret?: string;

  constructor(db: Db, options: MongoLocalAuthOptions = {}) {
    this.users = db.collection<User>('users');
    this.workspaces = db.collection<Workspace>('workspaces');
    this.memberships = db.collection<Membership>('memberships');
    this.sessions = db.collection<LocalSessionRecord>('local_auth_sessions');
    this.bootstrapStates = db.collection<BootstrapState>('local_auth_bootstrap');
    this.bootstrapSecret = options.bootstrapSecret;
    this.sessionTtlHours = Math.min(24 * 365, Math.max(1, Math.round(options.sessionTtlHours ?? 720)));
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.users.createIndex({ email: 1 }, { unique: true }),
      this.workspaces.createIndex({ slug: 1 }, { unique: true }),
      this.memberships.createIndex({ userId: 1, workspaceId: 1 }, { unique: true }),
      this.sessions.createIndex({ tokenHash: 1 }, { unique: true }),
      this.sessions.createIndex({ status: 1, expiresAt: 1 }),
      this.bootstrapStates.createIndex({ key: 1 }, { unique: true }),
    ]);
  }

  async getBootstrapStatus(): Promise<LocalBootstrapStatus> {
    const [state, activeOwner] = await Promise.all([
      this.bootstrapStates.findOne({ key: 'local-bootstrap', state: 'initialized' }),
      this.memberships.findOne({ role: 'owner', status: 'active' }),
    ]);

    return {
      initialized: Boolean(state || activeOwner),
      bootstrapConfigured: Boolean(this.bootstrapSecret),
    };
  }

  async bootstrap(input: LocalBootstrapInput): Promise<LocalBootstrapResult> {
    if (!this.bootstrapSecret) throw new LocalAuthError('bootstrap_not_configured');
    if (!secureSecretMatches(input.bootstrapSecret, this.bootstrapSecret)) {
      throw new LocalAuthError('invalid_bootstrap_secret');
    }

    const email = normalizeEmail(input.email);
    const displayName = normalizeName(input.displayName, 160);
    const workspaceName = normalizeName(input.workspaceName, 160);
    const workspaceSlug = normalizeSlug(input.workspaceSlug ?? input.workspaceName);
    const timezone = normalizeTimezone(input.timezone);
    const locale = input.locale ?? 'es';
    if (!email || !displayName || !workspaceName || !workspaceSlug || !timezone) {
      throw new LocalAuthError('invalid_bootstrap_input');
    }

    if ((await this.getBootstrapStatus()).initialized) {
      throw new LocalAuthError('already_initialized');
    }

    const startedAt = new Date().toISOString();
    try {
      await this.bootstrapStates.insertOne({
        key: 'local-bootstrap',
        state: 'initializing',
        startedAt,
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new LocalAuthError('already_initialized');
      }
      throw error;
    }

    const userId = randomUUID();
    const workspaceId = randomUUID();
    const membershipId = randomUUID();
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = futureIso(this.sessionTtlHours);

    const user: User = {
      id: userId,
      email,
      displayName,
      locale,
      timezone,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const workspace: Workspace = {
      id: workspaceId,
      name: workspaceName,
      slug: workspaceSlug,
      type: 'organization',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const membership: Membership = {
      id: membershipId,
      userId,
      workspaceId,
      role: 'owner',
      capabilities: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const sessionRecord: LocalSessionRecord = {
      id: sessionId,
      tokenHash: hashCredential(token),
      userId,
      workspaceId,
      membershipId,
      productEntitlements: ['command-center'],
      status: 'active',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    try {
      if (await this.memberships.findOne({ role: 'owner', status: 'active' })) {
        throw new LocalAuthError('already_initialized');
      }

      await this.users.insertOne(user);
      await this.workspaces.insertOne(workspace);
      await this.memberships.insertOne(membership);
      await this.sessions.insertOne(sessionRecord);
      await this.bootstrapStates.updateOne(
        { key: 'local-bootstrap', state: 'initializing' },
        { $set: { state: 'initialized', initializedAt: new Date().toISOString() } },
      );
    } catch (error) {
      await Promise.allSettled([
        this.sessions.deleteOne({ id: sessionId }),
        this.memberships.deleteOne({ id: membershipId }),
        this.workspaces.deleteOne({ id: workspaceId }),
        this.users.deleteOne({ id: userId }),
        this.bootstrapStates.deleteOne({ key: 'local-bootstrap', state: 'initializing' }),
      ]);
      throw error;
    }

    const session = buildWorkspaceSession({
      user,
      workspace,
      membership,
      productEntitlements: sessionRecord.productEntitlements,
    });
    if (!session) throw new Error('bootstrap_session_invariant_failed');

    return { token, tokenType: 'Bearer', expiresAt, session };
  }

  async resolve(credential: string): Promise<SessionContext | null> {
    if (!credential || credential.length > 512) return null;
    const tokenHash = hashCredential(credential);
    const record = await this.sessions.findOne({ tokenHash, status: 'active' });
    if (!record) return null;

    if (Date.parse(record.expiresAt) <= Date.now()) {
      await this.sessions.updateOne(
        { id: record.id, status: 'active' },
        { $set: { status: 'expired', updatedAt: new Date().toISOString() } },
      );
      return null;
    }

    const [user, workspace, membership] = await Promise.all([
      this.users.findOne({ id: record.userId }),
      this.workspaces.findOne({ id: record.workspaceId }),
      this.memberships.findOne({ id: record.membershipId }),
    ]);
    if (!user || !workspace || !membership) return null;

    return buildWorkspaceSession({
      user,
      workspace,
      membership,
      productEntitlements: record.productEntitlements,
    });
  }

  async revokeCredential(credential: string): Promise<boolean> {
    if (!credential || credential.length > 512) return false;
    const result = await this.sessions.updateOne(
      { tokenHash: hashCredential(credential), status: 'active' },
      { $set: { status: 'revoked', updatedAt: new Date().toISOString() } },
    );
    return result.modifiedCount === 1;
  }
}
