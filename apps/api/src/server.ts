import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { SelectionSchema } from '@qa-prism/core';
import { getPrisma, Prisma } from '@qa-prism/db';
import { generate, loadRegistry, zipDir } from '@qa-prism/generator';
import { analyzePr } from '@qa-prism/impact-analyser';
import { createLlmClient } from '@qa-prism/llm';
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
});

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

/** Attach existing-finding ids that overlap an impact area's files/name. */
function crossLinkFindings(
  area: { name: string; relatedFiles: string[] },
  findings: Array<{ id: string; tags: string[]; location: unknown }>,
): string[] {
  const files = area.relatedFiles.map((f) => f.toLowerCase());
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
    const areas = result.areas.map((a) => ({
      ...a,
      relatedFindingIds: crossLinkFindings(a, findings),
    }));

    const report = await prisma.impactReport.create({
      data: {
        targetId: target.id,
        prUrl: parsed.data.prUrl,
        prNumber: result.prNumber,
        status: 'done',
        areas: areas as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: report.id,
      prUrl: parsed.data.prUrl,
      prNumber: result.prNumber,
      repo: value,
      title: result.title,
      areas,
      limitations: result.limitations,
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
      const result = await llm.completeJSON({
        system:
          'You are a senior QA engineer. Given a feature or requirement, produce a COMPREHENSIVE set of clear, ONE-LINE manual test cases a tester can execute — generate as many distinct, valuable cases as the feature warrants (commonly 25–60+ for a non-trivial feature; do not artificially limit the count). Each title is a single concise sentence (imperative, no numbering, no steps). Classify each as "positive" (happy path / valid), "negative" (invalid input, errors, auth/permission failures), or "edge" (boundaries, limits, concurrency, unusual states). Cover all three thoroughly.',
        prompt: `${context ? `Context: ${context}\n\n` : ''}Description:\n${description}\n\nReturn JSON: {"testcases":[{"title":"...","type":"positive|negative|edge"}, ...]}.`,
        schema,
      });
      const testcases = result.testcases
        .map((t) => ({ title: t.title.replace(/^\s*[-*\d.)]+\s*/, '').trim(), type: t.type }))
        .filter((t) => t.title.length > 0)
        .slice(0, 200);
      return { testcases };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
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
      const result = await llm.completeJSON({
        model: FAST_MODEL,
        system:
          'You are a senior QA engineer filling in a test-case table. For each test case (a fixed one-line title you must NOT change or restate) and each requested column, produce a concise, useful cell value inferred from the column name (e.g. "Priority" -> High/Medium/Low; "Preconditions", "Test Steps", "Expected Result", "Test Data" -> a short phrase or sentence). Return JSON with a `rows` matrix where rows[i] is the array of cell values for test case i, one value per column in the exact given order.',
        prompt: `Columns (in order): ${JSON.stringify(columns)}\n\nTest cases:\n${numbered}\n\nReturn JSON: {"rows":[["col1 value","col2 value", ...], ...]} with exactly ${testcases.length} rows and ${columns.length} values each.`,
        schema,
      });
      // Normalize to an exact testcases × columns matrix (pad/truncate).
      const rows = testcases.map((_, i) => {
        const row = result.rows[i] ?? [];
        return columns.map((__, j) => String(row[j] ?? ''));
      });
      return { rows };
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
      const result = await llm.completeJSON({
        system:
          'You are a senior QA engineer. Merge the given manual test cases into ONE coherent, concise one-line test case that preserves their combined intent and important checks. Imperative, no numbering. Classify it as positive, negative, or edge.',
        prompt: `Combine these test cases into one:\n${parsed.data.testcases.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nReturn JSON: {"title":"...","type":"positive|negative|edge"}.`,
        schema,
      });
      return { title: result.title.replace(/^\s*[-*\d.)]+\s*/, '').trim(), type: result.type };
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
      const schema = z.object({ explanation: z.string().min(1) });
      const result = await llm.completeJSON({
        system:
          'You are a senior QA engineer. Given a one-line manual test case, explain it clearly and practically for a tester: what it verifies, any preconditions, the steps to execute, and the expected result. Keep it concise and well-structured (a short paragraph or a few labelled lines). Return plain text in "explanation".',
        prompt: `Explain this test case:\n"${parsed.data.testcase}"\n\nReturn JSON: {"explanation":"..."}.`,
        schema,
      });
      return { explanation: result.explanation };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
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
