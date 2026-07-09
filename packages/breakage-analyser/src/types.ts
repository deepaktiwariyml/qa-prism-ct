import { z } from 'zod';

// ---------------------------------------------------------------------------
// Inputs — assembled by the client (documents are already parsed to text in
// the browser) and validated at the API edge before reaching analyzeBreakage.
// ---------------------------------------------------------------------------

/** A single Pull Request source. GitHub is fetched natively; other providers
 *  come in via a pasted raw diff. */
export const PrInputSchema = z.object({
  // 'github' = one PR (url is a PR link); 'compare' = a release/branch range
  // (url is a GitHub compare link); 'paste' = a raw diff from any provider.
  provider: z.enum(['github', 'paste', 'compare']),
  url: z.string().max(500).optional(), // github PR link or compare link
  rawDiff: z.string().max(500_000).optional(), // paste
  repoContext: z.string().max(2_000).optional(), // optional note for pasted diffs
});
export type PrInput = z.infer<typeof PrInputSchema>;

/** A parsed document. `id` is a stable evidence anchor assigned by the client
 *  (e.g. "REQ1", "TC1"). `structured` carries pre-parsed rows for spreadsheet /
 *  JSON test-case exports so we don't re-extract them with the LLM. */
export const DocInputSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(300),
  text: z.string().max(400_000),
  structured: z.array(z.record(z.string(), z.unknown())).max(2_000).optional(),
});
export type DocInput = z.infer<typeof DocInputSchema>;

export const JiraSelectionSchema = z.object({
  keys: z.array(z.string().min(1).max(40)).max(50).optional(),
  epicKey: z.string().max(40).optional(),
  includeComments: z.boolean().optional(),
});
export type JiraSelection = z.infer<typeof JiraSelectionSchema>;

export const BreakageInputSchema = z
  .object({
    prs: z.array(PrInputSchema).max(20).optional(),
    githubToken: z.string().max(300).optional(),
    jira: JiraSelectionSchema.optional(),
    testCaseDocs: z.array(DocInputSchema).max(50).optional(),
    requirementDocs: z.array(DocInputSchema).max(50).optional(),
    // Free-text extra context the user types in (not tied to any one input).
    additionalContext: z.string().max(5_000).optional(),
  })
  .refine(
    (v) =>
      (v.prs?.length ?? 0) > 0 ||
      (v.testCaseDocs?.length ?? 0) > 0 ||
      (v.requirementDocs?.length ?? 0) > 0 ||
      (v.jira?.keys?.length ?? 0) > 0 ||
      Boolean(v.jira?.epicKey),
    { message: 'Provide at least one input (a PR, a document, or a Jira selection).' },
  );
export type BreakageInput = z.infer<typeof BreakageInputSchema>;

// ---------------------------------------------------------------------------
// Output — the 11-section, evidence-cited analysis (Stage B).
// ---------------------------------------------------------------------------

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/** A citation back to one of the inputs. `ref` is a PR id (PR1…), a Jira key,
 *  or a document id (REQ1…, TC1…). */
export const EvidenceRefSchema = z.object({
  kind: z.enum(['pr', 'jira', 'doc', 'testcase']),
  ref: z.string(),
  note: z.string().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

const withEvidence = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, evidence: z.array(EvidenceRefSchema) });

export const BreakageAnalysisSchema = z.object({
  // 1. AI Summary
  summary: z.string(),
  // 3 + 7(why) + 10(confidence): Risk score
  riskScore: z.object({
    level: RiskLevelSchema,
    confidence: z.number().min(0).max(100),
    rationale: z.string(),
  }),
  // 2. Predicted broken areas
  predictedBrokenAreas: z.array(withEvidence({ area: z.string(), severity: RiskLevelSchema, why: z.string() })),
  // 4. Impacted modules
  impactedModules: z.array(withEvidence({ name: z.string(), reason: z.string() })),
  // 5. Impacted APIs
  impactedApis: z.array(withEvidence({ endpoint: z.string(), change: z.string() })),
  // 6. Impacted test cases
  impactedTestCases: z.array(
    withEvidence({
      tcId: z.string(),
      title: z.string(),
      verdict: z.enum(['impacted', 'partially-impacted', 'obsolete']),
      confidence: z.number().min(0).max(100),
      reason: z.string(),
    }),
  ),
  // 7. Missing coverage
  missingCoverage: z.array(withEvidence({ area: z.string(), gap: z.string() })),
  // 8. Recommended new test cases
  recommendedTestCases: z.array(
    withEvidence({
      title: z.string(),
      type: z.enum(['positive', 'negative', 'edge']),
      steps: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
  // 9. Suggested regression suite
  suggestedRegressionSuite: z.object({
    smoke: z.array(z.string()),
    regression: z.array(z.string()),
    rationale: z.string(),
  }),
});
export type BreakageAnalysis = z.infer<typeof BreakageAnalysisSchema>;

// ---------------------------------------------------------------------------
// Result envelope returned to the client: the analysis plus a manifest that
// lets the UI resolve every evidence ref to a human label / link, plus usage.
// ---------------------------------------------------------------------------

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
  operation: string;
}

export interface BreakageManifest {
  prs: Array<{ id: string; label: string; url?: string }>;
  jira: Array<{ key: string; summary: string; url?: string }>;
  requirementDocs: Array<{ id: string; name: string }>;
  testCaseDocs: Array<{ id: string; name: string; count: number }>;
}

export interface BreakageResult {
  analysis: BreakageAnalysis;
  manifest: BreakageManifest;
  limitations: string[];
  usage?: UsageTotals;
}
