import type { Finding, Location, Scanner, ScanContext } from '@qa-prism/core';
import { getPrisma, Prisma } from '@qa-prism/db';
import { scoreScan } from '@qa-prism/scoring';
import { accessibilityScanner } from '@qa-prism/scanner-accessibility';
import { performanceScanner } from '@qa-prism/scanner-performance';
import { securityScanner } from '@qa-prism/scanner-security';
import { automationScanner } from '@qa-prism/scanner-automation';
import type { ScanJobData } from './queue.js';

/** All four pillar scanners. Each no-ops for target kinds it doesn't handle. */
const SCANNERS: Scanner[] = [
  accessibilityScanner,
  performanceScanner,
  securityScanner,
  automationScanner,
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
    const ctx: ScanContext = { scanId: data.scanId, target: data.target, options: data.options };
    const results = await Promise.all(SCANNERS.map((scan) => scan(ctx)));
    const findings = results.flat();

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
