import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generate } from './generate.js';
import { loadRegistry } from './registry.js';
import { resolve } from './resolve.js';
import { zipDir } from './pack.js';

describe('generator', () => {
  it('lists all registry cells', async () => {
    const index = await loadRegistry();
    const ids = index.cells.map((c) => c.id);
    expect(ids).toContain('playwright-ts');
    expect(index.cells.length).toBeGreaterThanOrEqual(6);
  });

  it('generates a Playwright TS framework into a temp dir', async () => {
    const result = await generate({
      platform: 'web-api',
      language: 'typescript',
      framework: 'playwright',
      reporter: 'allure',
      projectName: 'demo-suite',
      webBaseUrl: 'https://example.com',
    });
    expect(result.matched).toBe(true);
    expect(result.rootName).toBe('demo-suite');
    const entries = await readdir(result.outDir!);
    expect(entries).toContain('package.json');
    expect(entries).toContain('playwright.config.ts');
  });

  it('zips a generated framework into a non-empty buffer', async () => {
    const result = await generate({
      platform: 'web',
      language: 'typescript',
      framework: 'playwright',
      reporter: 'html',
    });
    const buf = await zipDir(result.outDir!, result.rootName!);
    expect(buf.length).toBeGreaterThan(500);
    // PK zip magic bytes.
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('returns matched:false with a reason for an unknown stack', async () => {
    const result = await resolve({
      platform: 'web',
      language: 'typescript',
      framework: 'nightwatch',
      reporter: 'html',
    });
    expect(result.matched).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});
