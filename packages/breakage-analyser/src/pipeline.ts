import { z } from 'zod';
import { createLlmClient, resolveSystemPrompt, type LlmClient, type TokenUsage } from '@qa-prism/llm';
import type { FetchImpl } from '@qa-prism/impact-analyser';
import {
  BreakageAnalysisSchema,
  BreakageInputSchema,
  type BreakageInput,
  type BreakageResult,
  type BreakageManifest,
  type DocInput,
  type UsageTotals,
} from './types.js';
import { resolvePrs, type ResolvedPr } from './prs.js';
import { resolveJira } from './jira.js';

const FAST_MODEL = () => process.env.ANTHROPIC_FAST_MODEL || 'claude-haiku-4-5';
/** Per-document text budget for extraction (chars). */
const DOC_CHARS = Number(process.env.BREAKAGE_MAX_DOC_CHARS) || 80_000;
/** Cap on normalized test cases fed to the synthesis step. */
const MAX_TEST_CASES = 400;

export interface AnalyzeDeps {
  llm?: LlmClient;
  fetchImpl?: FetchImpl;
}

// --- Stage A extraction schemas (internal) ---
//
// Fields the model may legitimately omit are `.optional()` (never `.default()`,
// which would split the zod input/output types and break completeJSON<T>
// inference). We coerce to fully-populated interfaces right after parsing so
// downstream code works with required shapes.

const ChangeFactsSchema = z.object({
  summary: z.string(),
  changedMethods: z.array(z.string()).optional(),
  impactedApis: z.array(z.string()).optional(),
  dbChanges: z.array(z.string()).optional(),
  validations: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  featureFlags: z.array(z.string()).optional(),
  downstreamHints: z.array(z.string()).optional(),
});

interface ChangeFacts {
  summary: string;
  changedMethods: string[];
  impactedApis: string[];
  dbChanges: string[];
  validations: string[];
  permissions: string[];
  featureFlags: string[];
  downstreamHints: string[];
  changedFiles: string[];
}

const RequirementFactsSchema = z.object({
  requirements: z.array(z.string()).optional(),
  flows: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
});

const ExtractedTestCasesSchema = z.object({
  testcases: z.array(
    z.object({
      title: z.string(),
      preconditions: z.string().optional(),
      steps: z.array(z.string()).optional(),
      expected: z.string().optional(),
      tags: z.array(z.string()).optional(),
      feature: z.string().optional(),
    }),
  ),
});

interface NormalizedCase {
  id: string; // TC1, TC2, … (unique across all test-case docs)
  docId: string;
  docName: string;
  title: string;
  preconditions: string;
  steps: string[];
  expected: string;
  tags: string[];
  feature: string;
}

// --- Usage aggregation ---

function makeUsageAccumulator() {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  return {
    add(u: TokenUsage | undefined) {
      if (!u) return;
      inputTokens += u.inputTokens;
      outputTokens += u.outputTokens;
      costUsd += u.costUsd;
    },
    setModel(m: string) {
      model = m;
    },
    totals(): UsageTotals {
      return { inputTokens, outputTokens, costUsd, model, operation: "breakage.analyze (all steps)" };
    },
  };
}

// --- Structured test-case row mapping (spreadsheet / JSON exports) ---

