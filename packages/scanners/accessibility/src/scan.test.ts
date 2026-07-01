import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { accessibilityScanner } from './scan.js';

// A minimal page with a known WCAG violation: an <img> with no alt attribute
// (axe rule `image-alt`). Served for every path so the crawl has a link too.
const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Fixture</title></head>
  <body>
    <main>
      <h1>Fixture page</h1>
      <img src="/logo.png" />
      <a href="/other">Other page</a>
    </main>
  </body>
</html>`;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('accessibilityScanner', () => {
  it('produces an a11y.image-alt finding for a missing-alt image', async () => {
    const findings = await accessibilityScanner({
      scanId: 'scan_test',
      target: { kind: 'url', value: baseUrl },
    });

    const imageAlt = findings.find((f) => f.code === 'a11y.image-alt');
    expect(imageAlt, 'expected an a11y.image-alt finding').toBeDefined();
    expect(imageAlt!.pillar).toBe('accessibility');
    expect(imageAlt!.severity).toBe('critical'); // axe impact "critical" → rubric critical
    expect(imageAlt!.location.selector).toContain('img');
    expect(imageAlt!.remediation).toContain('http'); // help URL included
    expect(imageAlt!.location.path).toBe(baseUrl);
  });

  it('returns a single info finding for an unreachable target and never throws', async () => {
    const findings = await accessibilityScanner({
      scanId: 'scan_test',
      target: { kind: 'url', value: 'http://127.0.0.1:1/' },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe('a11y.page-load-failed');
    expect(findings[0]!.severity).toBe('info');
  });

  it('returns no findings for a repo target (not applicable)', async () => {
    const findings = await accessibilityScanner({
      scanId: 'scan_test',
      target: { kind: 'repo', value: '/tmp/some-repo' },
    });
    expect(findings).toEqual([]);
  });
});
