import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify as verifySignature,
} from 'node:crypto';
import type { Collection, Db } from 'mongodb';

export type AgentBridgeDeploymentMode = 'hosted' | 'local' | 'hybrid' | 'embedded';
export type AgentBridgeReadiness = 'starting' | 'ready' | 'degraded';
export type AgentBridgeConnectorHealth = 'healthy' | 'degraded' | 'unhealthy';
export type AgentBridgeToolAvailability = 'available' | 'degraded' | 'blocked';

export type AgentBridgeRegistrationProof = {
  payload: {
    version: 'kab.registration.v1';
    bridgeInstanceId: string;
    keyId: string;
    publicKeyPem: string;
    runtimeVersion: string;
    deploymentMode: AgentBridgeDeploymentMode;
    capabilities: string[];
    nonce: string;
    issuedAt: string;
  };
  signature: string;
};

export type AgentBridgeSessionProof = {
  payload: {
    version: 'kab.session-proof.v1';
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    keyId: string;
    nonce: string;
    issuedAt: string;
  };
  signature: string;
};

export type AgentBridgeHeartbeat = {
  version: 'kab.heartbeat.v1';
  sessionId: string;
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  sentAt: string;
  readiness: AgentBridgeReadiness;
  runtimeVersion: string;
  capabilities: string[];
};

export type AgentBridgeRuntimeSnapshot = {
  version: 'kab.runtime-snapshot.v1';
  snapshotId: string;
  generatedAt: string;
  connectors: Array<{
    connectorId: string;
    connectorInstanceId: string;
    name: string;
    version: string;
    description: string;
    localizations?: Record<string, unknown>;
    capabilities: string[];
    tools: Array<{
      toolId: string;
      runtimeToolId: string;
      name: string;
      description: string;
      localizations?: Record<string, unknown>;
      risk: 'READ' | 'WRITE' | 'CRITICAL';
    }>;
  }>;
  health: Array<{
    connectorId: string;
    connectorInstanceId: string;
    status: AgentBridgeConnectorHealth;
    checkedAt: string;
    tools: Array<{
      toolId: string;
      runtimeToolId: string;
      availability: AgentBridgeToolAvailability;
      blockedReason?: 'circuit_open' | 'credential_rotation';
    }>;
  }>;
};

export type AgentBridgeRuntimeSession = {
  sessionId: string;
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  keyId: string;
  expiresAt: string;
  heartbeatIntervalSeconds: number;
};

export type AgentBridgeRuntimeObservability = {
  totalInstallations: number;
  connectedInstallations: number;
  degradedInstallations: number;
  offlineInstallations: number;
  installations: Array<{
    installationId: string;
    bridgeInstanceId: string;
    deploymentMode: AgentBridgeDeploymentMode;
    runtimeVersion: string;
    readiness: AgentBridgeReadiness | 'unknown';
    connectivity: 'connected' | 'stale' | 'never_seen';
    lastHeartbeatAt: string | null;
    lastSnapshotAt: string | null;
    capabilities: string[];
    connectors: {
      total: number;
      healthy: number;
      degraded: number;
      unhealthy: number;
    };
    tools: {
      total: number;
      available: number;
      degraded: number;
      blocked: number;
    };
  }>;
};

export interface AgentBridgeControlStore {
  ensureIndexes(): Promise<void>;
  issueEnrollmentToken(input: {
    tenantId: string;
    createdBy: string;
    ttlSeconds?: number;
  }): Promise<{ token: string; expiresAt: string }>;
  createEnrollmentChallenge(token: string): Promise<{ nonce: string; expiresAt: string } | null>;
  registerInstallation(
    token: string,
    proof: AgentBridgeRegistrationProof,
  ): Promise<{
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    keyId: string;
    registeredAt: string;
  } | null>;
  createSessionChallenge(input: {
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    keyId: string;
  }): Promise<{ nonce: string; expiresAt: string } | null>;
  openSession(proof: AgentBridgeSessionProof): Promise<{
    sessionId: string;
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    keyId: string;
    accessToken: string;
    issuedAt: string;
    expiresAt: string;
    heartbeatIntervalSeconds: number;
  } | null>;
  resolveRuntimeSession(accessToken: string): Promise<AgentBridgeRuntimeSession | null>;
  recordHeartbeat(
    session: AgentBridgeRuntimeSession,
    heartbeat: AgentBridgeHeartbeat,
  ): Promise<{ receivedAt: string; nextHeartbeatInSeconds: number } | null>;
  recordRuntimeSnapshot(
    session: AgentBridgeRuntimeSession,
    snapshot: AgentBridgeRuntimeSnapshot,
  ): Promise<{ snapshotId: string; receivedAt: string } | null>;
  summarizeTenant(tenantId: string): Promise<AgentBridgeRuntimeObservability>;
}

