// @qa-prism/api — Fastify gateway + BullMQ scan orchestration (spec §2, §3).
import { disconnectPrisma } from '@qa-prism/db';
import { loadEnv } from './env.js';
import { createRedis, createScanQueue } from './queue.js';
import { createScanWorker } from './worker.js';
import { buildServer } from './server.js';
import { startScanCleanup, retentionMinutes } from './cleanup.js';

const env = loadEnv();

// Queue and worker each get their own Redis connection (BullMQ requirement).
const queueConnection = createRedis(env.REDIS_URL);
const workerConnection = createRedis(env.REDIS_URL);
const queue = createScanQueue(queueConnection);
const worker = createScanWorker(workerConnection);
const app = buildServer(queue);

worker.on('failed', (job, err) => {
  app.log.error({ jobId: job?.id, err }, 'scan job failed');
});

async function main(): Promise<void> {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`scan worker listening on queue "${queue.name}"`);
  startScanCleanup(app.log);
  app.log.info(`scan retention: scans older than ${retentionMinutes()}m are auto-deleted`);
}

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await worker.close();
  await queue.close();
  await queueConnection.quit();
  await workerConnection.quit();
  await app.close();
  await disconnectPrisma();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

main().catch((err) => {
  app.log.error(err, 'failed to start api');
  process.exit(1);
});
