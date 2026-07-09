import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { SelectionSchema } from '@qa-prism/core';
import { getPrisma, Prisma } from '@qa-prism/db';
import { generate, loadRegistry, zipDir } from '@qa-prism/generator';
import { analyzePr } from '@qa-prism/impact-analyser';
import { analyzeBreakage, BreakageInputSchema } from '@qa-prism/breakage-analyser';
import {
  createLlmClient,
  setUsageRecorder,
  resolveSystemPrompt,
  SYSTEM_PROMPTS,
  type TokenUsage,
} from '@qa-prism/llm';
import { buildHtmlReport, type ReportScan } from './report.js';
import type { Queue } from 'bullmq';
import type { ScanJobData } from './queue.js';

const ImpactBody = z.object({
  prUrl: z.string().min(1),
  githubToken: z.string().optional(),
});

const FunWordsBody = z.object({
  level: z.enum(['beginner', 'medium', 'hard']),
  count: z.number().int().min(1).max(16),
  minLen: z.number().int().min(2).max(20),
  maxLen: z.number().int().min(2).max(20),
});

const TestCasesBody = z.object({
  description: z.string().min(3).max(20_000),
  context: z.string().max(200).optional(),
  system: z.string().min(1).max(20_000).optional(), // override the default QA system prompt
  format: z.enum(['standard', 'bdd']).optional(),
});

const ExplainFeatureBody = z.object({
  description: z.string().min(3).max(20_000),
});

const JiraImportBody = z.object({ ticket: z.string().min(1).max(300) });
const JiraSearchBody = z.object({ query: z.string().max(200) });

const FillColumnsBody = z.object({
  testcases: z.array(z.string().min(1)).min(1).max(200),
  columns: z.array(z.string().min(1)).min(1).max(12),
});

const CombineBody = z.object({
  testcases: z.array(z.string().min(1)).min(2).max(25),
});

const ExplainBody = z.object({
  testcase: z.string().min(1).max(2000),
});

// Cheaper model for low-stakes generation (word game, column auto-fill). The
// quality-critical calls (impact analysis, test-case generation, login field
// detection) use the default ANTHROPIC_MODEL (Sonnet).
const FAST_MODEL = process.env.ANTHROPIC_FAST_MODEL || 'claude-haiku-4-5';

// Belt-and-braces filter on top of the "no negatives" prompt instruction.
const BLOCKED_WORDS = new Set([
  'ERROR', 'CRASH', 'FAIL', 'FAILURE', 'VIRUS', 'MALWARE', 'BREACH', 'EXPLOIT',
  'SPAM', 'DEATH', 'KILL', 'HATE', 'WAR', 'BOMB', 'DRUG', 'ATTACK', 'THREAT',
  'WEAPON', 'RANSOM', 'PHISHING', 'FRAUD',
]);

function sanitizeFunWords(raw: unknown[], minLen: number, maxLen: number, count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of raw) {
    const up = String(w).toUpperCase().replace(/[^A-Z]/g, '');
    if (up.length < minLen || up.length > maxLen) continue;
    if (BLOCKED_WORDS.has(up) || seen.has(up)) continue;
    seen.add(up);
    out.push(up);
    if (out.length >= count) break;
  }
  return out;
}

/** Strip a wrapping ```lang … ``` code fence if the model added one. */
function stripCodeFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return (m ? m[1]! : t).trim();
}

/** Pull a Jira issue key (e.g. ABC-123) out of a raw key or a ticket URL. */
function extractJiraKey(input: string): string {
  const m = input.match(/([A-Za-z][A-Za-z0-9]+-\d+)/);
  return m ? m[1]!.toUpperCase() : '';
}

/**
 * Typeahead search for Jira issues via the issue-picker endpoint (matches on
 * key or summary text). Returns [] and never throws when Jira isn't configured
 * or the query is empty, so the UI degrades gracefully to a plain key field.
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

/** Attach existing-finding ids that overlap an impact area's files/name. */
function crossLinkFindings(
  area: { name: string; impactedFiles: string[] },
  findings: Array<{ id: string; tags: string[]; location: unknown }>,
): string[] {
  const files = area.impactedFiles.map((f) => f.toLowerCase());
  const nameTokens = area.name
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);
  const ids = new Set<string>();
  for (const f of findings) {
    const path = String((f.location as { path?: string } | null)?.path ?? '').toLowerCase();
    const tags = f.tags.map((t) => t.toLowerCase());
    const fileMatch = files.some((rf) => {
      const base = rf.split('/').pop() ?? rf;
      return base.length > 0 && (path.includes(base) || (path.length > 0 && rf.includes(path)));
    });
    const tagMatch = nameTokens.some((tok) => tags.includes(tok));
    if (fileMatch || tagMatch) ids.add(f.id);
  }
  return [...ids].slice(0, 20);
}

