import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { SelectionSchema } from '@qa-prism/core';
import { getPrisma, Prisma } from '@qa-prism/db';
import { generate, loadRegistry, zipDir } from '@qa-prism/generator';
import { analyzePr } from '@qa-prism/impact-analyser';
import type { Queue } from 'bullmq';
import type { ScanJobData } from './queue.js';
import {
  BROWSER_VIEWPORT,
  captureAndClose,
  closeBrowserSession,
  createBrowserSession,
  currentUrl,
  forwardInput,
  screenshot,
  type InputEvent,
} from './browser-session.js';

const BrowserCreateBody = z.object({ url: z.string().min(1) });
const InputBody = z.object({
  type: z.enum(['click', 'move', 'scroll', 'text', 'key']),
  x: z.number().optional(),
  y: z.number().optional(),
  deltaY: z.number().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
});

const ImpactBody = z.object({
  prUrl: z.string().min(1),
  githubToken: z.string().optional(),
});

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

const CreateScanBody = z.object({
  name: z.string().optional(),
  target: z.object({
    kind: z.enum(['url', 'repo']),
    value: z.string().min(1),
  }),
  options: z.record(z.string(), z.unknown()).optional(),
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

  // Recent scans for the dashboard home (target + overall score).
  app.get('/scans', async () => {
    return prisma.scan.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { target: true, score: { select: { overall: true } } },
    });
  });

  // Trigger a scan: find-or-create the Target, create a queued Scan, enqueue it.
  app.post('/scans', async (req, reply) => {
    const parsed = CreateScanBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues });
    }
    const { target, name, options } = parsed.data;

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
    await queue.add('scan', { scanId: scan.id, target, options });

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

  // Poll a scan: status, findings, and score once computed.
  app.get('/scans/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: { findings: true, score: true, target: true },
    });
    if (!scan) return reply.code(404).send({ error: 'scan not found' });
    return scan;
  });

  // Interactive browser session: launch a real browser the user can drive
  // (log in), then CONFIRM scans that exact authenticated session.
  app.post('/browser', async (req, reply) => {
    const parsed = BrowserCreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const session = await createBrowserSession(parsed.data.url);
    return { ...session, ...BROWSER_VIEWPORT };
  });

  app.get('/browser/:id/screenshot', async (req, reply) => {
    const { id } = req.params as { id: string };
    const png = await screenshot(id);
    if (!png) return reply.code(404).send({ error: 'session not found' });
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'no-store');
    return reply.send(png);
  });

  app.post('/browser/:id/input', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = InputBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid input' });
    const ok = await forwardInput(id, parsed.data as InputEvent);
    if (!ok) return reply.code(404).send({ error: 'session not found' });
    return { ok: true, url: currentUrl(id) };
  });

  app.get('/browser/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const url = currentUrl(id);
    if (url === null) return reply.code(404).send({ error: 'session not found' });
    return { url };
  });

  app.post('/browser/:id/confirm', async (req, reply) => {
    const { id } = req.params as { id: string };
    const captured = await captureAndClose(id);
    if (!captured) return reply.code(404).send({ error: 'session not found' });

    const existing = await prisma.target.findFirst({
      where: { kind: 'url', value: captured.url },
    });
    const targetRow =
      existing ??
      (await prisma.target.create({
        data: { name: captured.url, kind: 'url', value: captured.url },
      }));
    const scan = await prisma.scan.create({ data: { targetId: targetRow.id, status: 'queued' } });
    await queue.add('scan', {
      scanId: scan.id,
      target: { kind: 'url', value: captured.url },
      // Authenticated scan: reuse the logged-in session; only the pillars that
      // cleanly use it (Lighthouse re-navigates, so performance is skipped).
      options: {
        storageState: captured.storageState as unknown as Record<string, unknown>,
        only: ['accessibility', 'security'],
      },
    });
    return reply.code(202).send({ scanId: scan.id, url: captured.url });
  });

  app.delete('/browser/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await closeBrowserSession(id);
    return reply.code(204).send();
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
