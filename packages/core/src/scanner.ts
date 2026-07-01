import { z } from 'zod';
import type { Finding } from './finding.js';

/**
 * Everything a scanner needs to do its work (spec §6). Scanners are pure
 * producers of `Finding[]` — they never touch the database themselves.
 */
export const ScanContextSchema = z.object({
  scanId: z.string().min(1),
  target: z.object({
    kind: z.enum(['url', 'repo']),
    value: z.string().min(1),
  }),
  options: z.record(z.string(), z.unknown()).optional(),
});
export type ScanContext = z.infer<typeof ScanContextSchema>;

/** The single signature every scanner implements. */
export type Scanner = (ctx: ScanContext) => Promise<Finding[]>;
