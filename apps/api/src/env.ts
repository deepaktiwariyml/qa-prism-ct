import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
});

export type Env = z.infer<typeof EnvSchema>;

export type ParseEnvResult =
  | { success: true; env: Env }
  | { success: false; problems: string[] };

/** Pure, testable env parse. */
export function parseEnv(source: Record<string, string | undefined>): ParseEnvResult {
  const parsed = EnvSchema.safeParse(source);
  if (parsed.success) return { success: true, env: parsed.data };
  const problems = parsed.error.issues.map(
    (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
  );
  return { success: false, problems };
}

/** Load env or fail fast with a clear message (spec §3, §9). */
export function loadEnv(): Env {
  const result = parseEnv(process.env);
  if (!result.success) {
    console.error('[api] Cannot start — environment is invalid:');
    for (const p of result.problems) console.error(`  - ${p}`);
    console.error('Copy .env.example to .env and fill in the required values.');
    process.exit(1);
  }
  return result.env;
}
