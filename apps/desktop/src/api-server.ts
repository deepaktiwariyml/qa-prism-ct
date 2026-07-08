import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { z } from 'zod';
import { SelectionSchema } from '@qa-prism/core';
import { generate, loadRegistry, zipDir } from '@qa-prism/generator';
import { analyzePr } from '@qa-prism/impact-analyser';
import {
  createLlmClient,
  setUsageRecorder,
  resolveSystemPrompt,
  SYSTEM_PROMPTS,
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
const JiraImportBody = z.object({ ticket: z.string().min(1).max(300) });
const JiraSearchBody = z.object({ query: z.string().max(200) });

/** Pull a Jira issue key (e.g. ABC-123) out of a raw key or a ticket URL. */
function extractJiraKey(input: string): string {
  const m = input.match(/([A-Za-z][A-Za-z0-9]+-\d+)/);
  return m ? m[1]!.toUpperCase() : '';
}

/** Minimal HTML→text for Jira rendered descriptions. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Fetch a Jira issue's summary + description via the Cloud REST API. */
async function fetchJiraTicket(rawInput: string): Promise<{ key: string; summary: string; description: string }> {
  const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
  const email = process.env.JIRA_EMAIL || '';
  const token = process.env.JIRA_API_TOKEN || '';
  if (!base || !email || !token) {
    throw new HttpError(400, 'Jira is not configured. Add your Jira site URL, email, and API token in Settings.');
  }
  const key = extractJiraKey(rawInput);
  if (!key) throw new HttpError(400, 'Enter a Jira ticket key (e.g. ABC-123) or a ticket URL.');
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const url = `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description&expand=renderedFields`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) {
    throw new HttpError(400, 'Jira authentication failed — check your email and API token in Settings.');
  }
  if (res.status === 404) throw new HttpError(404, `Jira ticket ${key} was not found (or you lack access).`);
  if (!res.ok) throw new HttpError(502, `Jira returned ${res.status}.`);
  const data = (await res.json()) as {
    fields?: { summary?: string; description?: AdfNode | null };
    renderedFields?: { description?: string };
  };
  // Prefer the server-rendered HTML; fall back to walking the ADF description.
  let description = htmlToText(data.renderedFields?.description ?? '');
  if (!description && data.fields?.description) description = adfToText(data.fields.description).trim();
  return { key, summary: data.fields?.summary ?? '', description };
}

/**
 * Typeahead search for Jira issues. Uses the issue-picker endpoint, which
 * matches on key or summary text and is what Jira's own autocomplete uses.
 * Returns [] (never throws) when Jira isn't configured or the query is empty,
 * so the UI can degrade to a plain "type a key" field.
 */
async function searchJiraTickets(query: string): Promise<Array<{ key: string; summary: string }>> {
  const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
  const email = process.env.JIRA_EMAIL || '';
  const token = process.env.JIRA_API_TOKEN || '';
  const q = query.trim();
  if (!base || !email || !token || !q) return [];
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const url = `${base}/rest/api/3/issue/picker?query=${encodeURIComponent(q)}&showSubTasks=true&showSubTaskParent=true`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    sections?: Array<{ issues?: Array<{ key?: string; summaryText?: string; summary?: string }> }>;
  };
  const seen = new Set<string>();
  const out: Array<{ key: string; summary: string }> = [];
  for (const section of data.sections ?? []) {
    for (const issue of section.issues ?? []) {
      const key = issue.key ?? '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, summary: issue.summaryText ?? issue.summary ?? '' });
      if (out.length >= 15) return out;
    }
  }
  return out;
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

/** Extract plain text from Atlassian Document Format (ADF) description JSON. */
function adfToText(node: AdfNode | null | undefined): string {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text' && typeof node.text === 'string') return node.text;
  const inner = Array.isArray(node.content) ? node.content.map(adfToText).join('') : '';
  const blocks = ['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'rule'];
  if (node.type && blocks.includes(node.type)) return `${inner}\n`;
  return inner;
}

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
    const system = rest.system?.trim() || resolveSystemPrompt('testcases.generate');
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
      system: resolveSystemPrompt('testcases.fill-columns'),
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
      system: resolveSystemPrompt('testcases.combine'),
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
      system: resolveSystemPrompt('testcases.explain'),
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
      system: resolveSystemPrompt('testcases.explain-feature'),
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
    if (route === 'GET /testcases/system-prompt')
      return sendJson(res, 200, { prompt: resolveSystemPrompt('testcases.generate') });
    // Canonical system prompts for the read-only reference page (defaults only,
    // never the user's overrides).
    if (route === 'GET /prompts')
      return sendJson(res, 200, {
        prompts: SYSTEM_PROMPTS.map((p) => ({
          key: p.key,
          label: p.label,
          description: p.description,
          prompt: p.default,
        })),
      });
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
        case '/testcases/jira-import': {
          const parsed = JiraImportBody.safeParse(body);
          if (!parsed.success) return sendJson(res, 400, { error: 'invalid body' });
          return sendJson(res, 200, await fetchJiraTicket(parsed.data.ticket));
        }
        case '/testcases/jira-search': {
          const parsed = JiraSearchBody.safeParse(body);
          if (!parsed.success) return sendJson(res, 400, { error: 'invalid body' });
          return sendJson(res, 200, { results: await searchJiraTickets(parsed.data.query) });
        }
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
