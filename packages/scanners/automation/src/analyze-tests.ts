import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { makeFindingCode, type Finding, type Severity } from '@qa-prism/core';
import { AUTOMATION_CONFIG, JS_TS_RE } from './config.js';

function mk(
  scanId: string,
  slug: string,
  severity: Severity,
  title: string,
  description: string,
  remediation: string,
  path: string,
  line: number | undefined,
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
    location: { path, line },
    remediation,
    tags: ['automation', ...tags],
    evidence,
    createdAt: new Date().toISOString(),
  };
}

/** Dotted callee name, e.g. `page.waitForTimeout`, `expect`, `cy.get`. */
function exprName(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return `${exprName(expr.expression)}.${expr.name.text}`;
  if (ts.isCallExpression(expr)) return exprName(expr.expression);
  return '';
}

const TEST_CALLS = /^(it|test|specify)(\.(only|skip|each|failing))?$/;
function isTestCall(name: string): boolean {
  return TEST_CALLS.test(name);
}
function isAssertion(name: string): boolean {
  return (
    name === 'expect' ||
    name === 'assert' ||
    name.startsWith('assert.') ||
    name === 'should' ||
    name.endsWith('.should')
  );
}

/** A CSS selector deep enough to be brittle (2+ child combinators or nth-child). */
function isDeepCss(v: string): boolean {
  const combinators = (v.match(/>/g) ?? []).length;
  return combinators >= 2 || /:nth-child\(/.test(v);
}
function isXpath(v: string): boolean {
  return v.startsWith('//') || v.startsWith('(//') || v.startsWith('.//');
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (path.endsWith('.js') || path.endsWith('.cjs') || path.endsWith('.mjs')) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function analyzeJsTs(scanId: string, abs: string, rel: string, source: string): Finding[] {
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, scriptKind(abs));
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  let testCount = 0;
  let assertionCount = 0;
  const waits: number[] = [];
  const brittle: Array<{ selector: string; line: number }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = exprName(node.expression);
      if (isTestCall(name)) testCount += 1;
      if (isAssertion(name)) assertionCount += 1;
      const isNumericFirstArg =
        node.arguments.length > 0 && ts.isNumericLiteral(node.arguments[0]!);
      if (
        name.endsWith('waitForTimeout') ||
        name === 'sleep' ||
        name.endsWith('.sleep') ||
        (name === 'cy.wait' && isNumericFirstArg)
      ) {
        waits.push(lineOf(node));
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text) {
      const v = node.text;
      if (isXpath(v) || isDeepCss(v)) brittle.push({ selector: v, line: lineOf(node) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const findings: Finding[] = [];
  if (testCount > 0 && assertionCount === 0) {
    findings.push(
      mk(
        scanId,
        'no-assertions',
        'high',
        `Test file has ${testCount} test(s) but no assertions`,
        'Tests that never assert can pass without verifying anything.',
        'Add expect()/assert calls that verify the behaviour under test.',
        rel,
        undefined,
        { testCount },
        ['no-assertions'],
      ),
    );
  }
  if (waits.length > 0) {
    findings.push(
      mk(
        scanId,
        'hardcoded-wait',
        'medium',
        `Hardcoded wait used ${waits.length} time(s)`,
        'Fixed sleeps make tests slow and flaky; they wait too long or not long enough.',
        'Replace fixed waits with condition-based waits (web-first assertions, waitFor state).',
        rel,
        waits[0],
        { lines: waits.slice(0, AUTOMATION_CONFIG.maxExamples), count: waits.length },
        ['hardcoded-wait', 'flaky-risk'],
      ),
    );
  }
  if (brittle.length > 0) {
    findings.push(
      mk(
        scanId,
        'brittle-selector',
        'medium',
        `Brittle selector used ${brittle.length} time(s)`,
        'XPath and deep CSS selectors break when markup changes; prefer data-testid or roles.',
        'Select by data-testid or ARIA role (getByRole/getByTestId) instead.',
        rel,
        brittle[0]!.line,
        {
          examples: brittle
            .slice(0, AUTOMATION_CONFIG.maxExamples)
            .map((b) => ({ selector: b.selector, line: b.line })),
          count: brittle.length,
        },
        ['brittle-selector', 'flaky-risk'],
      ),
    );
  }
  return findings;
}

/** Regex heuristics for languages we don't AST-parse (spec §6.4). */
function analyzeOther(scanId: string, rel: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const hasTest = /\b(def test_|@Test|void test|func Test)/.test(source);
  const hasAssert = /\b(assert|assertEquals|assertThat|assertTrue|expect)\b/.test(source);
  if (hasTest && !hasAssert) {
    findings.push(
      mk(
        scanId,
        'no-assertions',
        'high',
        'Test file appears to have tests but no assertions',
        'Tests that never assert can pass without verifying anything.',
        'Add assertions that verify the behaviour under test.',
        rel,
        undefined,
        { heuristic: true },
        ['no-assertions'],
      ),
    );
  }
  const sleeps = source.match(/\b(time\.sleep|Thread\.sleep|sleep)\s*\(/g);
  if (sleeps) {
    findings.push(
      mk(
        scanId,
        'hardcoded-wait',
        'medium',
        `Hardcoded wait used ${sleeps.length} time(s)`,
        'Fixed sleeps make tests slow and flaky.',
        'Replace fixed sleeps with condition-based waits.',
        rel,
        undefined,
        { count: sleeps.length },
        ['hardcoded-wait', 'flaky-risk'],
      ),
    );
  }
  if (/["'(]\/\//.test(source) || /By\.xpath|\.xpath\(/.test(source)) {
    findings.push(
      mk(
        scanId,
        'brittle-selector',
        'medium',
        'Brittle XPath selector detected',
        'XPath selectors break when markup changes; prefer stable ids or roles.',
        'Select by a stable id/testid or accessibility role instead.',
        rel,
        undefined,
        { heuristic: true },
        ['brittle-selector', 'flaky-risk'],
      ),
    );
  }
  return findings;
}

/** Static-analyze one test file into automation findings. Never throws. */
export function analyzeTestFile(scanId: string, abs: string, repoPath: string): Finding[] {
  let source: string;
  try {
    source = readFileSync(abs, 'utf8');
  } catch {
    return [];
  }
  const rel = relative(repoPath, abs) || abs;
  return JS_TS_RE.test(abs)
    ? analyzeJsTs(scanId, abs, rel, source)
    : analyzeOther(scanId, rel, source);
}