function pick(row: Record<string, unknown>, needles: string[]): string {
  for (const [k, v] of Object.entries(row)) {
    const key = k.toLowerCase();
    if (needles.some((n) => key.includes(n)) && v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function rowToCase(row: Record<string, unknown>): Omit<NormalizedCase, 'id' | 'docId' | 'docName'> | null {
  const title =
    pick(row, ['title', 'summary', 'name', 'test case', 'scenario', 'objective']) ||
    Object.values(row).map(String).find((s) => s.trim()) ||
    '';
  if (!title.trim()) return null;
  const stepsRaw = pick(row, ['step', 'action', 'procedure']);
  return {
    title,
    preconditions: pick(row, ['precondition', 'pre-condition', 'setup']),
    steps: stepsRaw ? stepsRaw.split(/\r?\n|(?<=\.)\s+(?=\d+[.)])/).map((s) => s.trim()).filter(Boolean) : [],
    expected: pick(row, ['expected', 'result', 'outcome']),
    tags: (pick(row, ['tag', 'label', 'priority', 'suite']) || '').split(/[,;|]/).map((t) => t.trim()).filter(Boolean),
    feature: pick(row, ['feature', 'module', 'component', 'area', 'epic']),
  };
}

// --- Stage A: per-input extraction ---

async function extractChange(llm: LlmClient, pr: ResolvedPr, onUsage: (u?: TokenUsage) => void): Promise<ChangeFacts> {
  let u: TokenUsage | undefined;
  const f = await llm.completeJSON({
    model: FAST_MODEL(),
    operation: 'breakage.extract-change',
    onUsage: (x) => (u = x),
    system: resolveSystemPrompt('breakage.extract-change'),
    prompt: `PR: ${pr.label}${pr.title ? `\nTitle: ${pr.title}` : ''}${pr.body ? `\nDescription:\n${pr.body.slice(0, 4_000)}` : ''}\n\nUnified diff:\n${pr.diffText}\n\nReturn JSON: {"summary":"...","changedMethods":[...],"impactedApis":[...],"dbChanges":[...],"validations":[...],"permissions":[...],"featureFlags":[...],"downstreamHints":[...]}.`,
    schema: ChangeFactsSchema,
  });
  onUsage(u);
  return {
    summary: f.summary,
    changedMethods: f.changedMethods ?? [],
    impactedApis: f.impactedApis ?? [],
    dbChanges: f.dbChanges ?? [],
    validations: f.validations ?? [],
    permissions: f.permissions ?? [],
    featureFlags: f.featureFlags ?? [],
    downstreamHints: f.downstreamHints ?? [],
    changedFiles: pr.changedFiles,
  };
}

interface RequirementDocFacts {
  id: string;
  name: string;
  requirements: string[];
  flows: string[];
  acceptanceCriteria: string[];
}

async function extractRequirements(llm: LlmClient, doc: DocInput, onUsage: (u?: TokenUsage) => void): Promise<RequirementDocFacts> {
  let u: TokenUsage | undefined;
  const f = await llm.completeJSON({
    model: FAST_MODEL(),
    operation: 'breakage.extract-requirements',
    onUsage: (x) => (u = x),
    system: resolveSystemPrompt('breakage.extract-requirements'),
    prompt: `Document "${doc.name}":\n${doc.text.slice(0, DOC_CHARS)}\n\nReturn JSON: {"requirements":[...],"flows":[...],"acceptanceCriteria":[...]}.`,
    schema: RequirementFactsSchema,
  });
  onUsage(u);
  return {
    id: doc.id,
    name: doc.name,
    requirements: f.requirements ?? [],
    flows: f.flows ?? [],
    acceptanceCriteria: f.acceptanceCriteria ?? [],
  };
}

type UnindexedCase = Omit<NormalizedCase, 'id'>;

async function normalizeTestDoc(llm: LlmClient, doc: DocInput, onUsage: (u?: TokenUsage) => void): Promise<UnindexedCase[]> {
  const base = { docId: doc.id, docName: doc.name };
  // Structured rows (spreadsheet / JSON exports) map directly — no LLM call.
  if (doc.structured && doc.structured.length) {
    return doc.structured
      .map((r) => rowToCase(r as Record<string, unknown>))
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .map((c) => ({ ...base, ...c }));
  }
  // Prose / loosely-tabular text — extract with the LLM.
  let u: TokenUsage | undefined;
  const { testcases } = await llm.completeJSON({
    model: FAST_MODEL(),
    operation: 'breakage.extract-testcases',
    onUsage: (x) => (u = x),
    system: resolveSystemPrompt('breakage.extract-testcases'),
    prompt: `Test-case document "${doc.name}":\n${doc.text.slice(0, DOC_CHARS)}\n\nReturn JSON: {"testcases":[{"title":"...","preconditions":"...","steps":["..."],"expected":"...","tags":["..."],"feature":"..."}]}.`,
    schema: ExtractedTestCasesSchema,
  });
  onUsage(u);
  return testcases.map((c) => ({
    ...base,
    title: c.title,
    preconditions: c.preconditions ?? '',
    steps: c.steps ?? [],
    expected: c.expected ?? '',
    tags: c.tags ?? [],
    feature: c.feature ?? '',
  }));
}

// --- Stage B: synthesis prompt assembly ---

function buildSynthesisPrompt(ctx: {
  changes: Array<{ pr: ResolvedPr; facts: ChangeFacts }>;
  jira: Awaited<ReturnType<typeof resolveJira>>['items'];
  requirements: RequirementDocFacts[];
  testCases: NormalizedCase[];
  additionalContext?: string;
}): string {
  const lines: string[] = [];

  const extra = ctx.additionalContext?.trim();
  if (extra) lines.push(`# ADDITIONAL CONTEXT (provided by the user)\n${extra}\n`);

  lines.push('# PULL REQUESTS');
  if (!ctx.changes.length) lines.push('(none)');
  for (const { pr, facts } of ctx.changes) {
    lines.push(`\n[${pr.id}] ${pr.label}${pr.url ? ` (${pr.url})` : ''}`);
    lines.push(`Summary: ${facts.summary}`);
    if (pr.changedFiles.length) lines.push(`Changed files: ${pr.changedFiles.slice(0, 60).join(', ')}`);
    const fld = (label: string, arr: string[]) => arr.length && lines.push(`${label}: ${arr.join('; ')}`);
    fld('Changed methods', facts.changedMethods);
    fld('Impacted APIs', facts.impactedApis);
    fld('DB changes', facts.dbChanges);
    fld('Validations', facts.validations);
    fld('Permissions', facts.permissions);
    fld('Feature flags', facts.featureFlags);
    fld('Downstream hints', facts.downstreamHints);
  }

  lines.push('\n# JIRA');
  if (!ctx.jira.length) lines.push('(none)');
  for (const j of ctx.jira) {
    lines.push(`\n[${j.key}] ${j.summary}`);
    if (j.description) lines.push(`Description: ${j.description.slice(0, 1_500)}`);
    if (j.acceptanceCriteria) lines.push(`Acceptance criteria: ${j.acceptanceCriteria.slice(0, 1_500)}`);
    if (j.labels.length) lines.push(`Labels: ${j.labels.join(', ')}`);
    if (j.linkedIssues.length) lines.push(`Linked: ${j.linkedIssues.map((l) => `${l.relation} ${l.key}`).join('; ')}`);
    if (j.comments.length) lines.push(`Comments: ${j.comments.join(' | ').slice(0, 1_500)}`);
  }

  lines.push('\n# REQUIREMENT / DESIGN DOCS');
  if (!ctx.requirements.length) lines.push('(none)');
  for (const r of ctx.requirements) {
    lines.push(`\n[${r.id}] ${r.name}`);
    if (r.requirements.length) lines.push(`Requirements: ${r.requirements.join('; ')}`);
    if (r.flows.length) lines.push(`Flows: ${r.flows.join('; ')}`);
    if (r.acceptanceCriteria.length) lines.push(`Acceptance criteria: ${r.acceptanceCriteria.join('; ')}`);
  }

  lines.push('\n# EXISTING TEST CASES');
  if (!ctx.testCases.length) lines.push('(none uploaded)');
  for (const t of ctx.testCases) {
    const bits = [t.expected && `expected: ${t.expected}`, t.feature && `feature: ${t.feature}`, t.tags.length && `tags: ${t.tags.join(',')}`]
      .filter(Boolean)
      .join('; ');
    lines.push(`[${t.id}] ${t.title}${bits ? ` (${bits})` : ''}`);
  }

  lines.push(
    '\n# TASK\nProduce the breakage analysis. Reference evidence ids (PR#, Jira key, REQ#, TC#) in every prediction. Return JSON exactly matching this shape:\n' +
      '{"summary":"...","riskScore":{"level":"LOW|MEDIUM|HIGH|CRITICAL","confidence":0-100,"rationale":"..."},' +
      '"predictedBrokenAreas":[{"area":"...","severity":"LOW|MEDIUM|HIGH|CRITICAL","why":"...","evidence":[{"kind":"pr|jira|doc|testcase","ref":"PR1","note":"..."}]}],' +
      '"impactedModules":[{"name":"...","reason":"...","evidence":[...]}],' +
      '"impactedApis":[{"endpoint":"...","change":"...","evidence":[...]}],' +
      '"impactedTestCases":[{"tcId":"TC1","title":"...","verdict":"impacted|partially-impacted|obsolete","confidence":0-100,"reason":"...","evidence":[...]}],' +
      '"missingCoverage":[{"area":"...","gap":"...","evidence":[...]}],' +
      '"recommendedTestCases":[{"title":"...","type":"positive|negative|edge","steps":["..."],"rationale":"...","evidence":[...]}],' +
      '"suggestedRegressionSuite":{"smoke":["..."],"regression":["..."],"rationale":"..."}}',
  );

  return lines.join('\n');
}

/**
 * Predict what a set of PRs / docs / Jira changes is likely to break. Runs a
 * two-stage map-reduce: per-input extraction (parallel, fast model) then one
 * synthesis call (quality model) that emits the evidence-cited report.
 */
export async function analyzeBreakage(rawInput: BreakageInput, deps: AnalyzeDeps = {}): Promise<BreakageResult> {
  const input = BreakageInputSchema.parse(rawInput);
  const fetchImpl = deps.fetchImpl ?? fetch;
  const llm = deps.llm ?? createLlmClient();
  const usage = makeUsageAccumulator();
  const limitations: string[] = [];

  // --- Stage A (parallel) ---
  const prs = await resolvePrs(input.prs ?? [], input.githubToken, fetchImpl);
  if (prs.some((p) => p.truncated)) limitations.push('Some PR diffs were large and were truncated to fit the token budget.');

  const jiraP = resolveJira(input.jira, fetchImpl);

  const changesP = Promise.all(prs.map((pr) => extractChange(llm, pr, usage.add)));
  const requirementsP = Promise.all((input.requirementDocs ?? []).map((d) => extractRequirements(llm, d, usage.add)));

  // Test-case docs share one running index so ids are globally unique (TC1..).
  const testDocs = input.testCaseDocs ?? [];
  const testCases: NormalizedCase[] = [];
  {
    const chunks = await Promise.all(testDocs.map((d) => normalizeTestDoc(llm, d, usage.add)));
    let capped = false;
    for (const cases of chunks) {
      for (const c of cases) {
        if (testCases.length >= MAX_TEST_CASES) {
          capped = true;
          break;
        }
        testCases.push({ ...c, id: `TC${testCases.length + 1}` });
      }
    }
    if (capped) limitations.push(`Test cases were capped at ${MAX_TEST_CASES}.`);
  }

  const [changes, requirements, jira] = await Promise.all([changesP, requirementsP, jiraP]);
  limitations.push(...jira.limitations);

  // --- Stage B (synthesis) ---
  const prompt = buildSynthesisPrompt({
    changes: prs.map((pr, i) => ({ pr, facts: changes[i]! })),
    jira: jira.items,
    requirements,
    testCases,
    additionalContext: input.additionalContext,
  });

  usage.setModel(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6');
  let synthUsage: TokenUsage | undefined;
  const analysis = await llm.completeJSON({
    operation: 'breakage.analyze',
    onUsage: (x) => (synthUsage = x),
    system: resolveSystemPrompt('breakage.analyze'),
    prompt,
    maxTokens: 12_000,
    schema: BreakageAnalysisSchema,
  });
  usage.add(synthUsage);

  // --- Manifest (lets the UI resolve every evidence ref) ---
  const testDocCounts = new Map<string, number>();
  for (const t of testCases) testDocCounts.set(t.docId, (testDocCounts.get(t.docId) ?? 0) + 1);
  const manifest: BreakageManifest = {
    prs: prs.map((p) => ({ id: p.id, label: p.label, url: p.url })),
    jira: jira.items.map((j) => ({ key: j.key, summary: j.summary, url: j.url })),
    requirementDocs: requirements.map((r) => ({ id: r.id, name: r.name })),
    testCaseDocs: testDocs.map((d) => ({ id: d.id, name: d.name, count: testDocCounts.get(d.id) ?? 0 })),
  };

  return { analysis, manifest, limitations, usage: usage.totals() };
}
