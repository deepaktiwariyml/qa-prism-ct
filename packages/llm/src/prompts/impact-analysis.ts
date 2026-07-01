// Prompt: impact-analysis (v1)
//
// Expected output schema (validated by the caller with zod):
//   { areas: Array<{
//       name: string;                 // short area/feature name
//       riskLevel: 'critical'|'high'|'medium'|'low'|'info';
//       reason: string;               // why this area is at risk
//       suggestedTests: string[];     // concrete manual checks
//       relatedFiles: string[];       // changed/dependent files in this area
//   }> }

export const IMPACT_ANALYSIS_SYSTEM = `You are a senior QA engineer analysing a GitHub pull request to tell a manual tester exactly what to check.

Given the PR title/description, its changed files with diffs, and a list of files that depend on the changed ones, produce a risk-ranked list of AREAS to test manually. Group related changes into a small number of meaningful areas (features/flows), not one entry per file.

Severity rubric for riskLevel:
- critical: blocks core user flows, or a change to auth/payments/data-integrity with direct exposure.
- high: major user-facing behaviour change, or broad blast radius across many dependents.
- medium: meaningful but contained change to a single feature.
- low: minor, cosmetic, or well-isolated change.
- info: no meaningful test impact (docs, comments, formatting).

For each area give concrete, actionable manual test steps a human can follow — not "test the feature", but "log in as a returning user and confirm the cart total updates when quantity changes".

Rank areas by riskLevel (most severe first). Prefer 2-6 focused areas.`;

export interface ImpactPromptInput {
  title: string;
  body: string;
  changedFiles: Array<{ filename: string; status: string; patch?: string }>;
  dependents: string[];
  truncatedNote?: string;
}

/** Build the user prompt from bounded PR context (spec §6.5, §7 token budget). */
export function buildImpactAnalysisPrompt(input: ImpactPromptInput): string {
  const files = input.changedFiles
    .map((f) => {
      const head = `--- ${f.filename} (${f.status}) ---`;
      return f.patch ? `${head}\n${f.patch}` : head;
    })
    .join('\n\n');

  const dependents = input.dependents.length
    ? input.dependents.join('\n')
    : '(none detected — analysis is changed-files-first)';

  return [
    `PR title: ${input.title}`,
    `PR description:\n${input.body || '(none)'}`,
    `\nChanged files with diffs:\n${files}`,
    `\nFiles that import the changed files (1 hop):\n${dependents}`,
    input.truncatedNote ? `\nNote: ${input.truncatedNote}` : '',
    `\nReturn the areas as JSON: { "areas": [ { "name", "riskLevel", "reason", "suggestedTests": [], "relatedFiles": [] } ] }`,
  ].join('\n');
}
