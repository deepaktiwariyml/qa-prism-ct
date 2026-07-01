// @qa-prism/db — Prisma schema, generated client, and a lazy singleton.
// Run `pnpm --filter @qa-prism/db db:generate` before typechecking/building if
// the client has not been generated yet.

export * from '@prisma/client';
import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

/**
 * Lazily-instantiated shared Prisma client. Instantiating is deferred until
 * first use so importing this package never opens a DB connection on its own.
 */
export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

/** Disconnect the shared client (call on graceful shutdown). */
export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
