import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { makeFindingCode, type Finding, type Severity } from '@qa-prism/core';
import { AUTOMATION_CONFIG } from './config.js';

interface TestCase {
  '@_name'?: string;
  '@_classname'?: string;
  '@_time'?: string | number;
  skipped?: unknown;
  flakyFailure?: unknown;
  flakyError?: unknown;
  rerunFailure?: unknown;
  rerunError?: unknown;
}
interface TestSuite {
  testcase?: TestCase[];
}

function mk(
  scanId: string,
  slug: string,
  severity: Severity,
  title: string,
  description: string,
  remediation: string,
  path: string,
  evidence: Record<string, unknown>,
  tags: string[],
): Finding {
  return {
    id: randomUUID(),
    scanId,
    pillar: 'automation',
    severity,
    code: makeFindingCode('automation', slug),
    title,
    description,
    location: { path },
    remediation,
    tags: ['automation', ...tags],
    evidence,
    createdAt: new Date().toISOString(),
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'testsuite' || name === 'testcase',
});

function hasChild(tc: TestCase, key: keyof TestCase): boolean {
  return tc[key] !== undefined;
}

const caseName = (tc: TestCase): string =>
  tc['@_name'] ?? tc['@_classname'] ?? 'unnamed test';

/** Parse a JUnit-style XML report into automation findings. Never throws. */
export function parseReportFile(scanId: string, path: string): Finding[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return [];
  }

  const suitesRoot = doc.testsuites as { testsuite?: TestSuite[] } | undefined;
  const suites: TestSuite[] =
    suitesRoot?.testsuite ?? (doc.testsuite as TestSuite[] | undefined) ?? [];
  const cases: TestCase[] = suites.flatMap((s) => s.testcase ?? []);

  const findings: Finding[] = [];
  const flaky: string[] = [];
  const skipped: string[] = [];
  const slow: Array<{ name: string; seconds: number }> = [];

  for (const tc of cases) {
    const isFlaky =
      hasChild(tc, 'flakyFailure') ||
      hasChild(tc, 'flakyError') ||
      hasChild(tc, 'rerunFailure') ||
      hasChild(tc, 'rerunError');
    if (isFlaky) flaky.push(caseName(tc));
    if (hasChild(tc, 'skipped')) skipped.push(caseName(tc));
    const seconds = Number(tc['@_time'] ?? 0);
    if (Number.isFinite(seconds) && seconds > AUTOMATION_CONFIG.slowTestSeconds) {
      slow.push({ name: caseName(tc), seconds });
    }
  }

  for (const name of flaky.slice(0, AUTOMATION_CONFIG.maxExamples)) {
    findings.push(
      mk(
        scanId,
        'flaky',
        'medium',
        `Flaky test: ${name}`,
        'This test failed then passed on retry — a flaky result that erodes trust in the suite.',
        'Investigate the nondeterminism (timing, shared state, network) and stabilise it.',
        path,
        { test: name },
        ['flaky', 'flaky-risk'],
      ),
    );
  }
  if (skipped.length > 0) {
    findings.push(
      mk(
        scanId,
        'skipped',
        'low',
        `${skipped.length} skipped test(s)`,
        'Skipped tests provide no coverage and can hide regressions if left indefinitely.',
        'Re-enable or delete long-skipped tests.',
        path,
        { count: skipped.length, tests: skipped.slice(0, AUTOMATION_CONFIG.maxExamples) },
        ['skipped'],
      ),
    );
  }
  if (slow.length > 0) {
    findings.push(
      mk(
        scanId,
        'slow',
        'low',
        `${slow.length} slow test(s) (> ${AUTOMATION_CONFIG.slowTestSeconds}s)`,
        'Slow tests lengthen feedback loops and often signal missing waits or heavy setup.',
        'Profile and speed up the slowest tests; parallelise or mock heavy dependencies.',
        path,
        { slowest: slow.sort((a, b) => b.seconds - a.seconds).slice(0, AUTOMATION_CONFIG.maxExamples) },
        ['slow'],
      ),
    );
  }

  return findings;
}
