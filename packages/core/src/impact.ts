import { z } from 'zod';
import { SeveritySchema } from './severity.js';

/**
 * One risk-ranked area a manual tester should check for a PR (spec §6.5).
 * `relatedFindingIds` is filled in by the API by cross-linking to existing
 * scanner findings — the LLM does not produce it.
 */
export const ImpactAreaSchema = z.object({
  name: z.string(),
  riskLevel: SeveritySchema,
  reason: z.string(),
  suggestedTests: z.array(z.string()),
  relatedFiles: z.array(z.string()),
  relatedFindingIds: z.array(z.string()).default([]),
});
export type ImpactArea = z.infer<typeof ImpactAreaSchema>;

export const ImpactReportSchema = z.object({
  id: z.string().min(1),
  targetId: z.string().min(1),
  prUrl: z.string(),
  prNumber: z.number().int(),
  status: z.string(),
  areas: z.array(ImpactAreaSchema),
  createdAt: z.string(),
});
export type ImpactReport = z.infer<typeof ImpactReportSchema>;
