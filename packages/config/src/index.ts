import { z } from 'zod';

const optionalBootstrapSecret = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.string().min(24).max(512).optional(),
);

const apiSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  KCC_API_HOST: z.string().default('0.0.0.0'),
  KCC_API_PORT: z.coerce.number().int().positive().default(4000),
  KCC_AUTH_MODE: z.enum(['local']).default('local'),
  KCC_BOOTSTRAP_SECRET: optionalBootstrapSecret,
  KCC_LOCAL_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(8760).default(720),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/kairoseth_command_center'),
});

const workerSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  KCC_WORKER_POLL_MS: z.coerce.number().int().positive().default(30000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/kairoseth_command_center'),
});

export type ApiConfig = z.infer<typeof apiSchema>;
export type WorkerConfig = z.infer<typeof workerSchema>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return apiSchema.parse(env);
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return workerSchema.parse(env);
}
