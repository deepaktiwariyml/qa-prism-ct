import { z } from 'zod';
import { SeveritySchema } from './severity.js';

/**
 * One area affected by a PR, under the "What's Impacted" section (spec §6.5).
 * `relatedFindingIds` is filled in by the API by cross-linking to existing
 * scanner findings — the LLM does not produce it.
 */
export const ImpactAreaSchema = z.object({
  name: z.string(),
  riskLevel: SeveritySchema,
  impact: z.string(), // what the change does to this area
  impactedFiles: z.array(z.string()), // files/modules where the changed code is used
  userFlows: z.array(z.string()), // user journeys that touch this area
  relatedFindingIds: z.array(z.string()).default([]),
});
export type ImpactArea = z.infer<typeof ImpactAreaSchema>;

/** One row of the "Testing checklist" section. */
export const TestingChecklistItemSchema = z.object({
  area: z.string(), // which impacted area this test belongs to
  priority: SeveritySchema,
  what: z.string(), // concrete, actionable thing to test
  risk: z.string(), // what breaks / the risk this test guards against
});
export type TestingChecklistItem = z.infer<typeof TestingChecklistItemSchema>;

/**
 * The standardised, three-section impact analysis:
 *   1. What's Changed   — high-level QA-perspective summary of the PR.
 *   2. What's Impacted  — blast radius: impacted areas, files, and user flows.
 *   3. Testing checklist — what to test, ranked by risk.
 */
export const ImpactAnalysisSchema = z.object({
  whatsChanged: z.object({
    summary: z.string(),
  }),
  whatsImpacted: z.object({
    summary: z.string(),
    areas: z.array(ImpactAreaSchema),
  }),
  testingChecklist: z.array(TestingChecklistItemSchema),
});
export type ImpactAnalysis = z.infer<typeof ImpactAnalysisSchema>;

export const ImpactReportSchema = z.object({
  id: z.string().min(1),
  targetId: z.string().min(1),
  prUrl: z.string(),
  prNumber: z.number().int(),
  status: z.string(),
  analysis: ImpactAnalysisSchema,
  changedFiles: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type ImpactReport = z.infer<typeof ImpactReportSchema>;
