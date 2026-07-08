import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { z } from 'zod';
import { SelectionSchema } from '@qa-prism/core';
import { generate, loadRegistry, zipDir } from '@qa-prism/generator';
import { analyzePr } from '@qa-prism/impact-analyser';
import {
  createLlmClient,
  setUsageRecorder,
  DEFAULT_TESTCASE_SYSTEM,
  type TokenUsage,
} from '@qa-prism/llm';
import { UsageStore } from './usage-store.js';

const FAST_MODEL = () => process.env.ANTHROPIC_FAST_MODEL || 'claude-haiku-4-5';

/** Strip a wrapping ```lang … ``` code fence if the model added one. */
function stripCodeFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return (m ? m[1]! : t).trim();
}

const TestCasesBody = z.object({
  description: z.string().min(3).max(20_000),
  context: z.string().max(200).optional(),
  system: z.string().min(1).max(20_000).optional(),
  format: z.enum(['standard', 'bdd']).optional(),
});
const ExplainFeatureBody = z.object({ description: z.string().min(3).max(20_000) });
const FillColumnsBody = z.object({
  testcases: z.array(z.string().min(1)).min(1).max(200),
  columns: z.array(z.string().min(1)).min(1).max(12),
});
const CombineBody = z.object({ testcases: z.array(z.string().min(1)).min(2).max(25) });
const ExplainBody = z.object({ testcase: z.string().min(1).max(2000) });
const ImpactBody = z.object({ prUrl: z.string().min(1), githubToken: z.string().optional() });

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The desktop app's local API — the LLM-powered subset of QA Prism, with NO
 * database, Redis, or headless browser. Built on Node's `http` (no web
 * framework) so it bundles into a single file cleanly. It's reached only by
 * the local Next server (server-side), so no CORS is required. Token usage is
 * written to a local JSON file. The Anthropic key and other settings come from
 * process.env, populated by the Electron main process from the user's Settings.
 */
