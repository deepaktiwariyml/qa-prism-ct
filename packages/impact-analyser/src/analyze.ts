import { z } from 'zod';
import { SeveritySchema } from '@qa-prism/core';
import {
  buildImpactAnalysisPrompt,
  createLlmClient,
  IMPACT_ANALYSIS_SYSTEM,
  type LlmClient,
  type TokenUsage,
} from '@qa-prism/llm';
import { fetchPr, type ChangedFile, type FetchImpl } from './github.js';
import { parseGitHubPrUrl } from './parse-url.js';
import { extractTickets, mergeTickets, type TicketRef } from './tickets.js';

/**
 * Max total patch characters sent to the LLM (bounded context — spec §7).
 * claude-sonnet-4-6 has a very large context window, so this is generous;
 * only genuinely huge PRs get truncated. Overridable via IMPACT_MAX_PATCH_CHARS.
 */
const MAX_PATCH_CHARS = Number(process.env.IMPACT_MAX_PATCH_CHARS) || 200_000;

// LLM output shape — the standardised three-section report, minus
// relatedFindingIds (which the API cross-links in afterwards).
const AnalysisSchema = z.object({
  whatsChanged: z.object({
    summary: z.string(),
  }),
  whatsImpacted: z.object({
    summary: z.string(),
    areas: z.array(
      z.object({
        name: z.string(),
        riskLevel: SeveritySchema,
        impact: z.string(),
        impactedFiles: z.array(z.string()),
        userFlows: z.array(z.string()),
      }),
    ),
  }),
  testingChecklist: z.array(
    z.object({
      area: z.string(),
      priority: SeveritySchema,
      what: z.string(),
      risk: z.string(),
    }),
  ),
});

export interface AnalyzeInput {
  prUrl: string;
  githubToken?: string;
}

export interface AnalyzeDeps {
  llm?: LlmClient;
  fetchImpl?: FetchImpl;
}

/** The LLM analysis before the API cross-links related findings. */
export type RawImpactAnalysis = z.infer<typeof AnalysisSchema>;

export interface ImpactResult {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  tickets: TicketRef[];
  analysis: RawImpactAnalysis;
  changedFiles: string[];
  limitations: string[];
  usage?: TokenUsage;
}

/** Bound the diff we send: keep whole patches until the budget is spent. */
function boundPatches(files: ChangedFile[]): { files: ChangedFile[]; truncated: boolean } {
  let budget = MAX_PATCH_CHARS;
  let truncated = false;
  const out: ChangedFile[] = [];
  for (const f of files) {
    if (!f.patch) {
      out.push(f);
      continue;
    }
    if (budget <= 0) {
      out.push({ ...f, patch: undefined });
      truncated = true;
      continue;
    }
    if (f.patch.length > budget) {
      out.push({ ...f, patch: `${f.patch.slice(0, budget)}\n… (patch truncated)` });
      truncated = true;
      budget = 0;
    } else {
      out.push(f);
      budget -= f.patch.length;
    }
  }
  return { files: out, truncated };
}

/**
 * Analyse a GitHub PR into a risk-ranked list of manual-test areas (spec §6.5).
 * Fetches the diff, bounds it, and asks Claude for a schema-validated report.
 *
 * Dependency analysis is changed-files-first: we don't clone the repo, so we
 * don't compute a reverse-dependency graph — noted in `limitations`.
 */
export async function analyzePr(input: AnalyzeInput, deps: AnalyzeDeps = {}): Promise<ImpactResult> {
  const ref = parseGitHubPrUrl(input.prUrl);
  if (!ref) {
    throw new Error(`Not a GitHub pull request URL: ${input.prUrl}`);
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const llm = deps.llm ?? createLlmClient();

  const pr = await fetchPr(ref, input.githubToken, fetchImpl);
  const { files, truncated } = boundPatches(pr.files);

  const limitations: string[] = [
    'Dependency analysis is changed-files-first — a full reverse-dependency graph requires cloning the repo.',
  ];
  if (truncated) limitations.push('The diff was large and was truncated to fit the token budget.');

  const prompt = buildImpactAnalysisPrompt({
    title: pr.title,
    body: pr.body,
    changedFiles: files,
    dependents: [],
    truncatedNote: truncated ? 'Some diffs were truncated.' : undefined,
  });

  let usage: TokenUsage | undefined;
  const result = await llm.completeJSON({
    system: IMPACT_ANALYSIS_SYSTEM,
    prompt,
    schema: AnalysisSchema,
    operation: 'impact.analyze',
    onUsage: (u) => (usage = u),
  });

  // Ticket keys can live in the title, description, branch name, or commit
  // messages; linked GitHub issues come from the "Development" panel.
  const ticketText = [pr.title, pr.body, pr.branch, ...pr.commitMessages].join('\n');
  const tickets = mergeTickets(
    extractTickets(ticketText, { jiraBaseUrl: process.env.JIRA_BASE_URL }),
    pr.linkedIssues.map((li) => ({ key: li.key, url: li.url, source: 'other' as const })),
  );

  return {
    owner: ref.owner,
    repo: ref.repo,
    prNumber: ref.number,
    title: pr.title,
    tickets,
    analysis: result,
    changedFiles: pr.files.map((f) => f.filename),
    limitations,
    usage,
  };
}
