import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { Finding, ScanContext, Scanner } from '@qa-prism/core';
import { analyzeTestFile } from './analyze-tests.js';
import { discover } from './discover.js';
import { parseReportFile } from './parse-reports.js';

/** Resolve the repo path from the target (kind=repo) or ctx.options.repoPath. */
function resolveRepoPath(ctx: ScanContext): string | undefined {
  if (ctx.target.kind === 'repo') return ctx.target.value;
  const fromOptions = ctx.options?.repoPath;
  return typeof fromOptions === 'string' ? fromOptions : undefined;
}

/** Explicit report file paths passed via options (optional). */
function resolveReportPaths(ctx: ScanContext): string[] {
  const raw = ctx.options?.reportPaths;
  return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
}

function infoFinding(scanId: string, title: string, description: string): Finding {
  return {
    id: randomUUID(),
    scanId,
    pillar: 'automation',
    severity: 'info',
    code: 'automation.no-input',
    title,
    description,
    location: { path: '(no test suite provided)' },
    remediation: 'Provide a repo path (repo target or options.repoPath) or report artifacts.',
    tags: ['automation', 'scan-info'],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Automation-health scanner (spec §6.4). Statically analyses test files and
 * ingests JUnit-style reports. Degrades gracefully when only one input is
 * available and never throws.
 */
export const automationScanner: Scanner = async (ctx: ScanContext): Promise<Finding[]> => {
  const repoPath = resolveRepoPath(ctx);
  const explicitReports = resolveReportPaths(ctx);

  if (!repoPath && explicitReports.length === 0) {
    // Nothing to analyse — surface it as info, not an error.
    return [infoFinding(ctx.scanId, 'No test suite available to analyse', 'No repo path or report artifacts were provided for automation-health analysis.')];
  }

  const findings: Finding[] = [];

  if (repoPath && existsSync(repoPath)) {
    const { testFiles, reportFiles } = discover(repoPath);
    for (const file of testFiles) findings.push(...analyzeTestFile(ctx.scanId, file, repoPath));
    for (const report of reportFiles) findings.push(...parseReportFile(ctx.scanId, report));
  }

  for (const report of explicitReports) {
    if (existsSync(report)) findings.push(...parseReportFile(ctx.scanId, report));
  }

  return findings;
};