export function buildDesktopApi(usageFile: string): Server {
  const usage = new UsageStore(usageFile);
  setUsageRecorder((u: TokenUsage) => usage.record(u));

  async function generateTestcases(body: unknown) {
    const { description, context, ...rest } = TestCasesBody.parse(body);
    const system = rest.system?.trim() || DEFAULT_TESTCASE_SYSTEM;
    const bdd = rest.format === 'bdd';
    const llm = createLlmClient();
    const schema = z.object({
      testcases: z
        .array(z.object({ title: z.string().min(1), type: z.enum(['positive', 'negative', 'edge']) }))
        .min(1)
        .max(200),
    });
    const outputInstruction = bdd
      ? 'For each test case, "title" must be a COMPLETE, atomic Gherkin scenario as multi-line text starting with "Scenario:" (or "Scenario Outline:") followed by Given/When/Then/And steps (use real newlines "\\n"). Classify each as "positive", "negative", or "edge". Cover positive, negative, edge, state-transition, resiliency, accessibility, security, and concurrency scenarios.'
      : 'For each test case, "title" is a single concise ONE-LINE sentence (imperative, no numbering, no steps). Classify each as "positive" (happy path / valid), "negative" (invalid input, errors, auth/permission failures), or "edge" (boundaries, limits, concurrency, unusual states).';
    let u: TokenUsage | undefined;
    const result = await llm.completeJSON({
      operation: 'testcases.generate',
      onUsage: (x) => (u = x),
      system,
      prompt: `${context ? `Context: ${context}\n\n` : ''}Description:\n${description}\n\nProduce a COMPREHENSIVE set of manual test cases — generate as many distinct, valuable cases as the feature warrants (commonly 25–60+ for a non-trivial feature; do not artificially limit the count). ${outputInstruction}\n\nReturn JSON: {"testcases":[{"title":"...","type":"positive|negative|edge"}, ...]}.`,
      schema,
    });
    const testcases = result.testcases
      .map((t) => ({ title: bdd ? t.title.trim() : t.title.replace(/^\s*[-*\d.)]+\s*/, '').trim(), type: t.type }))
      .filter((t) => t.title.length > 0)
      .slice(0, 200);
    return { testcases, usage: u };
  }

  async function fillColumns(body: unknown) {
    const { testcases, columns } = FillColumnsBody.parse(body);
    const llm = createLlmClient();
    const schema = z.object({ rows: z.array(z.array(z.string())) });
    const numbered = testcases.map((t, i) => `${i + 1}. ${t}`).join('\n');
    let u: TokenUsage | undefined;
    const result = await llm.completeJSON({
      model: FAST_MODEL(),
      operation: 'testcases.fill-columns',
      onUsage: (x) => (u = x),
      system:
        'You are a senior QA engineer filling in a test-case table. For each test case (a fixed one-line title you must NOT change or restate) and each requested column, produce a concise, useful cell value inferred from the column name (e.g. "Priority" -> High/Medium/Low; "Preconditions", "Test Steps", "Expected Result", "Test Data" -> a short phrase or sentence). Return JSON with a `rows` matrix where rows[i] is the array of cell values for test case i, one value per column in the exact given order.',
      prompt: `Columns (in order): ${JSON.stringify(columns)}\n\nTest cases:\n${numbered}\n\nReturn JSON: {"rows":[["col1 value","col2 value", ...], ...]} with exactly ${testcases.length} rows and ${columns.length} values each.`,
      schema,
    });
    const rows = testcases.map((_, i) => {
      const row = result.rows[i] ?? [];
      return columns.map((__, j) => String(row[j] ?? ''));
    });
    return { rows, usage: u };
  }

  async function combine(body: unknown) {
    const { testcases } = CombineBody.parse(body);
    const llm = createLlmClient();
    const schema = z.object({ title: z.string().min(1), type: z.enum(['positive', 'negative', 'edge']) });
    let u: TokenUsage | undefined;
    const result = await llm.completeJSON({
      operation: 'testcases.combine',
      onUsage: (x) => (u = x),
      system:
        'You are a senior QA engineer. Merge the given manual test cases into ONE coherent, concise one-line test case that preserves their combined intent and important checks. Imperative, no numbering. Classify it as positive, negative, or edge.',
      prompt: `Combine these test cases into one:\n${testcases.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nReturn JSON: {"title":"...","type":"positive|negative|edge"}.`,
      schema,
    });
    return { title: result.title.replace(/^\s*[-*\d.)]+\s*/, '').trim(), type: result.type, usage: u };
  }

  async function explainTestcase(body: unknown) {
    const { testcase } = ExplainBody.parse(body);
    const llm = createLlmClient();
    let u: TokenUsage | undefined;
    const raw = await llm.complete({
      operation: 'testcases.explain',
      onUsage: (x) => (u = x),
      system:
        'You are a senior QA engineer. Explain a one-line manual test case clearly and practically for a tester. Format the answer as Markdown with these bold section labels, EACH ON ITS OWN LINE and separated by a blank line, never one run-on paragraph:\n\n**What it verifies**\n<1-2 sentences>\n\n**Preconditions**\n- <bullet>\n- <bullet>\n\n**Steps**\n1. <step>\n2. <step>\n\n**Expected Result**\n- <bullet or short sentence>\n\nKeep it concise. Respond with the Markdown directly — do NOT wrap it in code fences or JSON.',
      prompt: `Explain this test case:\n"${testcase}"`,
    });
    const explanation = stripCodeFence(raw);
    if (!explanation) throw new Error('empty explanation from model');
    return { explanation, usage: u };
  }

  async function explainFeature(body: unknown) {
    const { description } = ExplainFeatureBody.parse(body);
    const llm = createLlmClient();
    let u: TokenUsage | undefined;
    const raw = await llm.complete({
      operation: 'Explain Feature',
      onUsage: (x) => (u = x),
      system:
        'You explain software features in plain, simple language that ANY audience can follow — a beginner, a manager, a lead, and a director alike. Avoid jargon; when a technical term is unavoidable, define it briefly. Use everyday analogies and at least one concrete example. Format the answer as GitHub-flavored Markdown with these bold section labels, each on its own line and separated by a blank line: **In simple terms** (1-2 sentences), **How it works** (a few plain steps as a numbered list), **Example** (a concrete walkthrough), and **Why it matters** (business value, as bullet points). Keep it concise and friendly. Respond with the Markdown directly — do NOT wrap it in code fences or JSON.',
      prompt: `Explain this feature so everyone understands it:\n${description}`,
    });
    const explanation = stripCodeFence(raw);
    if (!explanation) throw new Error('empty explanation from model');
    return { explanation, usage: u };
  }

  async function impact(body: unknown) {
    const parsed = ImpactBody.parse(body);
    const githubToken = parsed.githubToken || process.env.GITHUB_TOKEN;
    const result = await analyzePr({ prUrl: parsed.prUrl, githubToken });
    const analysis = {
      ...result.analysis,
      whatsImpacted: {
        ...result.analysis.whatsImpacted,
        areas: result.analysis.whatsImpacted.areas.map((a) => ({ ...a, relatedFindingIds: [] as string[] })),
      },
    };
    return {
      id: `${result.owner}-${result.repo}-${result.prNumber}`,
      prUrl: parsed.prUrl,
      prNumber: result.prNumber,
      repo: `${result.owner}/${result.repo}`,
      title: result.title,
      tickets: result.tickets,
      analysis,
      changedFiles: result.changedFiles,
      limitations: result.limitations,
      usage: result.usage,
    };
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch((err) => sendJson(res, statusOf(err), { error: messageOf(err) }));
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const route = `${method} ${path}`;

    if (route === 'GET /health') return sendJson(res, 200, { ok: true, key: Boolean(process.env.ANTHROPIC_API_KEY) });
    if (route === 'GET /testcases/system-prompt') return sendJson(res, 200, { prompt: DEFAULT_TESTCASE_SYSTEM });
    if (route === 'GET /generator/cells') return sendJson(res, 200, (await loadRegistry()).cells);
    if (route === 'GET /usage') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 60);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      return sendJson(res, 200, usage.query(limit, offset));
    }

    if (method === 'POST') {
      const body = await readJson(req);
      switch (path) {
        case '/testcases/generate':
          return sendJson(res, 200, await guard(() => generateTestcases(body)));
        case '/testcases/columns':
          return sendJson(res, 200, await guard(() => fillColumns(body)));
        case '/testcases/combine':
          return sendJson(res, 200, await guard(() => combine(body)));
        case '/testcases/explain':
          return sendJson(res, 200, await guard(() => explainTestcase(body)));
        case '/testcases/explain-feature':
          return sendJson(res, 200, await guard(() => explainFeature(body)));
        case '/impact':
          try {
            return sendJson(res, 200, await impact(body));
          } catch (err) {
            return sendJson(res, 400, { error: messageOf(err) });
          }
        case '/generator/generate': {
          const parsed = SelectionSchema.safeParse(body);
          if (!parsed.success) return sendJson(res, 400, { error: 'invalid selection', issues: parsed.error.issues });
          const result = await generate(parsed.data);
          if (!result.matched || !result.outDir || !result.rootName) {
            return sendJson(res, 422, { error: result.reason ?? 'no matching stack cell' });
          }
          const zip = await zipDir(result.outDir, result.rootName);
          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${result.rootName}.zip"`,
          });
          res.end(zip);
          return;
        }
        default:
          return sendJson(res, 404, { error: 'not found' });
      }
    }

    return sendJson(res, 404, { error: 'not found' });
  }

  return server;
}

/** Run an LLM handler, mapping failures to a 502 (bad-gateway to the model). */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof z.ZodError) throw new HttpError(400, 'invalid body');
    throw new HttpError(502, messageOf(err));
  }
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

function statusOf(err: unknown): number {
  return err instanceof HttpError ? err.status : 500;
}
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
