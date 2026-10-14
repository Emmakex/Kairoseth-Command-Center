import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildWorkspaceSession } from '@kcc/auth';
import type { AuthProvider, SessionContext } from '@kcc/auth';
import type { Membership, User, Workspace } from '@kcc/domain';

export type StandaloneLocalAuthOptions = {
  email: string;
  password: string;
  secret: string;
  displayName: string;
  locale: 'es' | 'en';
  timezone: string;
  userId: string;
  workspaceId: string;
  workspaceName: string;
  sessionTtlSeconds: number;
};

type TokenPayload = {
  v: 1;
  sub: string;
  ws: string;
  iat: number;
  exp: number;
};

export type LocalLoginResult = {
  accessToken: string;
  expiresAt: string;
  session: SessionContext;
};

export interface LocalLoginProvider extends AuthProvider {
  authenticate(email: string, password: string): Promise<LocalLoginResult | null>;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
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
    candidate.v !== 1 ||
    typeof candidate.sub !== 'string' ||
    typeof candidate.ws !== 'string' ||
    typeof candidate.iat !== 'number' ||
    typeof candidate.exp !== 'number'
  ) {
    return null;
  }

  return candidate as TokenPayload;
}

export class StandaloneLocalAuthProvider implements LocalLoginProvider {
  readonly name = 'standalone-local';
  private readonly session: SessionContext;

  constructor(private readonly options: StandaloneLocalAuthOptions) {
    const now = new Date().toISOString();
    const user: User = {
      id: options.userId,
      email: options.email,
      displayName: options.displayName,
      locale: options.locale,
      timezone: options.timezone,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const workspace: Workspace = {
      id: options.workspaceId,
      name: options.workspaceName,
      slug: 'local',
      type: 'organization',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const membership: Membership = {
      id: `membership:${options.userId}:${options.workspaceId}`,
      userId: options.userId,
      workspaceId: options.workspaceId,
      role: 'owner',
      capabilities: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const session = buildWorkspaceSession({
      user,
      workspace,
      membership,
      productEntitlements: ['command-center'],
    });
    if (!session) throw new Error('Invalid standalone local auth bootstrap configuration');
    this.session = session;
  }

  async authenticate(email: string, password: string): Promise<LocalLoginResult | null> {
    const validEmail = safeEqual(email.trim().toLowerCase(), this.options.email.trim().toLowerCase());
    const validPassword = safeEqual(password, this.options.password);
    if (!validEmail || !validPassword) return null;

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + this.options.sessionTtlSeconds;
    const payload: TokenPayload = {
      v: 1,
      sub: this.session.user.id,
      ws: this.session.activeWorkspaceId ?? '',
      iat: issuedAt,
      exp: expiresAt,
    };
    const encoded = encodePayload(payload);
    const signature = this.sign(encoded);

    return {
      accessToken: `${encoded}.${signature}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      session: this.session,
    };
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
      payload.sub !== this.session.user.id ||
      payload.ws !== this.session.activeWorkspaceId ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.iat > now + 60 ||
      payload.exp <= now
    ) {
      return null;
    }

    return this.session;
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.options.secret).update(encodedPayload).digest('base64url');
  }
}

export function registerStandaloneAuthRoutes(
  app: FastifyInstance,
  provider: LocalLoginProvider,
): void {
  app.post('/v1/auth/local/login', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const body = (request.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password || email.length > 320 || password.length > 1024) {
      return reply.code(400).send({ error: 'invalid_credentials_payload' });
    }

    const result = await provider.authenticate(email, password);
    if (!result) return reply.code(401).send({ error: 'invalid_credentials' });

    return {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      user: result.session.user,
      activeWorkspaceId: result.session.activeWorkspaceId ?? null,
      role: result.session.role ?? null,
    };
  });
}
