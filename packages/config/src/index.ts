import { z } from 'zod';

function optionalSecret(schema: z.ZodString) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const integrationSecretKey = optionalSecret(
  z.string().regex(/^[0-9a-fA-F]{64}$/, 'KCC_INTEGRATION_SECRET_KEY must be 64 hexadecimal characters'),
);

const apiSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  KCC_API_HOST: z.string().default('0.0.0.0'),
  KCC_API_PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/kairoseth_command_center'),
  KCC_AUTH_MODE: z.enum(['local', 'external', 'disabled']).default('local'),
  KCC_LOCAL_ADMIN_EMAIL: z.string().min(3).max(320).default('admin@kcc.local'),
  KCC_LOCAL_ADMIN_PASSWORD: optionalSecret(z.string().min(12).max(1024)),
  KCC_LOCAL_AUTH_SECRET: optionalSecret(z.string().min(32).max(4096)),
  KCC_LOCAL_ADMIN_DISPLAY_NAME: z.string().min(1).max(160).default('Local Owner'),
  KCC_LOCAL_LOCALE: z.enum(['es', 'en']).default('es'),
  KCC_LOCAL_TIMEZONE: z.string().min(1).max(120).default('Europe/Madrid'),
  KCC_LOCAL_USER_ID: z.string().min(1).max(160).default('local-owner'),
  KCC_LOCAL_WORKSPACE_ID: z.string().min(1).max(160).default('local-workspace'),
  KCC_LOCAL_WORKSPACE_NAME: z.string().min(1).max(160).default('Local Workspace'),
  KCC_LOCAL_SESSION_TTL_SECONDS: z.coerce.number().int().min(900).max(604800).default(43200),
  KCC_INTEGRATION_SECRET_KEY: integrationSecretKey,
  KCC_AGENT_BRIDGE_CONSUMER_BINDINGS_JSON: optionalSecret(z.string().min(2).max(32768)),
  KCC_GITHUB_API_BASE_URL: z.string().url().default('https://api.github.com'),
});

const workerSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  KCC_WORKER_POLL_MS: z.coerce.number().int().positive().default(30000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/kairoseth_command_center'),
  KCC_INTEGRATION_SECRET_KEY: integrationSecretKey,
  KCC_GITHUB_API_BASE_URL: z.string().url().default('https://api.github.com'),
});

export type ApiConfig = z.infer<typeof apiSchema>;
export type WorkerConfig = z.infer<typeof workerSchema>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return apiSchema.parse(env);
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return workerSchema.parse(env);
}
