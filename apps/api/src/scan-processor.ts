import type { Finding, Location, Pillar, Scanner, ScanContext } from '@qa-prism/core';
import { getPrisma, Prisma } from '@qa-prism/db';
import { scoreScan } from '@qa-prism/scoring';
import { accessibilityScanner } from '@qa-prism/scanner-accessibility';
import { performanceScanner } from '@qa-prism/scanner-performance';
import { securityScanner } from '@qa-prism/scanner-security';
import { automationScanner } from '@qa-prism/scanner-automation';
import { randomUUID } from 'node:crypto';
import { captureScreenshot } from './capture.js';
import { performLogin, type LoginRecipe } from './login.js';
import type { ScanJobData } from './queue.js';

/** Auth block a caller may attach to options for a scripted-login scan. */
interface AuthOptions extends LoginRecipe {
  loginUrl?: string;
  username: string;
  password: string;
}

function loginFailedFinding(scanId: string, message: string): Finding {
  return {
    id: randomUUID(),
    scanId,
    pillar: 'security',
    severity: 'high',
    code: 'auth.login-failed',
    title: 'Authenticated scan could not log in',
    description: `The scripted login step failed, so the target was not scanned while authenticated: ${message}`,
    location: { path: 'login' },
    remediation:
      'Check the credentials and login URL. If the form is unusual, provide username/password/submit selectors for this target, or use an interactive session.',
    tags: ['auth', 'scan-error'],
    evidence: { message },
    createdAt: new Date().toISOString(),
  };
}

/** All four pillar scanners. Each no-ops for target kinds it doesn't handle. */
const SCANNERS: Array<{ pillar: Pillar; scan: Scanner }> = [
  { pillar: 'accessibility', scan: accessibilityScanner },
  { pillar: 'performance', scan: performanceScanner },
  { pillar: 'security', scan: securityScanner },
  { pillar: 'automation', scan: automationScanner },
];

type FindingRow = Awaited<ReturnType<ReturnType<typeof getPrisma>['finding']['findMany']>>[number];

function toJson(value: unknown): Prisma.InputJsonValue {
  // Findings only ever carry JSON-serializable data.
  return value as Prisma.InputJsonValue;
}

function rowToFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    scanId: row.scanId,
    pillar: row.pillar,
    severity: row.severity,
    code: row.code,
    title: row.title,
    description: row.description,
    location: row.location as Location,
    remediation: row.remediation,
    tags: row.tags,
    evidence: (row.evidence ?? undefined) as Record<string, unknown> | undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Run the registered scanners for a scan, persist their findings, aggregate a
 * score, and advance the scan's lifecycle. Scanners are pure producers; all DB
 * writes happen here (spec §2, §6).
 */
export async function processScan(data: ScanJobData): Promise<void> {
  const prisma = getPrisma();
  await prisma.scan.update({
    where: { id: data.scanId },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    let storageState = data.options?.storageState;
    let only = Array.isArray(data.options?.only) ? (data.options.only as string[]) : null;
    let injected: Finding[] = [];
    let skipScanners = false;

    // Scripted headless login: authenticate first, then reuse the session for
    // the pillars that cleanly use it. On failure, record a finding and finish
    // rather than scanning a logged-out page.
    const auth = data.options?.auth as AuthOptions | undefined;
    if (auth?.username && auth?.password && data.target.kind === 'url') {
      try {
        const result = await performLogin({
          loginUrl: auth.loginUrl || data.target.value,
          username: auth.username,
          password: auth.password,
          recipe: {
            usernameSelector: auth.usernameSelector,
            passwordSelector: auth.passwordSelector,
            submitSelector: auth.submitSelector,
          },
        });
        storageState = result.storageState as typeof storageState;
        only = only ?? ['accessibility', 'security'];
      } catch (err) {
        injected = [loginFailedFinding(data.scanId, err instanceof Error ? err.message : String(err))];
        skipScanners = true;
      }
    }

    const ctx: ScanContext = {
      scanId: data.scanId,
      target: data.target,
      options: { ...data.options, storageState },
    };
    const active = skipScanners
      ? []
      : only
        ? SCANNERS.filter((s) => only!.includes(s.pillar))
        : SCANNERS;

    // Run the scanners and, for URL targets, grab a screenshot of the (possibly
    // authenticated) page in parallel. Capture is best-effort and never throws.
    const capturePromise =
      !skipScanners && data.target.kind === 'url'
        ? captureScreenshot(data.target.value, storageState)
        : Promise.resolve(null);
    const [results, capture] = await Promise.all([
      Promise.all(active.map((s) => s.scan(ctx))),
      capturePromise,
    ]);
    const findings = [...injected, ...results.flat()];

    if (capture) {
      await prisma.scan.update({
        where: { id: data.scanId },
        data: { screenshot: capture.screenshot, thumbnail: capture.thumbnail },
      });
    }

    if (findings.length > 0) {
      await prisma.finding.createMany({
        data: findings.map((f) => ({
          id: f.id,
          scanId: f.scanId,
          pillar: f.pillar,
          severity: f.severity,
          code: f.code,
          title: f.title,
          description: f.description,
          location: toJson(f.location),
          remediation: f.remediation,
          tags: f.tags,
          evidence: f.evidence === undefined ? Prisma.JsonNull : toJson(f.evidence),
          createdAt: new Date(f.createdAt),
        })),
      });
    }

    // Score from everything persisted for this scan (idempotent via upsert).
    const rows = await prisma.finding.findMany({ where: { scanId: data.scanId } });
    const score = scoreScan(data.scanId, rows.map(rowToFinding));
    await prisma.scanScore.upsert({
      where: { scanId: data.scanId },
      create: {
        scanId: score.scanId,
        overall: score.overall,
        pillars: toJson(score.pillars),
        correlations: toJson(score.correlations),
        computedAt: new Date(score.computedAt),
      },
      update: {
        overall: score.overall,
        pillars: toJson(score.pillars),
        correlations: toJson(score.correlations),
        computedAt: new Date(score.computedAt),
      },
    });

    await prisma.scan.update({
      where: { id: data.scanId },
      data: { status: 'done', finishedAt: new Date() },
    });
  } catch (err) {
    await prisma.scan.update({
      where: { id: data.scanId },
      data: { status: 'failed', finishedAt: new Date() },
    });
    throw err;
  }
}
