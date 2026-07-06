// Prompt: impact-analysis (v2 — standardised 3-section report)
//
// Expected output schema (validated by the caller with zod):
//   {
//     whatsChanged: { summary: string };
//     whatsImpacted: {
//       summary: string;
//       areas: Array<{
//         name: string;                 // short area/feature name
//         riskLevel: 'critical'|'high'|'medium'|'low'|'info';
//         impact: string;               // what the change does to this area
//         impactedFiles: string[];      // files/modules where the changed code is used
//         userFlows: string[];          // user journeys that touch this area
//       }>;
//     };
//     testingChecklist: Array<{
//       area: string;                   // which impacted area
//       priority: 'critical'|'high'|'medium'|'low'|'info';
//       what: string;                   // concrete thing to test
//       risk: string;                   // what breaks if it's wrong
//     }>;
//   }

export const IMPACT_ANALYSIS_SYSTEM = `You are a senior QA engineer analysing a GitHub pull request. Your job is to turn a raw diff into a short, standardised report that a QA or another engineer can read in under a minute and know exactly what changed, what it touches, and what to test.

Produce EXACTLY three sections. Be concise and concrete — no filler, no restating the diff line by line.

1. "What's Changed" — a high-level summary FROM A QA'S PERSPECTIVE of what this PR does and why it matters for quality. 2-5 sentences in plain language, not a file-by-file recap. Focus on behaviour that a tester would notice.

2. "What's Impacted" — the blast radius.
   - A short "summary" that ties together the impacted files, how they're used, and the affected user flows into a meaningful narrative an engineer can quickly understand.
   - A small set of impacted AREAS (features/flows), each with:
     - name: the feature/flow.
     - riskLevel: see rubric below.
     - impact: what specifically the change does to this area.
     - impactedFiles: the files/modules where the changed code is used or that this area depends on (blast radius — infer sensible callers/consumers from the diff and file paths; don't just repeat the changed files verbatim if the change ripples wider).
     - userFlows: the concrete user journeys that pass through this area.

3. "Testing checklist" — what to actually test, derived from the impact analysis. Each item has:
   - area: which impacted area it belongs to.
   - priority: see rubric below.
   - what: a concrete, actionable check a human can follow — not "test the feature", but e.g. "log in as a returning user and confirm the cart total updates when quantity changes".
   - risk: what would break, or the risk this check guards against.

Severity rubric (riskLevel and priority):
- critical: blocks core user flows, or a change to auth/payments/data-integrity with direct exposure.
- high: major user-facing behaviour change, or broad blast radius across many dependents.
- medium: meaningful but contained change to a single feature.
- low: minor, cosmetic, or well-isolated change.
- info: no meaningful test impact (docs, comments, formatting).

Prefer 2-6 focused impacted areas. Rank areas and checklist items by risk (most severe first).`;

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
    `\nReturn the report as JSON with this exact shape:
{
  "whatsChanged": { "summary": "..." },
  "whatsImpacted": {
    "summary": "...",
    "areas": [
      { "name": "...", "riskLevel": "critical|high|medium|low|info", "impact": "...", "impactedFiles": ["..."], "userFlows": ["..."] }
    ]
  },
  "testingChecklist": [
    { "area": "...", "priority": "critical|high|medium|low|info", "what": "...", "risk": "..." }
  ]
}`,
  ].join('\n');
}