type EnrollmentTokenDocument = {
  tokenHash: string;
  tenantId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  challengeNonceHash?: string;
  challengeExpiresAt?: string;
  consumedAt?: string;
};

type InstallationDocument = {
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  keyId: string;
  publicKeyPem: string;
  registeredAt: string;
  status: 'active' | 'revoked';
  deploymentMode: AgentBridgeDeploymentMode;
  runtimeVersion: string;
  capabilities: string[];
  lastHeartbeat?: {
    receivedAt: string;
    sentAt: string;
    readiness: AgentBridgeReadiness;
    runtimeVersion: string;
    capabilities: string[];
  };
};

type SessionChallengeDocument = {
  nonceHash: string;
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  keyId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
};

type RuntimeSessionDocument = AgentBridgeRuntimeSession & {
  tokenHash: string;
  issuedAt: string;
  revokedAt?: string;
};

type RuntimeSnapshotDocument = {
  tenantId: string;
  installationId: string;
  bridgeInstanceId: string;
  snapshotId: string;
  generatedAt: string;
  receivedAt: string;
  snapshot: AgentBridgeRuntimeSnapshot;
};

const DEFAULT_ENROLLMENT_TTL_SECONDS = 900;
const CHALLENGE_TTL_SECONDS = 120;
const SESSION_TTL_SECONDS = 900;
const HEARTBEAT_INTERVAL_SECONDS = 30;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const CONNECTIVITY_STALE_AFTER_MS = HEARTBEAT_INTERVAL_SECONDS * 3 * 1000;

function digestSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function secret(): string {
  return randomBytes(32).toString('base64url');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
  if (isPlainObject(value)) {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported canonical JSON value');
}

function validTimestamp(value: string, nowMs: number, maxSkewMs = MAX_CLOCK_SKEW_MS): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && Math.abs(parsed - nowMs) <= maxSkewMs;
}

function publicKeyFingerprint(publicKeyPem: string): string | null {
  try {
    const der = createPublicKey(publicKeyPem).export({ format: 'der', type: 'spki' });
    return createHash('sha256').update(der).digest('base64url');
  } catch {
    return null;
  }
}

