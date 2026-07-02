import { getPrisma } from '@qa-prism/db';

/** Scans (and their findings/score, via cascade) retention, from env. */
export function retentionMinutes(): number {
  const n = Number(process.env.SCAN_RETENTION_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
const SWEEP_INTERVAL_MS = 60 * 1000;

interface Logger {
  info: (msg: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/** Periodically delete scans older than the retention window. */
export function startScanCleanup(logger?: Logger): NodeJS.Timeout {
  const sweep = async (): Promise<void> => {
    try {
      const mins = retentionMinutes();
      const cutoff = new Date(Date.now() - mins * 60 * 1000);
      const { count } = await getPrisma().scan.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (count > 0) logger?.info(`scan cleanup: removed ${count} scan(s) older than ${mins}m`);
    } catch (err) {
      logger?.error(err, 'scan cleanup failed');
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
