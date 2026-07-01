import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

/** Name of the BullMQ queue carrying scan jobs. */
export const SCAN_QUEUE = 'scans';

export interface ScanJobData {
  scanId: string;
  target: { kind: 'url' | 'repo'; value: string };
}

/**
 * A Redis connection tuned for BullMQ (`maxRetriesPerRequest: null` is required
 * by BullMQ workers). Queue and worker should each get their own connection.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

export function createScanQueue(connection: Redis): Queue<ScanJobData> {
  return new Queue<ScanJobData>(SCAN_QUEUE, { connection });
}