const AuthSchema = z.object({
  loginUrl: z.string().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  usernameSelector: z.string().optional(),
  passwordSelector: z.string().optional(),
  submitSelector: z.string().optional(),
});

const CreateScanBody = z.object({
  name: z.string().optional(),
  target: z.object({
    kind: z.enum(['url', 'repo']),
    value: z.string().min(1),
  }),
  options: z.record(z.string(), z.unknown()).optional(),
  /** Optional scripted-login credentials for an authenticated scan. */
  auth: AuthSchema.optional(),
});

/**
 * Build the Fastify app. The scan queue is injected so this can be constructed
 * without side effects (and swapped in tests).
 */
export function buildServer(queue: Queue<ScanJobData>): FastifyInstance {
  const app = Fastify({ logger: true });
  const prisma = getPrisma();

  // Accounting for every Claude call (spec §7). Registered once; fired from
  // inside the LLM client, so no call site can forget to report — the failing
  // attempt of a retry is billed and recorded too. Upsert increments the
  // per-(day, model, operation) row. Never throws back into the LLM call.
  setUsageRecorder(async (u: TokenUsage) => {
    const day = new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd
    // Atomic upsert-increment via native INSERT ... ON CONFLICT. Postgres
    // serialises concurrent writers on the row (and on the first-insert
    // conflict), so simultaneous calls from many users can never lose an
    // update or throw a unique-violation — the counts stay exact.
    await prisma.$executeRaw`
      INSERT INTO "LlmUsageDaily"
        ("id", "day", "model", "operation", "calls", "inputTokens", "outputTokens", "costUsd", "updatedAt")
      VALUES
        (gen_random_uuid()::text, ${day}::date, ${u.model}, ${u.operation}, 1, ${u.inputTokens}, ${u.outputTokens}, ${u.costUsd}, now())
      ON CONFLICT ("day", "model", "operation") DO UPDATE SET
        "calls" = "LlmUsageDaily"."calls" + 1,
        "inputTokens" = "LlmUsageDaily"."inputTokens" + EXCLUDED."inputTokens",
        "outputTokens" = "LlmUsageDaily"."outputTokens" + EXCLUDED."outputTokens",
        "costUsd" = "LlmUsageDaily"."costUsd" + EXCLUDED."costUsd",
        "updatedAt" = now()
    `;
  });

  // Allow the dashboard (and other local clients) to call the API from a browser.
  void app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));

  // Recent scans for the dashboard home (target + overall score). Explicit
  // select so the screenshot/thumbnail bytes never bloat the JSON list.
  app.get('/scans', async () => {
    return prisma.scan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        status: true,
        createdAt: true,
        target: { select: { name: true, value: true, kind: true } },
        score: { select: { overall: true } },
      },
    });
  });

  // Trigger a scan: find-or-create the Target, create a queued Scan, enqueue it.
  app.post('/scans', async (req, reply) => {
    const parsed = CreateScanBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    const { target, name, options, auth } = parsed.data;

    const existing = await prisma.target.findFirst({
      where: { kind: target.kind, value: target.value },
    });
    const targetRow =
      existing ??
      (await prisma.target.create({
        data: { name: name ?? target.value, kind: target.kind, value: target.value },
      }));

    const scan = await prisma.scan.create({
      data: { targetId: targetRow.id, status: 'queued' },
    });
    // Fold auth into the job options. When credentials are present, remove the
    // job from Redis on completion/failure so they don't linger.
    const jobData = { scanId: scan.id, target, options: { ...options, auth } };
    await queue.add('scan', jobData, {
      removeOnComplete: true,
      removeOnFail: auth ? true : 50,
    });

    return reply.code(202).send({ scanId: scan.id, status: scan.status });
  });

  // Framework generator (spec §6.7): the dashboard dropdowns read the cells,
  // then POST a selection to download a generated framework as a zip.
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

  // PR impact analyser (spec §6.5): fetch the diff, ask Claude for risk-ranked
  // Runtime feature flags for the web app.
  app.get('/flags', async () => ({ whatsBroken: process.env.WHATS_BROKEN_ENABLED === '1' }));

  // User-defined extra test-case columns (JSON string[] in env; [] if unset).
  app.get('/testcases/custom-columns', async () => {
    const raw = process.env.QA_CUSTOM_TESTCASE_COLUMNS;
    try {
      const v = raw ? JSON.parse(raw) : [];
      return { columns: Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string') : [] };
    } catch {
      return { columns: [] };
    }
  });

  // "What's Broken": predict regressions/impacted tests from PRs + docs +
  // test cases + Jira. Stateless (ephemeral) — no persistence. Gated by flag.
  app.post('/breakage/analyze', async (req, reply) => {
    if (process.env.WHATS_BROKEN_ENABLED !== '1') return reply.code(404).send({ error: 'not found' });
    const parsed = BreakageInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    const githubToken = parsed.data.githubToken || process.env.GITHUB_TOKEN;
    try {
      return await analyzeBreakage({ ...parsed.data, githubToken });
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // areas, cross-link to existing findings, persist an ImpactReport.
  app.post('/impact', async (req, reply) => {
    const parsed = ImpactBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    const githubToken = parsed.data.githubToken || process.env.GITHUB_TOKEN;

    let result;
    try {
      result = await analyzePr({ prUrl: parsed.data.prUrl, githubToken });
    } catch (err) {
      // Bad URL, GitHub error, or missing ANTHROPIC_API_KEY — surface clearly.
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }

    const value = `${result.owner}/${result.repo}`;
    const target =
      (await prisma.target.findFirst({ where: { kind: 'repo', value } })) ??
      (await prisma.target.create({ data: { name: value, kind: 'repo', value } }));

    const findings = await prisma.finding.findMany({
      take: 1000,
      orderBy: { createdAt: 'desc' },
      select: { id: true, tags: true, location: true },
    });
    // Cross-link existing scanner findings into each impacted area.
    const analysis = {
      ...result.analysis,
      whatsImpacted: {
        ...result.analysis.whatsImpacted,
        areas: result.analysis.whatsImpacted.areas.map((a) => ({
          ...a,
          relatedFindingIds: crossLinkFindings(a, findings),
        })),
      },
    };

    const report = await prisma.impactReport.create({
      data: {
        targetId: target.id,
        prUrl: parsed.data.prUrl,
        prNumber: result.prNumber,
        status: 'done',
        // The `areas` Json column stores the full standardised report.
        areas: { analysis, changedFiles: result.changedFiles } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: report.id,
      prUrl: parsed.data.prUrl,
      prNumber: result.prNumber,
      repo: value,
      title: result.title,
      tickets: result.tickets,
      analysis,
      changedFiles: result.changedFiles,
      limitations: result.limitations,
      usage: result.usage,
    };
  });

  // FUN word-search: generate company-themed IT words via the LLM. Safe by
  // construction (prompt + sanitize); returns [] on any failure so the client
  // falls back to its static pool and the game always works.
  app.post('/fun/words', async (req, reply) => {
    const parsed = FunWordsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const { level, count, minLen, maxLen } = parsed.data;
    const company = process.env.COMPANY_NAME || 'Code and Theory';
    try {
      const llm = createLlmClient();
      const schema = z.object({ words: z.array(z.string()) });
      const result = await llm.completeJSON({
        model: FAST_MODEL,
        operation: 'fun.words',
        system:
          `You generate word lists for a family-friendly word-search game. Every word MUST come from the information technology and software industry and be relevant to the company "${company}" and the kind of work it does (digital products, design, engineering, web, cloud, data, AI). ` +
          `Rules: single real English words; ${minLen}-${maxLen} letters; letters A-Z only (no spaces, digits, hyphens, or accents); UPPERCASE. Use positive or neutral professional vocabulary ONLY — absolutely no offensive, violent, sensitive, or negative words.`,
        prompt: `Give me ${count} distinct words for the "${level}" difficulty. Return JSON: {"words":["DESIGN","CLOUD", ...]}.`,
        schema,
      });
      const words = sanitizeFunWords(result.words, minLen, maxLen, count);
      return { words, company };
    } catch {
      return { words: [], company };
    }
  });

  // LLM test-case generator: turn a feature/requirement description into
  // clear, one-line manual test cases, each classified positive/negative/edge.
  app.post('/testcases/generate', async (req, reply) => {
    const parsed = TestCasesBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const { description, context } = parsed.data;
    const system = parsed.data.system?.trim() || resolveSystemPrompt('testcases.generate');
    const bdd = parsed.data.format === 'bdd';
    try {
      const llm = createLlmClient();
      const schema = z.object({
        testcases: z
          .array(
            z.object({
              title: z.string().min(1),
              type: z.enum(['positive', 'negative', 'edge']),
            }),
          )
          .min(1)
          .max(200),
      });
      // The output shape is app-controlled so it fits the results table,
      // regardless of the (possibly user-overridden) system prompt above.
      const outputInstruction = bdd
        ? 'For each test case, "title" must be a COMPLETE, atomic Gherkin scenario as multi-line text starting with "Scenario:" (or "Scenario Outline:") followed by Given/When/Then/And steps (use real newlines "\\n"). Classify each as "positive", "negative", or "edge". Cover positive, negative, edge, state-transition, resiliency, accessibility, security, and concurrency scenarios.'
        : 'For each test case, "title" is a single concise ONE-LINE sentence (imperative, no numbering, no steps). Classify each as "positive" (happy path / valid), "negative" (invalid input, errors, auth/permission failures), or "edge" (boundaries, limits, concurrency, unusual states).';
      let usage: TokenUsage | undefined;
      const result = await llm.completeJSON({
        operation: 'testcases.generate',
        onUsage: (u) => (usage = u),
        system,
        prompt: `${context ? `Context: ${context}\n\n` : ''}Description:\n${description}\n\nProduce a COMPREHENSIVE set of manual test cases — generate as many distinct, valuable cases as the feature warrants (commonly 25–60+ for a non-trivial feature; do not artificially limit the count). ${outputInstruction}\n\nReturn JSON: {"testcases":[{"title":"...","type":"positive|negative|edge"}, ...]}.`,
        schema,
      });
      const testcases = result.testcases
        .map((t) => ({
          // Only strip leading list markers for plain one-liners; keep Gherkin text intact.
          title: bdd ? t.title.trim() : t.title.replace(/^\s*[-*\d.)]+\s*/, '').trim(),
          type: t.type,
        }))
        .filter((t) => t.title.length > 0)
        .slice(0, 200);
      return { testcases, usage };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Return the default QA system prompt so the UI can show it as an editable,
  // overridable default (single source of truth).
  app.get('/testcases/system-prompt', async () => ({ prompt: resolveSystemPrompt('testcases.generate') }));

  // Explain a feature in plain language for any audience (beginner → director).
  app.post('/testcases/explain-feature', async (req, reply) => {
    const parsed = ExplainFeatureBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    try {
      const llm = createLlmClient();
      let usage: TokenUsage | undefined;
      // Plain-text completion (not JSON): the explanation is a long multi-line
      // Markdown string, which models often fail to escape inside JSON. Asking
      // for the Markdown directly is far more reliable.
      const raw = await llm.complete({
        operation: 'Explain Feature',
        onUsage: (u) => (usage = u),
        system: resolveSystemPrompt('testcases.explain-feature'),
        prompt: `Explain this feature so everyone understands it:\n${parsed.data.description}`,
      });
      const explanation = stripCodeFence(raw);
      if (!explanation) throw new Error('empty explanation from model');
      return { explanation, usage };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Import a Jira ticket's summary + description to seed a test-case prompt.
  app.post('/testcases/jira-import', async (req, reply) => {
    const parsed = JiraImportBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
    const email = process.env.JIRA_EMAIL || '';
    const token = process.env.JIRA_API_TOKEN || '';
    if (!base || !email || !token) {
      return reply
        .code(400)
        .send({ error: 'Jira is not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.' });
    }
    const key = extractJiraKey(parsed.data.ticket);
    if (!key) return reply.code(400).send({ error: 'Enter a Jira ticket key (e.g. ABC-123) or a ticket URL.' });
    try {
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const url = `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description&expand=renderedFields`;
      const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
      if (res.status === 401 || res.status === 403) {
        return reply.code(400).send({ error: 'Jira authentication failed — check the email and API token.' });
      }
      if (res.status === 404) return reply.code(404).send({ error: `Jira ticket ${key} not found (or no access).` });
      if (!res.ok) return reply.code(502).send({ error: `Jira returned ${res.status}.` });
      const data = (await res.json()) as {
        fields?: { summary?: string; description?: AdfNode | null };
        renderedFields?: { description?: string };
      };
      // Prefer the server-rendered HTML; fall back to walking the ADF description.
      let description = htmlToText(data.renderedFields?.description ?? '');
      if (!description && data.fields?.description) description = adfToText(data.fields.description).trim();
      return { key, summary: data.fields?.summary ?? '', description };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Typeahead: matching Jira issues as the user types a key or text.
  app.post('/testcases/jira-search', async (req, reply) => {
    const parsed = JiraSearchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    return { results: await searchJiraTickets(parsed.data.query) };
  });

  // Canonical system prompts behind every LLM call — read-only reference
  // (defaults only, never the user's runtime overrides). The Predictive
  // Analysis prompts are hidden unless that feature is enabled.
  app.get('/prompts', async () => {
    const showBreakage = process.env.WHATS_BROKEN_ENABLED === '1';
    return {
      prompts: SYSTEM_PROMPTS.filter((p) => showBreakage || !p.key.startsWith('breakage.')).map((p) => ({
        key: p.key,
        label: p.label,
        description: p.description,
        prompt: p.default,
      })),
    };
  });

  // Fill user-defined columns for existing test cases via the LLM. The test
  // case titles are inputs only — they are never changed. Returns a matrix
  // aligned to the input order: rows[i][j] = value for testcase i, column j.
  app.post('/testcases/columns', async (req, reply) => {
    const parsed = FillColumnsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const { testcases, columns } = parsed.data;
    try {
      const llm = createLlmClient();
      const schema = z.object({ rows: z.array(z.array(z.string())) });
      const numbered = testcases.map((t, i) => `${i + 1}. ${t}`).join('\n');
      let usage: TokenUsage | undefined;
      const result = await llm.completeJSON({
        model: FAST_MODEL,
        operation: 'testcases.fill-columns',
        onUsage: (u) => (usage = u),
        system: resolveSystemPrompt('testcases.fill-columns'),
        prompt: `Columns (in order): ${JSON.stringify(columns)}\n\nTest cases:\n${numbered}\n\nReturn JSON: {"rows":[["col1 value","col2 value", ...], ...]} with exactly ${testcases.length} rows and ${columns.length} values each.`,
        schema,
      });
      // Normalize to an exact testcases × columns matrix (pad/truncate).
      const rows = testcases.map((_, i) => {
        const row = result.rows[i] ?? [];
        return columns.map((__, j) => String(row[j] ?? ''));
      });
      return { rows, usage };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Merge several selected test cases into a single coherent one-line case.
  app.post('/testcases/combine', async (req, reply) => {
    const parsed = CombineBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    try {
      const llm = createLlmClient();
      const schema = z.object({
        title: z.string().min(1),
        type: z.enum(['positive', 'negative', 'edge']),
      });
      let usage: TokenUsage | undefined;
      const result = await llm.completeJSON({
        operation: 'testcases.combine',
        onUsage: (u) => (usage = u),
        system: resolveSystemPrompt('testcases.combine'),
        prompt: `Combine these test cases into one:\n${parsed.data.testcases.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nReturn JSON: {"title":"...","type":"positive|negative|edge"}.`,
        schema,
      });
      return { title: result.title.replace(/^\s*[-*\d.)]+\s*/, '').trim(), type: result.type, usage };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Explain a single test case: what it verifies, preconditions, steps, expected result.
  app.post('/testcases/explain', async (req, reply) => {
    const parsed = ExplainBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    try {
      const llm = createLlmClient();
      let usage: TokenUsage | undefined;
      // Plain-text completion (not JSON): a multi-line Markdown explanation is
      // unreliable to round-trip through JSON, so ask for the Markdown directly.
      const raw = await llm.complete({
        operation: 'testcases.explain',
        onUsage: (u) => (usage = u),
        system: resolveSystemPrompt('testcases.explain'),
        prompt: `Explain this test case:\n"${parsed.data.testcase}"`,
      });
      const explanation = stripCodeFence(raw);
      if (!explanation) throw new Error('empty explanation from model');
      return { explanation, usage };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // LLM token + cost consumption, aggregated per day (spec §7). Paginated by
  // day (newest first, `limit` days per page from `offset`); `totals` is
  // all-time across every day, independent of the page.
  app.get('/usage', async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    const limit = Math.min(Math.max(Number(q.limit) || 10, 1), 60);
    const offset = Math.max(Number(q.offset) || 0, 0);

    // Page of distinct days, newest first (fetch one extra to detect hasMore).
    const dayRows = await prisma.$queryRaw<Array<{ day: Date }>>`
      SELECT DISTINCT "day" FROM "LlmUsageDaily" ORDER BY "day" DESC LIMIT ${limit + 1} OFFSET ${offset}
    `;
    const hasMore = dayRows.length > limit;
    const pageDays = dayRows.slice(0, limit).map((r) => r.day);

    const rows = pageDays.length
      ? await prisma.llmUsageDaily.findMany({
          where: { day: { in: pageDays } },
          orderBy: [{ day: 'desc' }, { costUsd: 'desc' }],
        })
      : [];

    // All-time totals — the top-line numbers reflect everything, not the page.
    const agg = await prisma.llmUsageDaily.aggregate({
      _sum: { calls: true, inputTokens: true, outputTokens: true, costUsd: true },
    });

    const byDay = new Map<
      string,
      {
        date: string;
        calls: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        breakdown: Array<{
          model: string;
          operation: string;
          calls: number;
          inputTokens: number;
          outputTokens: number;
          costUsd: number;
        }>;
      }
    >();

    for (const r of rows) {
      const date = r.day.toISOString().slice(0, 10);
      const cost = Number(r.costUsd);
      let d = byDay.get(date);
      if (!d) {
        d = { date, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, breakdown: [] };
        byDay.set(date, d);
      }
      d.calls += r.calls;
      d.inputTokens += r.inputTokens;
      d.outputTokens += r.outputTokens;
      d.costUsd += cost;
      d.breakdown.push({
        model: r.model,
        operation: r.operation,
        calls: r.calls,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: cost,
      });
    }

    // Round money to cents-ish for stable display (keep 4 dp for tiny costs).
    const round = (n: number) => Math.round(n * 10_000) / 10_000;
    const days = [...byDay.values()].map((d) => ({
      ...d,
      costUsd: round(d.costUsd),
      breakdown: d.breakdown.map((b) => ({ ...b, costUsd: round(b.costUsd) })),
    }));
    const totals = {
      calls: agg._sum.calls ?? 0,
      inputTokens: agg._sum.inputTokens ?? 0,
      outputTokens: agg._sum.outputTokens ?? 0,
      costUsd: round(Number(agg._sum.costUsd ?? 0)),
    };
    return { days, hasMore, totals };
  });

  // Poll a scan: status, findings, and score once computed. The screenshot/
  // thumbnail bytes are served by dedicated endpoints, never inlined here.
  app.get('/scans/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: { findings: true, score: true, target: true },
    });
    if (!scan) return reply.code(404).send({ error: 'scan not found' });
    const { screenshot, thumbnail, ...rest } = scan;
    return { ...rest, hasScreenshot: screenshot != null, hasThumbnail: thumbnail != null };
  });

  // Scan screenshot + thumbnail (JPEG bytes). Best-effort artifacts, so 404
  // when absent — the UI renders <img onError> and simply hides it.
  app.get('/scans/:id/screenshot', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await prisma.scan.findUnique({ where: { id }, select: { screenshot: true } });
    if (!row?.screenshot) return reply.code(404).send({ error: 'no image' });
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(Buffer.from(row.screenshot));
  });

  app.get('/scans/:id/thumbnail', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await prisma.scan.findUnique({ where: { id }, select: { thumbnail: true } });
    if (!row?.thumbnail) return reply.code(404).send({ error: 'no image' });
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.send(Buffer.from(row.thumbnail));
  });

  // Single-page, self-contained HTML report for a scan (download).
  app.get('/scans/:id/report', async (req, reply) => {
    const { id } = req.params as { id: string };
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: { findings: true, score: true, target: true },
    });
    if (!scan) return reply.code(404).send({ error: 'scan not found' });
    const html = buildHtmlReport(scan as unknown as ReportScan);
    const safeName = (scan.target.name || scan.target.value)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="qa-prism-${safeName || 'scan'}.html"`);
    return reply.send(html);
  });

  // Delete a scan (its findings + score cascade via the schema).
  app.delete('/scans/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await prisma.scan.delete({ where: { id } });
    } catch {
      return reply.code(404).send({ error: 'scan not found' });
    }
    return reply.code(204).send();
  });

  return app;
}
