import { z } from 'zod';
import { PillarSchema } from './pillar.js';
import { SeveritySchema } from './severity.js';

/** Where a finding lives — file path, URL, route, or component (spec §4.1). */
export const LocationSchema = z.object({
  /** File path, URL, route, or component — wherever the finding lives. */
  path: z.string(),
  line: z.number().int().positive().optional(),
  /** DOM selector for a11y/perf findings. */
  selector: z.string().optional(),
  /** Logical component/module name when known. */
  component: z.string().optional(),
});
export type Location = z.infer<typeof LocationSchema>;

/**
 * The canonical finding. Every scanner and the impact analyser emit `Finding[]`
 * in exactly this shape — the keystone that enables cross-pillar correlation.
 *
 * `id`/`scanId` are non-empty strings rather than a specific id format: the DB
 * layer uses `cuid()` while some emitters use `uuid`, and both must validate.
 */
export const FindingSchema = z.object({
  id: z.string().min(1),
  scanId: z.string().min(1),
  pillar: PillarSchema,
  severity: SeveritySchema,
  /** Stable machine code, e.g. "a11y.image-alt". Namespaced by pillar. */
  code: z.string().min(1),
  /** Short human summary, intended to stay under ~80 chars. */
  title: z.string().min(1),
  /** What the finding is + why it matters. */
  description: z.string(),
  location: LocationSchema,
  /** Suggested fix in plain language. */
  remediation: z.string(),
  /** Tags enabling correlation, e.g. ["form", "checkout"]. */
  tags: z.array(z.string()),
  /** Raw tool output for traceability (never shown raw in the UI). */
  evidence: z.record(z.string(), z.unknown()).optional(),
  /** ISO 8601 timestamp. */
  createdAt: z.string().datetime({ offset: true }),
});
export type Finding = z.infer<typeof FindingSchema>;
