import { randomUUID } from 'node:crypto';
import type { ClientSession, Collection, Db, MongoClient } from 'mongodb';
import type { Membership, MembershipRole, User, UserStatus, Workspace } from '@kcc/domain';
import { MongoAuditOutboxStore } from '@kcc/persistence/audit-outbox';

export type LocalCredential = {
  id: string;
  userId: string;
  emailNormalized: string;
  passwordScheme: 'scrypt-v1';
  passwordSalt: string;
  passwordHash: string;
  passwordVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalIdentityRecord = {
  user: User;
  workspace: Workspace;
  membership: Membership;
  credential: LocalCredential;
};

export type LocalMemberSummary = {
  user: User;
  membership: Membership;
};

export type PasswordMaterial = {
  passwordScheme: 'scrypt-v1';
  passwordSalt: string;
  passwordHash: string;
};

export interface LocalIdentityStore {
  ensureIndexes(): Promise<void>;
  countCredentials(): Promise<number>;
  bootstrapOwner(input: {
    user: User;
    workspace: Workspace;
    membership: Membership;
    emailNormalized: string;
    password: PasswordMaterial;
  }): Promise<boolean>;
  findByEmail(emailNormalized: string): Promise<LocalIdentityRecord | null>;
  findBySession(userId: string, workspaceId: string): Promise<LocalIdentityRecord | null>;
  listMembers(workspaceId: string): Promise<LocalMemberSummary[]>;
  createMember(input: {
    actorUserId: string;
    workspaceId: string;
    emailNormalized: string;
    displayName: string;
    locale: 'es' | 'en';
    timezone: string;
    role: Exclude<MembershipRole, 'platform_admin' | 'owner'>;
    password: PasswordMaterial;
  }): Promise<LocalMemberSummary | null>;
  updateMember(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    role?: Exclude<MembershipRole, 'platform_admin' | 'owner'>;
    status?: Extract<UserStatus, 'active' | 'suspended' | 'disabled'>;
  }): Promise<LocalMemberSummary | null>;
  updatePassword(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    expectedVersion?: number;
    password: PasswordMaterial;
    eventType: 'local.password_changed' | 'local.password_reset';
  }): Promise<number | null>;
}

