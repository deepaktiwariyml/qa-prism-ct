import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { securityScanner } from './scan.js';

const methods: string[] = [];
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    methods.push(req.method ?? '?');
    // No security headers; a cookie with no Secure/HttpOnly/SameSite.
    res.setHeader('Set-Cookie', 'sid=abc123; Path=/');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>insecure</title>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('securityScanner', () => {
  it('flags missing headers with the exact header in the code', async () => {
    const findings = await securityScanner({
      scanId: 's1',
      target: { kind: 'url', value: baseUrl },
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('sec.missing-hsts');
    expect(codes).toContain('sec.missing-csp');
    expect(findings.every((f) => f.pillar === 'security')).toBe(true);
    const hsts = findings.find((f) => f.code === 'sec.missing-hsts')!;
    expect(hsts.severity).toBe('high');
  });

  it('flags an insecure cookie (no Secure/HttpOnly/SameSite)', async () => {
    const findings = await securityScanner({
      scanId: 's1',
      target: { kind: 'url', value: baseUrl },
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('sec.cookie-insecure');
    expect(codes).toContain('sec.cookie-no-httponly');
    expect(codes).toContain('sec.cookie-no-samesite');
  });

  it('performs only non-state-changing GET requests', async () => {
    methods.length = 0;
    await securityScanner({ scanId: 's1', target: { kind: 'url', value: baseUrl } });
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === 'GET')).toBe(true);
  });

  it('returns a single info finding when the target is unreachable', async () => {
    const findings = await securityScanner({
      scanId: 's1',
      target: { kind: 'url', value: 'http://127.0.0.1:1/' },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('info');
  });

  it('returns nothing for a repo target', async () => {
    const findings = await securityScanner({ scanId: 's1', target: { kind: 'repo', value: '/x' } });
    expect(findings).toEqual([]);
  });
});