function verifyProof(payload: Record<string, unknown>, signature: string, publicKeyPem: string): boolean {
  try {
    const decoded = Buffer.from(signature, 'base64url');
    if (decoded.length === 0) return false;
    return verifySignature(
      null,
      Buffer.from(canonicalJson(payload), 'utf8'),
      createPublicKey(publicKeyPem),
      decoded,
    );
  } catch {
    return false;
  }
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function normalizedCapabilities(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export class MongoAgentBridgeControlStore implements AgentBridgeControlStore {
  private readonly enrollmentTokens: Collection<EnrollmentTokenDocument>;
  private readonly installations: Collection<InstallationDocument>;
  private readonly sessionChallenges: Collection<SessionChallengeDocument>;
  private readonly sessions: Collection<RuntimeSessionDocument>;
  private readonly snapshots: Collection<RuntimeSnapshotDocument>;

  constructor(private readonly db: Db) {
    this.enrollmentTokens = db.collection('agent_bridge_enrollment_tokens');
    this.installations = db.collection('agent_bridge_installations');
    this.sessionChallenges = db.collection('agent_bridge_session_challenges');
    this.sessions = db.collection('agent_bridge_runtime_sessions');
    this.snapshots = db.collection('agent_bridge_runtime_snapshots');
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.enrollmentTokens.createIndex({ tokenHash: 1 }, { unique: true }),
      this.enrollmentTokens.createIndex({ expiresAt: 1 }),
      this.installations.createIndex({ installationId: 1 }, { unique: true }),
      this.installations.createIndex(
        { tenantId: 1, bridgeInstanceId: 1 },
        { unique: true },
      ),
      this.installations.createIndex({ tenantId: 1, status: 1 }),
      this.sessionChallenges.createIndex({ nonceHash: 1 }, { unique: true }),
      this.sessionChallenges.createIndex({ expiresAt: 1 }),
      this.sessions.createIndex({ tokenHash: 1 }, { unique: true }),
      this.sessions.createIndex({ sessionId: 1 }, { unique: true }),
      this.sessions.createIndex({ tenantId: 1, installationId: 1, expiresAt: 1 }),
      this.snapshots.createIndex(
        { tenantId: 1, installationId: 1 },
        { unique: true },
      ),
      this.snapshots.createIndex({ tenantId: 1, receivedAt: -1 }),
    ]);
  }

  async issueEnrollmentToken(input: {
    tenantId: string;
    createdBy: string;
    ttlSeconds?: number;
  }): Promise<{ token: string; expiresAt: string }> {
    const now = new Date();
    const ttl = input.ttlSeconds ?? DEFAULT_ENROLLMENT_TTL_SECONDS;
    const token = secret();
    const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
    await this.enrollmentTokens.insertOne({
      tokenHash: digestSecret(token),
      tenantId: input.tenantId,
      createdBy: input.createdBy,
      createdAt: now.toISOString(),
      expiresAt,
    });
    return { token, expiresAt };
  }

  async createEnrollmentChallenge(
    token: string,
  ): Promise<{ nonce: string; expiresAt: string } | null> {
    const now = new Date();
    const grant = await this.enrollmentTokens.findOne({
      tokenHash: digestSecret(token),
      consumedAt: { $exists: false },
      expiresAt: { $gt: now.toISOString() },
    });
    if (!grant) return null;

    const nonce = secret();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
    const result = await this.enrollmentTokens.updateOne(
      {
        tokenHash: grant.tokenHash,
        consumedAt: { $exists: false },
        expiresAt: { $gt: now.toISOString() },
      },
      {
        $set: {
          challengeNonceHash: digestSecret(nonce),
          challengeExpiresAt: expiresAt,
        },
      },
    );
    return result.matchedCount === 1 ? { nonce, expiresAt } : null;
  }

  async registerInstallation(
    token: string,
    proof: AgentBridgeRegistrationProof,
  ): Promise<{
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    keyId: string;
    registeredAt: string;
  } | null> {
    const now = new Date();
    const tokenHash = digestSecret(token);
    const grant = await this.enrollmentTokens.findOne({
      tokenHash,
      consumedAt: { $exists: false },
      expiresAt: { $gt: now.toISOString() },
      challengeNonceHash: digestSecret(proof.payload.nonce),
      challengeExpiresAt: { $gt: now.toISOString() },
    });
    if (!grant) return null;

    const fingerprint = publicKeyFingerprint(proof.payload.publicKeyPem);
    const capabilities = normalizedCapabilities(proof.payload.capabilities);
    if (
      proof.payload.version !== 'kab.registration.v1' ||
      !fingerprint ||
      fingerprint !== proof.payload.keyId ||
      !validTimestamp(proof.payload.issuedAt, now.getTime()) ||
      !sameStringArray(capabilities, proof.payload.capabilities) ||
      !verifyProof(
        proof.payload as unknown as Record<string, unknown>,
        proof.signature,
        proof.payload.publicKeyPem,
      )
    ) {
      return null;
    }

    const consumed = await this.enrollmentTokens.findOneAndUpdate(
      {
        tokenHash,
        consumedAt: { $exists: false },
        expiresAt: { $gt: now.toISOString() },
        challengeNonceHash: digestSecret(proof.payload.nonce),
        challengeExpiresAt: { $gt: now.toISOString() },
      },
      { $set: { consumedAt: now.toISOString() } },
      { returnDocument: 'before', includeResultMetadata: false },
    );
    if (!consumed) return null;

    const existing = await this.installations.findOne({
      tenantId: grant.tenantId,
      bridgeInstanceId: proof.payload.bridgeInstanceId,
    });
    if (existing) return null;

    const installationId = randomUUID();
    const registeredAt = now.toISOString();
    await this.installations.insertOne({
      tenantId: grant.tenantId,
      installationId,
      bridgeInstanceId: proof.payload.bridgeInstanceId,
      keyId: proof.payload.keyId,
      publicKeyPem: proof.payload.publicKeyPem,
      registeredAt,
      status: 'active',
      deploymentMode: proof.payload.deploymentMode,
      runtimeVersion: proof.payload.runtimeVersion,
      capabilities,
    });

    return {
      tenantId: grant.tenantId,
      installationId,
      bridgeInstanceId: proof.payload.bridgeInstanceId,
      keyId: proof.payload.keyId,
      registeredAt,
    };
  }

  async createSessionChallenge(input: {
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    keyId: string;
  }): Promise<{ nonce: string; expiresAt: string } | null> {
    const installation = await this.installations.findOne({ ...input, status: 'active' });
    if (!installation) return null;

    const now = new Date();
    const nonce = secret();
    const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
    await this.sessionChallenges.insertOne({
      nonceHash: digestSecret(nonce),
      ...input,
      createdAt: now.toISOString(),
      expiresAt,
    });
    return { nonce, expiresAt };
  }

  async openSession(proof: AgentBridgeSessionProof): Promise<{
    sessionId: string;
    tenantId: string;
    installationId: string;
    bridgeInstanceId: string;
    keyId: string;
    accessToken: string;
    issuedAt: string;
    expiresAt: string;
    heartbeatIntervalSeconds: number;
  } | null> {
    const now = new Date();
    const { payload } = proof;
    const installation = await this.installations.findOne({
      tenantId: payload.tenantId,
      installationId: payload.installationId,
      bridgeInstanceId: payload.bridgeInstanceId,
      keyId: payload.keyId,
      status: 'active',
    });
    if (
      !installation ||
      payload.version !== 'kab.session-proof.v1' ||
      !validTimestamp(payload.issuedAt, now.getTime()) ||
      !verifyProof(payload as unknown as Record<string, unknown>, proof.signature, installation.publicKeyPem)
    ) {
      return null;
    }

    const challenge = await this.sessionChallenges.findOneAndUpdate(
      {
        nonceHash: digestSecret(payload.nonce),
        tenantId: payload.tenantId,
        installationId: payload.installationId,
        bridgeInstanceId: payload.bridgeInstanceId,
        keyId: payload.keyId,
        usedAt: { $exists: false },
        expiresAt: { $gt: now.toISOString() },
      },
      { $set: { usedAt: now.toISOString() } },
      { returnDocument: 'before', includeResultMetadata: false },
    );
    if (!challenge) return null;

    const sessionId = randomUUID();
    const accessToken = secret();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
    await this.sessions.insertOne({
      sessionId,
      tokenHash: digestSecret(accessToken),
      tenantId: payload.tenantId,
      installationId: payload.installationId,
      bridgeInstanceId: payload.bridgeInstanceId,
      keyId: payload.keyId,
      issuedAt,
      expiresAt,
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
    });

    return {
      sessionId,
      tenantId: payload.tenantId,
      installationId: payload.installationId,
      bridgeInstanceId: payload.bridgeInstanceId,
      keyId: payload.keyId,
      accessToken,
      issuedAt,
      expiresAt,
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
    };
  }

  async resolveRuntimeSession(accessToken: string): Promise<AgentBridgeRuntimeSession | null> {
    const now = new Date().toISOString();
    const session = await this.sessions.findOne({
      tokenHash: digestSecret(accessToken),
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    });
    if (!session) return null;
    return {
      sessionId: session.sessionId,
      tenantId: session.tenantId,
      installationId: session.installationId,
      bridgeInstanceId: session.bridgeInstanceId,
      keyId: session.keyId,
      expiresAt: session.expiresAt,
      heartbeatIntervalSeconds: session.heartbeatIntervalSeconds,
    };
  }

  async recordHeartbeat(
    session: AgentBridgeRuntimeSession,
    heartbeat: AgentBridgeHeartbeat,
  ): Promise<{ receivedAt: string; nextHeartbeatInSeconds: number } | null> {
    const now = new Date();
    if (
      heartbeat.sessionId !== session.sessionId ||
      heartbeat.tenantId !== session.tenantId ||
      heartbeat.installationId !== session.installationId ||
      heartbeat.bridgeInstanceId !== session.bridgeInstanceId ||
      !validTimestamp(heartbeat.sentAt, now.getTime())
    ) {
      return null;
    }

    const capabilities = normalizedCapabilities(heartbeat.capabilities);
    if (!sameStringArray(capabilities, heartbeat.capabilities)) return null;

    const result = await this.installations.updateOne(
      {
        tenantId: session.tenantId,
        installationId: session.installationId,
        bridgeInstanceId: session.bridgeInstanceId,
        keyId: session.keyId,
        status: 'active',
      },
      {
        $set: {
          runtimeVersion: heartbeat.runtimeVersion,
          capabilities,
          lastHeartbeat: {
            receivedAt: now.toISOString(),
            sentAt: heartbeat.sentAt,
            readiness: heartbeat.readiness,
            runtimeVersion: heartbeat.runtimeVersion,
            capabilities,
          },
        },
      },
    );
    if (result.matchedCount !== 1) return null;
    return {
      receivedAt: now.toISOString(),
      nextHeartbeatInSeconds: session.heartbeatIntervalSeconds,
    };
  }

  async recordRuntimeSnapshot(
    session: AgentBridgeRuntimeSession,
    snapshot: AgentBridgeRuntimeSnapshot,
  ): Promise<{ snapshotId: string; receivedAt: string } | null> {
    const now = new Date();
    if (!validTimestamp(snapshot.generatedAt, now.getTime(), 15 * 60 * 1000)) return null;

    const installation = await this.installations.findOne({
      tenantId: session.tenantId,
      installationId: session.installationId,
      bridgeInstanceId: session.bridgeInstanceId,
      keyId: session.keyId,
      status: 'active',
    });
    if (!installation) return null;

    const receivedAt = now.toISOString();
    await this.snapshots.updateOne(
      { tenantId: session.tenantId, installationId: session.installationId },
      {
        $set: {
          tenantId: session.tenantId,
          installationId: session.installationId,
          bridgeInstanceId: session.bridgeInstanceId,
          snapshotId: snapshot.snapshotId,
          generatedAt: snapshot.generatedAt,
          receivedAt,
          snapshot: structuredClone(snapshot),
        },
      },
      { upsert: true },
    );
    return { snapshotId: snapshot.snapshotId, receivedAt };
  }

  async summarizeTenant(tenantId: string): Promise<AgentBridgeRuntimeObservability> {
    const installations = await this.installations
      .find({ tenantId, status: 'active' })
      .sort({ registeredAt: 1 })
      .toArray();
    const snapshots = await this.snapshots.find({ tenantId }).toArray();
    const snapshotByInstallation = new Map(
      snapshots.map((snapshot) => [snapshot.installationId, snapshot]),
    );
    const now = Date.now();

    const rows = installations.map((installation) => {
      const latestSnapshot = snapshotByInstallation.get(installation.installationId);
      const heartbeatAt = installation.lastHeartbeat?.receivedAt ?? null;
      const heartbeatMs = heartbeatAt ? Date.parse(heartbeatAt) : Number.NaN;
      const connectivity = !heartbeatAt
        ? ('never_seen' as const)
        : Number.isFinite(heartbeatMs) && now - heartbeatMs <= CONNECTIVITY_STALE_AFTER_MS
          ? ('connected' as const)
          : ('stale' as const);

      const connectorCounts = { total: 0, healthy: 0, degraded: 0, unhealthy: 0 };
      const toolCounts = { total: 0, available: 0, degraded: 0, blocked: 0 };
      if (latestSnapshot) {
        connectorCounts.total = latestSnapshot.snapshot.health.length;
        for (const health of latestSnapshot.snapshot.health) {
          connectorCounts[health.status] += 1;
          for (const tool of health.tools) {
            toolCounts.total += 1;
            toolCounts[tool.availability] += 1;
          }
        }
      }

      return {
        installationId: installation.installationId,
        bridgeInstanceId: installation.bridgeInstanceId,
        deploymentMode: installation.deploymentMode,
        runtimeVersion: installation.lastHeartbeat?.runtimeVersion ?? installation.runtimeVersion,
        readiness: installation.lastHeartbeat?.readiness ?? ('unknown' as const),
        connectivity,
        lastHeartbeatAt: heartbeatAt,
        lastSnapshotAt: latestSnapshot?.receivedAt ?? null,
        capabilities: installation.lastHeartbeat?.capabilities ?? installation.capabilities,
        connectors: connectorCounts,
        tools: toolCounts,
      };
    });

    return {
      totalInstallations: rows.length,
      connectedInstallations: rows.filter((row) => row.connectivity === 'connected').length,
      degradedInstallations: rows.filter(
        (row) => row.connectivity === 'connected' && row.readiness === 'degraded',
      ).length,
      offlineInstallations: rows.filter((row) => row.connectivity !== 'connected').length,
      installations: rows,
    };
  }
}
