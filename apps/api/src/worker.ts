import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { SCAN_QUEUE, type ScanJobData } from './queue.js';
import { processScan } from './scan-processor.js';

/** BullMQ worker that runs scans off the queue (spec §2). */
export function createScanWorker(connection: Redis): Worker<ScanJobData> {
  return new Worker<ScanJobData>(
    SCAN_QUEUE,
    async (job) => {
      await processScan(job.data);
    },
    { connection, concurrency: 2 },
  );
}
