import { z } from 'zod';
import { PillarSchema } from './pillar.js';
import { SeveritySchema } from './severity.js';

const countField = () => z.number().int().nonnegative();

/** Count of findings per severity (all keys always present) — Record<Severity, number>. */
export const SeverityCountsSchema = z.object({
  critical: countField(),
  high: countField(),
  medium: countField(),
  low: countField(),
  info: countField(),
});
export type SeverityCounts = z.infer<typeof SeverityCountsSchema>;

export const PillarScoreSchema = z.object({
  pillar: PillarSchema,
  /** 0–100. */
  score: z.number().min(0).max(100),
  findingCounts: SeverityCountsSchema,
});
export type PillarScore = z.infer<typeof PillarScoreSchema>;

/**
 * A link between findings that relate across pillars (or to a PR area). This is
 * the differentiator: no single-purpose tool produces these.
 */
export const CorrelationSchema = z.object({
  id: z.string().min(1),
  /** Findings that relate to each other across pillars or to a PR area. */
  findingIds: z.array(z.string().min(1)),
  pillars: z.array(PillarSchema),
  /** Why these are linked, in plain language. */
  rationale: z.string(),
  /** Max severity of linked findings, bumped one level if 3+ findings link. */
  severity: SeveritySchema,
});
export type Correlation = z.infer<typeof CorrelationSchema>;

export const ScanScoreSchema = z.object({
  scanId: z.string().min(1),
  /** 0–100, weighted aggregate of pillar scores. */
  overall: z.number().min(0).max(100),
  pillars: z.array(PillarScoreSchema),
  correlations: z.array(CorrelationSchema),
  /** ISO 8601 timestamp. */
  computedAt: z.string().datetime({ offset: true }),
});
export type ScanScore = z.infer<typeof ScanScoreSchema>;
