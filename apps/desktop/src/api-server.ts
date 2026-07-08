import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
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
  system: z.string().min(1).max(20_000).optional(), // override the default QA system prompt
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

/**
 * The desktop app's local API — the LLM-powered subset of the QA Prism server,
 * with NO database, Redis, or headless browser. Token usage is written to a
 * local JSON file instead of Postgres. The Anthropic key and other settings
 * are read from process.env, which the Electron main process populates from
 * the user's saved Settings before this server starts.
 */
export function buildDesktopApi(usageFile: string): FastifyInstance {
  const app = Fastify({ logger: false });
  const usage = new UsageStore(usageFile);

  // Every Claude call flows through this recorder (retries included).
  setUsageRecorder((u: TokenUsage) => usage.record(u));

  void app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true, key: Boolean(process.env.ANTHROPIC_API_KEY) }));

  // --- Test case generator -------------------------------------------------
  app.post('/testcases/generate', async (req, reply) => {
    const parsed = TestCasesBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const { description, context } = parsed.data;
    const system = parsed.data.system?.trim() || DEFAULT_TESTCASE_SYSTEM;
    const bdd = parsed.data.format === 'bdd';
    try {
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
        .map((t) => ({
          title: bdd ? t.title.trim() : t.title.replace(/^\s*[-*\d.)]+\s*/, '').trim(),
          type: t.type,
        }))
        .filter((t) => t.title.length > 0)
        .slice(0, 200);
      return { testcases, usage: u };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/testcases/system-prompt', async () => ({ prompt: DEFAULT_TESTCASE_SYSTEM }));

  app.post('/testcases/explain-feature', async (req, reply) => {
    const parsed = ExplainFeatureBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    try {
      const llm = createLlmClient();
      let u: TokenUsage | undefined;
      const raw = await llm.complete({
        operation: 'Explain Feature',
        onUsage: (x) => (u = x),
        system:
          'You explain software features in plain, simple language that ANY audience can follow — a beginner, a manager, a lead, and a director alike. Avoid jargon; when a technical term is unavoidable, define it briefly. Use everyday analogies and at least one concrete example. Format the answer as GitHub-flavored Markdown with these bold section labels, each on its own line and separated by a blank line: **In simple terms** (1-2 sentences), **How it works** (a few plain steps as a numbered list), **Example** (a concrete walkthrough), and **Why it matters** (business value, as bullet points). Keep it concise and friendly. Respond with the Markdown directly — do NOT wrap it in code fences or JSON.',
        prompt: `Explain this feature so everyone understands it:\n${parsed.data.description}`,
      });
      const explanation = stripCodeFence(raw);
      if (!explanation) throw new Error('empty explanation from model');
      return { explanation, usage: u };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/testcases/columns', async (req, reply) => {
    const parsed = FillColumnsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const { testcases, columns } = parsed.data;
    try {
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
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/testcases/combine', async (req, reply) => {
    const parsed = CombineBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    try {
      const llm = createLlmClient();
      const schema = z.object({ title: z.string().min(1), type: z.enum(['positive', 'negative', 'edge']) });
      let u: TokenUsage | undefined;
      const result = await llm.completeJSON({
        operation: 'testcases.combine',
        onUsage: (x) => (u = x),
        system:
          'You are a senior QA engineer. Merge the given manual test cases into ONE coherent, concise one-line test case that preserves their combined intent and important checks. Imperative, no numbering. Classify it as positive, negative, or edge.',
        prompt: `Combine these test cases into one:\n${parsed.data.testcases.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nReturn JSON: {"title":"...","type":"positive|negative|edge"}.`,
        schema,
      });
      return { title: result.title.replace(/^\s*[-*\d.)]+\s*/, '').trim(), type: result.type, usage: u };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/testcases/explain', async (req, reply) => {
    const parsed = ExplainBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    try {
      const llm = createLlmClient();
      let u: TokenUsage | undefined;
      const raw = await llm.complete({
        operation: 'testcases.explain',
        onUsage: (x) => (u = x),
        system:
          'You are a senior QA engineer. Explain a one-line manual test case clearly and practically for a tester. Format the answer as Markdown with these bold section labels, EACH ON ITS OWN LINE and separated by a blank line, never one run-on paragraph:\n\n**What it verifies**\n<1-2 sentences>\n\n**Preconditions**\n- <bullet>\n- <bullet>\n\n**Steps**\n1. <step>\n2. <step>\n\n**Expected Result**\n- <bullet or short sentence>\n\nKeep it concise. Respond with the Markdown directly — do NOT wrap it in code fences or JSON.',
        prompt: `Explain this test case:\n"${parsed.data.testcase}"`,
      });
      const explanation = stripCodeFence(raw);
      if (!explanation) throw new Error('empty explanation from model');
      return { explanation, usage: u };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Framework generator -------------------------------------------------
  app.get('/generator/cells', async () => {
    const index = await loadRegistry();
    return index.cells;
  });
  app.post('/generator/generate', async (req, reply) => {
    const parsed = SelectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid selection', issues: parsed.error.issues });
    }
    const result = await generate(parsed.data);
    if (!result.matched || !result.outDir || !result.rootName) {
      return reply.code(422).send({ error: result.reason ?? 'no matching stack cell' });
    }
    const zip = await zipDir(result.outDir, result.rootName);
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${result.rootName}.zip"`);
    return reply.send(zip);
  });

  // --- PR impact analyser (no DB persistence / finding cross-linking) ------
  app.post('/impact', async (req, reply) => {
    const parsed = ImpactBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    const githubToken = parsed.data.githubToken || process.env.GITHUB_TOKEN;
    try {
      const result = await analyzePr({ prUrl: parsed.data.prUrl, githubToken });
      const analysis = {
        ...result.analysis,
        whatsImpacted: {
          ...result.analysis.whatsImpacted,
          areas: result.analysis.whatsImpacted.areas.map((a) => ({ ...a, relatedFindingIds: [] as string[] })),
        },
      };
      return {
        id: `${result.owner}-${result.repo}-${result.prNumber}`,
        prUrl: parsed.data.prUrl,
        prNumber: result.prNumber,
        repo: `${result.owner}/${result.repo}`,
        title: result.title,
        tickets: result.tickets,
        analysis,
        changedFiles: result.changedFiles,
        limitations: result.limitations,
        usage: result.usage,
      };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // --- Usage / consumption -------------------------------------------------
  app.get('/usage', async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 10, 1), 60);
    const offset = Math.max(Number(q.offset) || 0, 0);
    return usage.query(limit, offset);
  });

  return app;
}
