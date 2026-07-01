import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { PERF_THRESHOLDS, severityForMetric } from './config.js';
import { performanceScanner } from './scan.js';

describe('severityForMetric', () => {
  it('maps values onto the rubric via thresholds', () => {
    expect(severityForMetric(1000, PERF_THRESHOLDS.lcp!)).toBe('info');
    expect(severityForMetric(3000, PERF_THRESHOLDS.lcp!)).toBe('medium');
    expect(severityForMetric(5000, PERF_THRESHOLDS.lcp!)).toBe('high');
  });

  it('exposes all thresholds in one config object', () => {
    expect(Object.keys(PERF_THRESHOLDS).sort()).toEqual(['cls', 'jsBundle', 'lcp', 'tbt', 'tti']);
  });
});

describe('performanceScanner', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html lang="en"><head><title>Perf</title></head><body><h1>Hi</h1></body></html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it(
    'measures Core Web Vitals and emits a report finding with values in evidence',
    async () => {
      const findings = await performanceScanner({
        scanId: 'p1',
        target: { kind: 'url', value: baseUrl },
      });
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f) => f.pillar === 'performance')).toBe(true);
      const report = findings.find((f) => f.code === 'perf.report');
      expect(report, 'expected a perf.report summary finding').toBeDefined();
      const measured = report!.evidence?.measured as Record<string, number>;
      expect(typeof measured.lcp).toBe('number');
    },
    180_000,
  );

  it('returns nothing for a repo target', async () => {
    const findings = await performanceScanner({ scanId: 'p1', target: { kind: 'repo', value: '/x' } });
    expect(findings).toEqual([]);
  });
});