export class MongoLocalIdentityStore implements LocalIdentityStore {
  private readonly users: Collection<User>;
  private readonly workspaces: Collection<Workspace>;
  private readonly memberships: Collection<Membership>;
  private readonly credentials: Collection<LocalCredential>;
  private readonly outbox: MongoAuditOutboxStore;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.users = db.collection<User>('users');
    this.workspaces = db.collection<Workspace>('workspaces');
    this.memberships = db.collection<Membership>('memberships');
    this.credentials = db.collection<LocalCredential>('local_credentials');
    this.outbox = new MongoAuditOutboxStore(db);
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.users.createIndex({ id: 1 }, { unique: true }),
      this.workspaces.createIndex({ id: 1 }, { unique: true }),
      this.memberships.createIndex({ id: 1 }, { unique: true }),
      this.memberships.createIndex({ workspaceId: 1, userId: 1 }, { unique: true }),
      this.credentials.createIndex({ userId: 1 }, { unique: true }),
      this.credentials.createIndex({ emailNormalized: 1 }, { unique: true }),
      this.outbox.ensureIndexes(),
    ]);
  }

  async countCredentials(): Promise<number> {
    return this.credentials.countDocuments({});
  }

  private async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession();
    let value!: T;
    try {
      await session.withTransaction(async () => {
        value = await work(session);
      });
      return value;
    } finally {
      await session.endSession();
    }
  }

  async bootstrapOwner(input: {
    user: User;
    workspace: Workspace;
    membership: Membership;
    emailNormalized: string;
    password: PasswordMaterial;
  }): Promise<boolean> {
    if ((await this.countCredentials()) > 0) return false;

    return this.transaction(async (session) => {
      const existing = await this.credentials.findOne({}, { session });
      if (existing) return false;
      const now = new Date().toISOString();
      const credential: LocalCredential = {
        id: randomUUID(),
        userId: input.user.id,
        emailNormalized: input.emailNormalized,
        passwordScheme: input.password.passwordScheme,
        passwordSalt: input.password.passwordSalt,
        passwordHash: input.password.passwordHash,
        passwordVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      await this.workspaces.insertOne(input.workspace, { session });
      await this.users.insertOne(input.user, { session });
      await this.memberships.insertOne(input.membership, { session });
      await this.credentials.insertOne(credential, { session });
      return true;
    });
  }

  async findByEmail(emailNormalized: string): Promise<LocalIdentityRecord | null> {
    const credential = await this.credentials.findOne({ emailNormalized });
    if (!credential) return null;
    return this.resolveRecord(credential);
  }

  async findBySession(userId: string, workspaceId: string): Promise<LocalIdentityRecord | null> {
    const credential = await this.credentials.findOne({ userId });
    if (!credential) return null;
    return this.resolveRecord(credential, workspaceId);
  }

  private async resolveRecord(
    credential: LocalCredential,
    expectedWorkspaceId?: string,
  ): Promise<LocalIdentityRecord | null> {
    const user = await this.users.findOne({ id: credential.userId });
    if (!user) return null;
    const membership = await this.memberships.findOne({
      userId: user.id,
      ...(expectedWorkspaceId ? { workspaceId: expectedWorkspaceId } : {}),
    });
    if (!membership) return null;
    const workspace = await this.workspaces.findOne({ id: membership.workspaceId });
    if (!workspace) return null;
    return { user, workspace, membership, credential };
  }

  async listMembers(workspaceId: string): Promise<LocalMemberSummary[]> {
    const memberships = await this.memberships.find({ workspaceId }).sort({ createdAt: 1 }).toArray();
    const users = await this.users
      .find({ id: { $in: memberships.map((membership) => membership.userId) } })
      .toArray();
    const usersById = new Map(users.map((user) => [user.id, user]));
    return memberships.flatMap((membership) => {
      const user = usersById.get(membership.userId);
      return user ? [{ user, membership }] : [];
    });
  }

  async createMember(input: {
    actorUserId: string;
    workspaceId: string;
    emailNormalized: string;
    displayName: string;
    locale: 'es' | 'en';
    timezone: string;
    role: Exclude<MembershipRole, 'platform_admin' | 'owner'>;
    password: PasswordMaterial;
  }): Promise<LocalMemberSummary | null> {
    return this.transaction(async (session) => {
      const workspace = await this.workspaces.findOne({ id: input.workspaceId, status: 'active' }, { session });
      if (!workspace) return null;
      const now = new Date().toISOString();
      const user: User = {
        id: randomUUID(),
        email: input.emailNormalized,
        displayName: input.displayName.trim(),
        locale: input.locale,
        timezone: input.timezone,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      const membership: Membership = {
        id: randomUUID(),
        userId: user.id,
        workspaceId: workspace.id,
        role: input.role,
        capabilities: [],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      const credential: LocalCredential = {
        id: randomUUID(),
        userId: user.id,
        emailNormalized: input.emailNormalized,
        passwordScheme: input.password.passwordScheme,
        passwordSalt: input.password.passwordSalt,
        passwordHash: input.password.passwordHash,
        passwordVersion: 1,
        createdAt: now,
        updatedAt: now,
      };
      await this.users.insertOne(user, { session });
      await this.memberships.insertOne(membership, { session });
      await this.credentials.insertOne(credential, { session });
      await this.outbox.enqueue(
        {
          scope: { kind: 'workspace', workspaceId: workspace.id },
          type: 'membership.created',
          actorUserId: input.actorUserId,
          entityType: 'membership',
          entityId: membership.id,
          summary: user.displayName,
          source: 'manual-api',
          metadata: { role: membership.role },
        },
        session,
      );
      return { user, membership };
    });
  }

  async updateMember(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    role?: Exclude<MembershipRole, 'platform_admin' | 'owner'>;
    status?: Extract<UserStatus, 'active' | 'suspended' | 'disabled'>;
  }): Promise<LocalMemberSummary | null> {
    return this.transaction(async (session) => {
      const membership = await this.memberships.findOne(
        { workspaceId: input.workspaceId, userId: input.userId },
        { session },
      );
      const user = await this.users.findOne({ id: input.userId }, { session });
      if (!membership || !user || membership.role === 'owner') return null;
      const now = new Date().toISOString();
      if (input.role) {
        await this.memberships.updateOne(
          { id: membership.id },
          { $set: { role: input.role, updatedAt: now } },
          { session },
        );
      }
      if (input.status) {
        await this.users.updateOne(
          { id: user.id },
          { $set: { status: input.status, updatedAt: now } },
          { session },
        );
      }
      const updatedMembership = await this.memberships.findOne({ id: membership.id }, { session });
      const updatedUser = await this.users.findOne({ id: user.id }, { session });
      if (!updatedMembership || !updatedUser) return null;
      await this.outbox.enqueue(
        {
          scope: { kind: 'workspace', workspaceId: input.workspaceId },
          type: 'membership.updated',
          actorUserId: input.actorUserId,
          entityType: 'membership',
          entityId: updatedMembership.id,
          summary: updatedUser.displayName,
          source: 'manual-api',
          metadata: {
            role: updatedMembership.role,
            userStatus: updatedUser.status,
          },
        },
        session,
      );
      return { user: updatedUser, membership: updatedMembership };
    });
  }

  async updatePassword(input: {
    actorUserId: string;
    workspaceId: string;
    userId: string;
    expectedVersion?: number;
    password: PasswordMaterial;
    eventType: 'local.password_changed' | 'local.password_reset';
  }): Promise<number | null> {
    return this.transaction(async (session) => {
      const membership = await this.memberships.findOne(
        { workspaceId: input.workspaceId, userId: input.userId },
        { session },
      );
      const user = await this.users.findOne({ id: input.userId }, { session });
      if (!membership || !user) return null;
      const filter = {
        userId: input.userId,
        ...(input.expectedVersion !== undefined ? { passwordVersion: input.expectedVersion } : {}),
      };
      const now = new Date().toISOString();
      const update = await this.credentials.updateOne(
        filter,
        {
          $set: {
            passwordScheme: input.password.passwordScheme,
            passwordSalt: input.password.passwordSalt,
            passwordHash: input.password.passwordHash,
            updatedAt: now,
          },
          $inc: { passwordVersion: 1 },
        },
        { session },
      );
      if (update.matchedCount === 0) return null;
      const credential = await this.credentials.findOne({ userId: input.userId }, { session });
      if (!credential) return null;
      await this.outbox.enqueue(
        {
          scope: { kind: 'workspace', workspaceId: input.workspaceId },
          type: input.eventType,
          actorUserId: input.actorUserId,
          entityType: 'user',
          entityId: user.id,
          summary: user.displayName,
          source: 'manual-api',
          metadata: { passwordVersion: credential.passwordVersion },
        },
        session,
      );
      return credential.passwordVersion;
    });
  }
}
