import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { automationScanner } from './scan.js';

let repo: string;

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'qa-automation-'));
  mkdirSync(join(repo, 'tests'), { recursive: true });

  // Test with no assertions.
  writeFileSync(
    join(repo, 'tests', 'smoke.spec.ts'),
    `import { test } from '@playwright/test';
test('loads home', async ({ page }) => { await page.goto('/'); });`,
  );

  // Test with a hardcoded wait and an XPath selector (but it does assert).
  writeFileSync(
    join(repo, 'tests', 'cart.spec.ts'),
    `import { test, expect } from '@playwright/test';
test('cart', async ({ page }) => {
  await page.waitForTimeout(3000);
  await page.locator('//div[@id="cart"]//button').click();
  expect(await page.title()).toBe('Cart');
});`,
  );

  // JUnit report with a flaky (Surefire flakyFailure), a skipped, and a slow test.
  writeFileSync(
    join(repo, 'junit.xml'),
    `<?xml version="1.0"?>
<testsuites><testsuite name="suite" tests="3">
  <testcase name="stable" time="1.0"/>
  <testcase name="wobbly" time="2.0"><flakyFailure message="timeout">stack</flakyFailure></testcase>
  <testcase name="slowpoke" time="45.0"/>
  <testcase name="ignored"><skipped/></testcase>
</testsuite></testsuites>`,
  );
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('automationScanner', () => {
  it('flags a spec with no assertions', async () => {
    const findings = await automationScanner({ scanId: 'a1', target: { kind: 'repo', value: repo } });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('automation.no-assertions');
    expect(findings.every((f) => f.pillar === 'automation')).toBe(true);
  });

  it('flags flaky, hardcoded waits, brittle selectors, skipped and slow tests', async () => {
    const findings = await automationScanner({ scanId: 'a1', target: { kind: 'repo', value: repo } });
    const codes = new Set(findings.map((f) => f.code));
    expect(codes.has('automation.flaky')).toBe(true);
    expect(codes.has('automation.hardcoded-wait')).toBe(true);
    expect(codes.has('automation.brittle-selector')).toBe(true);
    expect(codes.has('automation.skipped')).toBe(true);
    expect(codes.has('automation.slow')).toBe(true);
  });

  it('works from report artifacts alone (url target + options.reportPaths)', async () => {
    const findings = await automationScanner({
      scanId: 'a1',
      target: { kind: 'url', value: 'https://example.com' },
      options: { reportPaths: [join(repo, 'junit.xml')] },
    });
    expect(findings.map((f) => f.code)).toContain('automation.flaky');
  });

  it('degrades gracefully with no repo and no reports', async () => {
    const findings = await automationScanner({
      scanId: 'a1',
      target: { kind: 'url', value: 'https://example.com' },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('automation.no-input');
    expect(findings[0]!.severity).toBe('info');
  });
});
