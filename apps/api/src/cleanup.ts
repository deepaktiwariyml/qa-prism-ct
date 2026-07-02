import { getPrisma } from '@qa-prism/db';

/** Scans (and their findings/score, via cascade) are kept for one hour. */
const RETENTION_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

interface Logger {
  info: (msg: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/** Periodically delete scans older than the retention window. */
export function startScanCleanup(logger?: Logger): NodeJS.Timeout {
  const sweep = async (): Promise<void> => {
    try {
      const cutoff = new Date(Date.now() - RETENTION_MS);
      const { count } = await getPrisma().scan.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (count > 0) logger?.info(`scan cleanup: removed ${count} scan(s) older than 1h`);
    } catch (err) {
      logger?.error(err, 'scan cleanup failed');
    }
  };
  void sweep();
  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
